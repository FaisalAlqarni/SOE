import { test } from 'node:test';
import assert from 'node:assert';

import { classifyMcpTools, resolveCapability } from '../lib/mcp-discovery.js';

// mcp-discovery.test.js — systematic MCP discovery + reuse (design §6, but for
// MCP servers/tools rather than skills/agents).
//
// In Claude Code, MCP tools appear in the session with names of the form
// `mcp__<server>__<tool>`. The server segment may itself contain single
// underscores; the DOUBLE-underscore `__` is the field separator. `mcp__` is the
// leading marker, everything up to the NEXT `__` is the server, and the rest is
// the tool name.
//
// `classifyMcpTools(tools)` is a PURE function over the session's mcp tool list
// (`[{ name, description? }]`, supplied by the orchestrator at runtime — the lib
// never reads the session). It returns:
//   - servers: Map<server, { tools, capabilities:Set, access:'read'|'write'|'mixed' }>
//   - byCapability: Map<capability, [{ server, tool, access }]>
//   - and pairs with resolveCapability(result, capability) -> best entry | null.
//
// Capability is inferred from server+tool+description keywords; read-vs-write is
// inferred from the tool's verb (mutating verbs => write). A server exposing both
// read and write tools is 'mixed'.

// A realistic fixture drawn from the kinds of MCP servers seen in a live session.
const FIXTURE = [
  { name: 'mcp__context7__query-docs', description: 'Fetch up-to-date library documentation' },
  { name: 'mcp__context7__resolve-library-id' },
  {
    name: 'mcp__plugin_chrome-devtools-mcp_chrome-devtools__navigate_page',
    description: 'Navigate the browser page to a URL',
  },
  { name: 'mcp__plugin_chrome-devtools-mcp_chrome-devtools__take_screenshot' },
  { name: 'mcp__plugin_chrome-devtools-mcp_chrome-devtools__lighthouse_audit' },
  { name: 'mcp__plugin_figma_figma__use_figma', description: 'Run code in the Figma design file' },
  { name: 'mcp__claude_ai_Gmail__search_threads', description: 'Search email threads' },
  { name: 'mcp__claude_ai_Gmail__create_draft', description: 'Create a draft email message' },
  { name: 'mcp__claude_ai_Google_Calendar__list_events' },
  { name: 'mcp__claude_ai_Google_Calendar__create_event' },
  { name: 'mcp__claude_ai_Google_Drive__search_files' },
  { name: 'mcp__claude_ai_Google_Drive__upload_file' },
  { name: 'mcp__graphify__query_graph', description: 'Query the code knowledge graph' },
  { name: 'mcp__pg__run_sql', description: 'Run a postgres SQL query' },
  { name: 'mcp__websearch__web_search', description: 'Search the web and fetch results' },
  { name: 'mcp__some__weird_tool' },
];

// ===========================================================================
// server parsing — strip mcp__, take up to the NEXT __, rest is the tool
// ===========================================================================

test('parses server and tool, stripping mcp__ and splitting on the first __', () => {
  const { servers } = classifyMcpTools([
    { name: 'mcp__context7__query-docs' },
  ]);
  assert.ok(servers.has('context7'), 'server parsed');
  const entry = servers.get('context7');
  assert.deepEqual(
    entry.tools.map((t) => t.tool),
    ['query-docs'],
    'tool name is everything after the server separator',
  );
});

test('parses a server name that itself contains single underscores', () => {
  const { servers } = classifyMcpTools([
    { name: 'mcp__plugin_chrome-devtools-mcp_chrome-devtools__navigate_page' },
  ]);
  // The server is everything between the leading mcp__ and the next __, so the
  // single underscores inside it are preserved and only the DOUBLE underscore
  // separates server from tool.
  assert.ok(
    servers.has('plugin_chrome-devtools-mcp_chrome-devtools'),
    'server with internal underscores parsed intact',
  );
  const entry = servers.get('plugin_chrome-devtools-mcp_chrome-devtools');
  assert.deepEqual(entry.tools.map((t) => t.tool), ['navigate_page']);
});

test('a tool name may itself contain underscores (only the first __ splits)', () => {
  const { servers } = classifyMcpTools([
    { name: 'mcp__claude_ai_Gmail__search_threads' },
  ]);
  const entry = servers.get('claude_ai_Gmail');
  assert.ok(entry, 'server claude_ai_Gmail parsed');
  assert.deepEqual(entry.tools.map((t) => t.tool), ['search_threads']);
});

