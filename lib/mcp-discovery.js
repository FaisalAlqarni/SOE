/**
 * lib/mcp-discovery.js — systematic MCP discovery + reuse (design §6, but for
 * MCP servers/tools rather than skills/agents).
 *
 * soe is a HOST orchestrator: it should reuse ANY installed MCP by CAPABILITY,
 * not just the four named providers (graphify/codex/chrome-devtools/figma) it
 * has dedicated skills for. At run start the orchestrator enumerates the session
 * MCP tools (names of the form `mcp__<server>__<tool>`) and passes them here to
 * build a capability map, so a needed capability (docs/browser/graph/design/
 * database/search/email/calendar/storage/…) routes to a discovered MCP when one
 * exists, with a generic fallback to soe's native tools when none does.
 *
 * This module is PURE over the passed tool array — it does NOT read the session;
 * the orchestrator supplies the `[{ name, description? }]` list at runtime. No
 * fs, no I/O — so it is unit-testable in isolation, like `lib/escalation.js`.
 *
 * TWO derived views over the tool list:
 *   - servers: Map<server, { tools, capabilities:Set, access }> — per-server
 *     rollup (its tools, the capabilities it covers, and its read/write access:
 *     a server exposing both reversible reads and mutating writes is 'mixed').
 *   - byCapability: Map<capability, [{ server, tool, access }]> — the routing
 *     index: given a needed capability, which server/tool can serve it.
 *
 * Server parsing (the crux): an MCP tool name is `mcp__<server>__<tool>`. The
 * server segment may itself contain SINGLE underscores; only the DOUBLE
 * underscore `__` is a field separator. So: strip the leading `mcp__`, take
 * everything up to the NEXT `__` as the server, and the REST (which may contain
 * underscores) as the tool name.
 *
 * Read-vs-write posture (reuses soe's read-auto-use / write-confirm rule): a
 * tool whose leading verb implies mutation is 'write' (routed through the
 * confirm gate — `soe:soe-modes` / `lib/escalation.js` isIrreversible), else
 * 'read' (auto-usable + logged).
 */

/**
 * Capability inference table. Each capability maps to keyword tokens matched
 * (case-insensitively, substring) against `server + tool + description`. Ordered
 * so more-specific capabilities are checked before the generic ones; the FIRST
 * matching capability wins for a given tool. A tool matching none => 'other'.
 *
 * Covers at least: docs, browser, design, graph, database, search, email,
 * calendar, storage (design brief). More-specific data-domain capabilities
 * (email/calendar/storage/graph/database/design) are listed before the broad
 * `search` so e.g. Gmail's `search_threads` is `email`, not merely `search`.
 *
 * @type {Array<[string, string[]]>}
 */
const CAPABILITY_KEYWORDS = [
  ['docs', ['docs', 'documentation', 'library', 'reference']],
  ['browser', ['browser', 'page', 'navigate', 'screenshot', 'devtools', 'lighthouse']],
  ['design', ['figma', 'design']],
  ['graph', ['graph', 'knowledge-graph', 'query_graph', 'neighbors']],
  ['database', ['sql', 'postgres', 'db', 'query']],
  ['email', ['gmail', 'email', 'message', 'thread']],
  ['calendar', ['calendar', 'event']],
  ['storage', ['drive', 'file', 'upload', 'download']],
  ['search', ['search', 'web', 'fetch']],
];

/**
 * Verbs that imply a MUTATING (write / side-effecting) tool. A tool whose token
 * set intersects these is `write`; otherwise `read`. Matched token-wise against
 * the tool name split on `_`/`-`, so `create_draft` => write, `search_threads`
 * => read.
 */
const WRITE_VERBS = new Set([
  'create', 'update', 'delete', 'write', 'send', 'post', 'upload', 'set',
  'apply', 'rename', 'move', 'label', 'unlabel', 'rotate', 'authenticate',
  'complete', 'copy', 'respond', 'suggest', 'handle', 'drag', 'drop', 'fill',
  'click', 'type', 'press', 'emulate', 'resize', 'close', 'new', 'select',
]);

/** Normalize a value to a trimmed non-empty string, else ''. */
function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Parse an MCP tool name `mcp__<server>__<tool>` into { server, tool }, or null
 * if it is not a well-formed MCP tool name (missing `mcp__` prefix, or no `__`
 * separator after the server).
 *
 * @param {string} name
 * @returns {{server: string, tool: string} | null}
 */
