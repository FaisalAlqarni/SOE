---
name: using-mcp
description: Discover and reuse ANY installed MCP server by CAPABILITY (design §6, for MCP tools). At run start the orchestrator enumerates its available mcp__* tools and calls lib/mcp-discovery.js classifyMcpTools to build a capability map (docs/browser/graph/design/database/search/email/calendar/storage/…). When a needed capability has a discovered MCP, prefer it over doing the work manually — the four named providers (soe:using-graphify / using-codex / using-figma + chrome-devtools) take precedence when present; generic MCP discovery covers everything else. READ/analysis MCP tools auto-use + log; WRITE/irreversible MCP tools follow the confirm rule (soe:soe-modes / lib/escalation.js isIrreversible). Graceful, silent fallback to soe's native tools when no MCP matches. Registered as an optional provider by soe:capability-discovery.
metadata:
  role: mcp-discovery
  posture: read-auto-write-confirm
  status: optional
---

# using-mcp — systematic MCP discovery + reuse (design §6, for MCP tools)

soe is a **host orchestrator**. Beyond the four *named* MCP providers it has
dedicated skills for (graphify, codex, figma, chrome-devtools), it should reuse
**ANY** installed MCP server by **capability** — docs, browser, graph, design,
database, search, email, calendar, storage, … — rather than doing that work
manually. This skill is the discovery + routing contract that makes that safe.

> Prefer a discovered MCP when it covers a needed capability; the four named
> providers take precedence when present (richer integration); fall back
> **silently** to soe's native tools when no MCP matches. Core never
> hard-depends on any MCP.

## At run start: build the capability map

Once, at the start of a run, the orchestrator enumerates its available `mcp__*`
tools (the session's MCP tool list — Claude Code exposes them as
`mcp__<server>__<tool>`) and passes that list to `lib/mcp-discovery.js`:

```js
import { classifyMcpTools, resolveCapability } from '../../lib/mcp-discovery.js';

// `mcpTools` is the session's available mcp__* tools as [{ name, description? }].
// The lib is PURE over this array — it does NOT read the session itself.
const mcp = classifyMcpTools(mcpTools);
// mcp.servers      : Map<server, { tools, capabilities, access:'read'|'write'|'mixed' }>
// mcp.byCapability : Map<capability, [{ server, tool, access }]>
```

`classifyMcpTools` parses each `mcp__<server>__<tool>` name (the server may
contain single underscores; the **double** underscore `__` is the separator),
infers each tool's **capability** from server+tool+description keywords, and
classifies each tool **read vs. write** by its verb. A server exposing both →
`mixed`. `resolveCapability(mcp, capability)` returns the best server/tool for a
capability (preferring a read tool), or **`null`** when nothing covers it.

## Routing: named providers first, then generic discovery, then native

For a needed capability, resolve in this precedence order:

1. **Named provider present** → use its dedicated skill (richer, guarded
   integration): retrieval/graph → `soe:using-graphify`; peer-synthesis →
   `soe:using-codex`; design-source → `soe:using-figma`; browser/devtools →
   the `chrome-devtools` skill. These win over generic discovery.
2. **Generic MCP discovered** for the capability (`resolveCapability` non-null)
   → **prefer it over doing the work manually** and **log** the choice (which
   server/tool, which capability, read vs. write).
3. **Nothing installed** for the capability → **fall back to soe's native
   tools** (Read/Grep/Glob/WebFetch/…). Silent — no error, no prompt.

```js
const NAMED = { graph: 'soe:using-graphify', design: 'soe:using-figma', browser: 'chrome-devtools' };

function routeCapability(mcp, capability) {
  if (NAMED[capability]) return { via: 'named', skill: NAMED[capability] };
  const hit = resolveCapability(mcp, capability); // null when no MCP covers it
  if (hit) return { via: 'mcp', ...hit };         // discovered generic MCP
  return { via: 'native' };                        // graceful fallback
}
```

## Safety posture: read auto-use + log, write follows the confirm rule

Reuse soe's existing read-auto-use / write-confirm posture (design §6) — the
per-tool `access` from `classifyMcpTools` decides which gate applies:

| Tool access | Examples | Rule |
|---|---|---|
| **read / analysis** (reversible, no side effects) | `query-docs`, `search_threads`, `list_events`, `read_file_content`, `take_snapshot`, `query_graph` | **Auto-use + log** the choice. No confirmation — a read is strictly additive. |
| **write / irreversible** (mutates the world) | `create_draft`, `delete_event`, `upload_file`, `send_message`, `label_thread`, `rotate_*` | **Follow the confirm rule.** Route through `soe:soe-modes` / `lib/escalation.js` (`isIrreversible` / `shouldEscalate`) **before** invoking. **Never auto-invoke a mutating MCP** without the mode's confirmation. |

- A `mixed` server has both kinds of tools — gate **per tool**, not per server:
  its reads auto-use, its writes confirm.
- Learning **never** auto-waves a mutating MCP tool through the confirm gate —
  the irreversible invariant in `lib/escalation.js` still holds.

## Graceful fallback (silent when no MCPs)

- If **no MCP** matches a needed capability, use soe's **native tools** — the run
  proceeds unchanged. MCP reuse is purely additive.
- If **no MCPs are installed at all**, `classifyMcpTools([])` returns empty maps;
  routing is entirely native. **Silent** — no error, no prompt, no offer.

## Red flags (stop and correct)

- Any code path that **requires** an MCP to be present instead of falling back to
  native tools. Core must run MCP-absent, unchanged.
- **Auto-invoking a write/irreversible MCP tool** without the `soe:soe-modes` /
  `lib/escalation.js` confirm gate.
- Letting generic discovery **shadow** a named provider — graphify/codex/figma/
  chrome-devtools take precedence when present (richer integration).
- Reusing a discovered MCP **without logging** which server/tool answered.
- Prompting/erroring when no MCP matches instead of silently using native tools.