test('groups multiple tools under the same server', () => {
  const { servers } = classifyMcpTools(FIXTURE);
  const gmail = servers.get('claude_ai_Gmail');
  assert.ok(gmail, 'Gmail server present');
  const toolNames = gmail.tools.map((t) => t.tool).sort();
  assert.deepEqual(toolNames, ['create_draft', 'search_threads']);
});

// ===========================================================================
// capability inference
// ===========================================================================

test('infers docs capability for context7', () => {
  const { byCapability } = classifyMcpTools(FIXTURE);
  const docs = byCapability.get('docs');
  assert.ok(docs && docs.some((e) => e.server === 'context7'), 'context7 => docs');
});

test('infers browser capability for chrome-devtools', () => {
  const { byCapability } = classifyMcpTools(FIXTURE);
  const browser = byCapability.get('browser');
  assert.ok(
    browser && browser.some((e) => e.tool === 'navigate_page'),
    'navigate_page => browser',
  );
  assert.ok(
    browser.some((e) => e.tool === 'lighthouse_audit'),
    'lighthouse_audit => browser',
  );
});

test('infers design capability for figma', () => {
  const { byCapability } = classifyMcpTools(FIXTURE);
  const design = byCapability.get('design');
  assert.ok(design && design.some((e) => e.server === 'plugin_figma_figma'));
});

test('infers graph capability for graphify query_graph', () => {
  const { byCapability } = classifyMcpTools(FIXTURE);
  const graph = byCapability.get('graph');
  assert.ok(graph && graph.some((e) => e.tool === 'query_graph'));
});

test('infers database capability for a sql/postgres tool', () => {
  const { byCapability } = classifyMcpTools(FIXTURE);
  const db = byCapability.get('database');
  assert.ok(db && db.some((e) => e.tool === 'run_sql'));
});

test('infers search capability for a web/search/fetch tool', () => {
  // Note: a Drive `search_files` is captured by the more-specific `storage`
  // capability and Gmail `search_threads` by `email` — those data-domain
  // capabilities are intentionally checked before the broad `search`. A generic
  // web-search tool has no more-specific match, so it lands in `search`.
  const { byCapability } = classifyMcpTools(FIXTURE);
  const search = byCapability.get('search');
  assert.ok(search && search.some((e) => e.tool === 'web_search'));
});

test('infers email capability for Gmail', () => {
  const { byCapability } = classifyMcpTools(FIXTURE);
  const email = byCapability.get('email');
  assert.ok(email && email.some((e) => e.server === 'claude_ai_Gmail'));
});

test('infers calendar capability for Calendar events', () => {
  const { byCapability } = classifyMcpTools(FIXTURE);
  const cal = byCapability.get('calendar');
  assert.ok(cal && cal.some((e) => e.tool === 'create_event' || e.tool === 'list_events'));
});

test('infers storage capability for Drive file tools', () => {
  const { byCapability } = classifyMcpTools(FIXTURE);
  const storage = byCapability.get('storage');
  assert.ok(storage && storage.some((e) => e.server === 'claude_ai_Google_Drive'));
});

test('an unknown/untagged tool lands in the "other" capability', () => {
  const { byCapability } = classifyMcpTools([{ name: 'mcp__some__weird_tool' }]);
  const other = byCapability.get('other');
  assert.ok(other && other.some((e) => e.tool === 'weird_tool'), 'unknown => other');
  // And it must NOT be force-fit into a real capability.
  for (const [cap, entries] of byCapability) {
    if (cap === 'other') continue;
    assert.ok(!entries.some((e) => e.tool === 'weird_tool'), `weird_tool not in ${cap}`);
  }
});

// ===========================================================================
// read-vs-write classification (per tool) and server access rollup
// ===========================================================================

test('search_threads is classified read', () => {
  const { servers } = classifyMcpTools([
    { name: 'mcp__claude_ai_Gmail__search_threads' },
  ]);
  const tool = servers.get('claude_ai_Gmail').tools.find((t) => t.tool === 'search_threads');
  assert.equal(tool.access, 'read');
});

test('create_draft is classified write', () => {
  const { servers } = classifyMcpTools([
    { name: 'mcp__claude_ai_Gmail__create_draft' },
  ]);
  const tool = servers.get('claude_ai_Gmail').tools.find((t) => t.tool === 'create_draft');
  assert.equal(tool.access, 'write');
});

test('a server with both read and write tools rolls up to mixed', () => {
  const { servers } = classifyMcpTools([
    { name: 'mcp__claude_ai_Gmail__search_threads' },
    { name: 'mcp__claude_ai_Gmail__create_draft' },
  ]);
  assert.equal(servers.get('claude_ai_Gmail').access, 'mixed');
});