function parseMcpName(name) {
  const raw = str(name);
  if (!raw.startsWith('mcp__')) return null;
  const afterPrefix = raw.slice('mcp__'.length);
  const sep = afterPrefix.indexOf('__'); // first double-underscore = server/tool split
  if (sep === -1) return null;
  const server = afterPrefix.slice(0, sep);
  const tool = afterPrefix.slice(sep + 2);
  if (!server || !tool) return null;
  return { server, tool };
}

/**
 * Infer read vs. write for a tool from its leading verb tokens.
 * @param {string} tool
 * @returns {'read'|'write'}
 */
function inferAccess(tool) {
  const tokens = str(tool).toLowerCase().split(/[_\-\s]+/).filter(Boolean);
  return tokens.some((t) => WRITE_VERBS.has(t)) ? 'write' : 'read';
}

/**
 * Infer the capability for a tool from server + tool + description keywords.
 * Returns the first matching capability, or 'other' when nothing matches.
 * @param {string} server
 * @param {string} tool
 * @param {string} description
 * @returns {string}
 */
function inferCapability(server, tool, description) {
  const hay = `${server} ${tool} ${description}`.toLowerCase();
  for (const [capability, tokens] of CAPABILITY_KEYWORDS) {
    if (tokens.some((token) => hay.includes(token))) return capability;
  }
  return 'other';
}

/**
 * Roll a set of per-tool accesses up to a server access:
 *   all read => 'read', all write => 'write', a mix => 'mixed'.
 * @param {Set<string>} accesses
 * @returns {'read'|'write'|'mixed'}
 */
function rollupAccess(accesses) {
  const hasRead = accesses.has('read');
  const hasWrite = accesses.has('write');
  if (hasRead && hasWrite) return 'mixed';
  return hasWrite ? 'write' : 'read';
}

/**
 * Classify the session's MCP tool list into per-server and per-capability views.
 *
 * PURE over the passed array; tolerant of empty/malformed input (never throws —
 * non-array input and malformed entries yield/skip to empty maps).
 *
 * @param {Array<{name?: string, description?: string}>} tools
 * @returns {{
 *   servers: Map<string, {tools: Array<{tool:string, access:'read'|'write', capability:string}>, capabilities: Set<string>, access: 'read'|'write'|'mixed'}>,
 *   byCapability: Map<string, Array<{server:string, tool:string, access:'read'|'write'}>>,
 * }}
 */
function classifyMcpTools(tools) {
  /** @type {Map<string, {tools: object[], capabilities: Set<string>, accesses: Set<string>}>} */
  const servers = new Map();
  /** @type {Map<string, Array<{server:string, tool:string, access:string}>>} */
  const byCapability = new Map();

  if (Array.isArray(tools)) {
    for (const item of tools) {
      if (!item || typeof item !== 'object') continue;
      const parsed = parseMcpName(item.name);
      if (!parsed) continue;

      const { server, tool } = parsed;
      const description = str(item.description);
      const access = inferAccess(tool);
      const capability = inferCapability(server, tool, description);

      if (!servers.has(server)) {
        servers.set(server, { tools: [], capabilities: new Set(), accesses: new Set() });
      }
      const s = servers.get(server);
      s.tools.push({ tool, access, capability });
      s.capabilities.add(capability);
      s.accesses.add(access);

      if (!byCapability.has(capability)) byCapability.set(capability, []);
      byCapability.get(capability).push({ server, tool, access });
    }
  }

  // Finalize the server rollup: replace the internal `accesses` set with the
  // read/write/mixed access verdict.
  const finalServers = new Map();
  for (const [server, s] of servers) {
    finalServers.set(server, {
      tools: s.tools,
      capabilities: s.capabilities,
      access: rollupAccess(s.accesses),
    });
  }

  return { servers: finalServers, byCapability };
}

/**
 * Return the best server/tool entry for a capability, or null if none covers it.
 *
 * "Best" prefers a READ entry (auto-usable without the confirm gate) over a
 * write one, so the safest reusable tool is surfaced first; within a tier input
 * order is preserved (deterministic).
 *
 * @param {{byCapability?: Map<string, Array<{server:string, tool:string, access:string}>>}} result
 * @param {string} capability
 * @returns {{server:string, tool:string, access:'read'|'write'} | null}
 */
function resolveCapability(result, capability) {
  if (!result || typeof result !== 'object') return null;
  const { byCapability } = result;
  if (!(byCapability instanceof Map)) return null;
  const entries = byCapability.get(str(capability));
  if (!entries || entries.length === 0) return null;
  const read = entries.find((e) => e.access === 'read');
  return read || entries[0];
}

export { classifyMcpTools, resolveCapability };