test('a read-only server rolls up to read; a write-only server to write', () => {
  const readOnly = classifyMcpTools([
    { name: 'mcp__context7__query-docs' },
    { name: 'mcp__context7__resolve-library-id' },
  ]);
  assert.equal(readOnly.servers.get('context7').access, 'read');

  const writeOnly = classifyMcpTools([
    { name: 'mcp__mailer__send_message' },
  ]);
  assert.equal(writeOnly.servers.get('mailer').access, 'write');
});

test('mutating verbs classify as write (create/update/delete/send/upload/...)', () => {
  const names = [
    'mcp__x__create_thing',
    'mcp__x__update_thing',
    'mcp__x__delete_thing',
    'mcp__x__send_thing',
    'mcp__x__upload_thing',
    'mcp__x__set_thing',
    'mcp__x__apply_thing',
    'mcp__x__rename_thing',
  ];
  const { servers } = classifyMcpTools(names.map((name) => ({ name })));
  for (const t of servers.get('x').tools) {
    assert.equal(t.access, 'write', `${t.tool} should be write`);
  }
});

test('reading verbs classify as read (get/list/read/query/search/fetch/download/...)', () => {
  const names = [
    'mcp__y__get_thing',
    'mcp__y__list_thing',
    'mcp__y__read_thing',
    'mcp__y__query_thing',
    'mcp__y__search_thing',
    'mcp__y__fetch_thing',
    'mcp__y__download_thing',
    'mcp__y__analyze_thing',
  ];
  const { servers } = classifyMcpTools(names.map((name) => ({ name })));
  for (const t of servers.get('y').tools) {
    assert.equal(t.access, 'read', `${t.tool} should be read`);
  }
});

test('byCapability entries carry the per-tool access', () => {
  const { byCapability } = classifyMcpTools([
    { name: 'mcp__claude_ai_Gmail__create_draft' },
    { name: 'mcp__claude_ai_Gmail__search_threads' },
  ]);
  const email = byCapability.get('email');
  const draft = email.find((e) => e.tool === 'create_draft');
  const search = email.find((e) => e.tool === 'search_threads');
  assert.equal(draft.access, 'write');
  assert.equal(search.access, 'read');
});

// ===========================================================================
// resolveCapability — best server/tool for a capability, or null
// ===========================================================================

test('resolveCapability returns an entry for a covered capability', () => {
  const result = classifyMcpTools(FIXTURE);
  const best = resolveCapability(result, 'docs');
  assert.ok(best, 'docs resolves');
  assert.equal(best.server, 'context7');
});

test('resolveCapability prefers a read tool when the capability has both', () => {
  const result = classifyMcpTools([
    { name: 'mcp__claude_ai_Gmail__create_draft' },
    { name: 'mcp__claude_ai_Gmail__search_threads' },
  ]);
  const best = resolveCapability(result, 'email');
  // A read entry is the safest default to surface first (auto-usable).
  assert.equal(best.access, 'read');
  assert.equal(best.tool, 'search_threads');
});

test('resolveCapability returns null for an uncovered capability', () => {
  const result = classifyMcpTools([{ name: 'mcp__context7__query-docs' }]);
  assert.equal(resolveCapability(result, 'database'), null);
});

// ===========================================================================
// empty / malformed input safety — never throw
// ===========================================================================

test('empty input yields empty maps, no throw', () => {
  const result = classifyMcpTools([]);
  assert.ok(result.servers instanceof Map && result.servers.size === 0);
  assert.ok(result.byCapability instanceof Map && result.byCapability.size === 0);
});

test('non-array input is tolerated (empty maps)', () => {
  for (const bad of [null, undefined, 'nope', 42, {}]) {
    const result = classifyMcpTools(bad);
    assert.ok(result.servers instanceof Map && result.servers.size === 0);
    assert.ok(result.byCapability instanceof Map && result.byCapability.size === 0);
  }
});

test('malformed tool entries are skipped without throwing', () => {
  const result = classifyMcpTools([
    null,
    42,
    {},
    { name: '' },
    { name: 'not-an-mcp-tool' }, // missing mcp__ prefix
    { name: 'mcp__onlyserver' }, // no __tool separator
    { name: 'mcp__ok__real_get_tool' },
  ]);
  // Only the well-formed one survives.
  assert.ok(result.servers.has('ok'), 'well-formed tool kept');
  assert.equal(result.servers.get('ok').tools[0].tool, 'real_get_tool');
});

test('resolveCapability tolerates a malformed result object', () => {
  assert.equal(resolveCapability(null, 'docs'), null);
  assert.equal(resolveCapability({}, 'docs'), null);
  assert.equal(resolveCapability({ byCapability: new Map() }, 'docs'), null);
});
