---
name: capability-discovery
description: Use at run start to discover what reviewers/analyzers/generators any installed plugin provides and route work by ROLE. Builds a role→provider map via lib/capability-scan.js so the loop prefers the best-matching installed specialist (a Go reviewer, a Flutter reviewer, AgentShield, ...) and falls back to soe-core's generic (soe:code-reviewer, soe:security-reviewer, soe:architect, ...) when none is installed. soe-core is self-sufficient and NEVER hard-depends on packs.
---

# capability-discovery — role-routing + extras-absent fallback (design §6)

soe is a **host orchestrator**. Packs (soe-extras, ECC, AgentShield, ...) are
purely **additive**: when installed they contribute better, more specific
reviewers/analyzers/generators; when absent, soe-core runs unchanged on its own
**generic** reviewers. This skill is the routing contract that makes both true:

> Prefer the best-matching installed specialist **by role**; fall back to
> soe-core's generic when none is installed. **Core never hard-depends on a
> pack.**

## At run start: build the role → provider map

Once, at the start of a run, build the capability map from the skills/agents
installed across every plugin, using `lib/capability-scan.js`:

```js
import { enumerateProviders, buildCapabilityMap, resolveRole } from '../../lib/capability-scan.js';

// enumerateProviders reads skills/<x>/SKILL.md + agents/<y>.md frontmatter
// (name, description, and the optional role:/domain: tags) from each plugin dir.
const providers = enumerateProviders(pluginDirs);
const map = buildCapabilityMap(providers); // Map<role, [providers]> (best first)
```

`buildCapabilityMap` ranks providers within each role so the **best** one is
first: an explicitly **tagged** specialist outranks one merely inferred from its
prose (see the tag convention below). `resolveRole(map, role)` returns that best
provider, or **`null`** when nothing installed covers the role.

## Routing rule: specialist first, else the soe-core generic

For each review/analysis role the loop needs, ask the map first and fall back to
the core generic only when the map has nothing:

```js
// The specialist if the registry has one, else soe-core's generic agent.
const CORE_GENERICS = {
  'code-review': 'soe:code-reviewer',
  security:      'soe:security-reviewer',
  architecture:  'soe:architect',
  database:      'soe:database-reviewer',
  logging:       'soe:logging-reviewer',
};

function pickReviewer(map, role, coreGenerics = CORE_GENERICS) {
  const specialist = resolveRole(map, role);   // null when extras absent
  return specialist ? specialist : coreGenerics[role];
}
```

- **Specialist present** → use it (a discovered ENHANCEMENT provider) and **log**
  the choice (which provider, which role, tag vs. keyword match).
- **Nothing installed for the role** → `resolveRole` returns `null`, so the loop
  **falls back to the soe-core generic** — `soe:code-reviewer`,
  `soe:security-reviewer`, `soe:architect`, `soe:database-reviewer`,
  `soe:logging-reviewer`. Core is self-sufficient; the run proceeds normally.

The generics always exist in soe-core, so **`pickReviewer` never returns
undefined** — this is what "core never hard-depends on packs" means in code.

## Posture: auto-use enhancements, confirm control actions (design §6)

Discovered providers fall into two postures:

| Provider posture | What it does | Rule |
|---|---|---|
| **ENHANCEMENT** — reviewer / analyzer / generator | reads code, produces findings/output; reversible, no side effects | **Auto-use + log.** No confirmation needed; a better reviewer is strictly additive. |
| **Control / side-effecting** — anything taking an **irreversible** action (destructive migration, prod deploy, force-push, secret rotation, ...) | mutates the world | **Follows the confirm rule.** Route through `soe:soe-modes` / `lib/escalation.js` (`isIrreversible` / `shouldEscalate`) before acting. Learning NEVER auto-waves an irreversible action through. |

Discovering a specialist reviewer, then, is auto-adopted and logged. Discovering
a provider that *acts* irreversibly does not change the safety contract — it
still goes through the escalation/confirm gate defined by `soe:soe-modes`.

## Optional providers discovered by presence (not just role scan)

Some providers are discovered by **detecting an external tool**, not by scanning
skill frontmatter. They register additional roles when present and are silently
skipped when absent (core never hard-depends on them):

| Provider | Detect | Roles it adds | Posture | Skill |
|---|---|---|---|---|
| **graphify** (code knowledge-graph) | `graphify-out/graph.json` OR its registered MCP server (`query_graph`/`get_neighbors`/`shortest_path`/`get_pr_impact`) | **retrieval** (route context queries through the graph instead of grep-and-read) + **blast-radius** (feed `get_pr_impact`/`shortest_path` into `lib/risk-matrix.js` `blastRadius` for fail-safe scrutiny) | ENHANCEMENT — read-only, auto-use + log | `soe:using-graphify` |
| **codex-peer** (different-perspective peer) — **experimental** | `lib/codex-detect.js` `isCodexAvailable` — present only when BOTH the `codex` CLI is on PATH AND the `openai/codex-plugin-cc` plugin is installed | **peer-synthesis** (high-stakes parallel synthesis per `soe:model-orchestration`: run Opus AND Codex on the same problem, merge without cross-contamination) | ENHANCEMENT — read-only, auto-use + log; **best-effort/experimental, silently skipped when absent** | `soe:using-codex` |
| **figma** (design source) | a registered Figma MCP (its `figma` skill / `mcp__*figma*` tools — `use_figma` / `get_design_context` / `authenticate`) — the **three-part guard**: available AND authenticated AND a Figma URL was given | **design-source** (during UI/frontend spec creation, READ design context — components, layout, spacing/tokens, variants, flows — from the URL and ground the design doc's UI section in the ACTUAL design; cite the real node/component names) | READ-ONLY, auto-use + log; **silently skipped when absent OR unauthenticated OR no URL** — never prompts/offers, never writes to Figma (no generate-design / code-connect) | `soe:using-figma` |

When present, adopt graphify per `soe:using-graphify` (consume-only, staleness-
aware, honor `INFERRED`/`AMBIGUOUS` confidence labels, silent fallback to native
file/grep tools when absent or empty). Its blast-radius signal may only **raise**
the risk tier to `full`, never lower it.

For **figma**, adopt per `soe:using-figma` only when its **three-part guard**
holds (available AND authenticated AND a Figma URL was given); ground the spec's
UI section in the real design and cite the node/component names. It is
**READ-ONLY** (never generate-design / code-connect) and **silently skipped** —
no prompt, no offer — when absent, unauthenticated, or no URL was provided, in
which case the agent derives the UI from intent as usual.

## MCPs by capability (via `soe:using-mcp`)

Discovery covers two axes: skills/agents **by role** (above) AND installed **MCP
servers by capability**. Beyond the named MCP providers in the table above
(graphify/codex/figma/chrome-devtools), soe reuses **ANY** installed MCP by
capability via `soe:using-mcp`:

- At run start, alongside the role→provider map, build an MCP **capability map**
  from the session's `mcp__*` tools with `lib/mcp-discovery.js` `classifyMcpTools`
  (`byCapability`: docs/browser/graph/design/database/search/email/calendar/
  storage/…; `servers`: per-server read/write/mixed access).
- **Routing:** for a needed capability, the **four named providers take
  precedence** when present (richer integration); otherwise
  `resolveCapability(map, capability)` picks the best discovered MCP, and when it
  returns `null` the loop falls back **silently** to soe's native tools.
- **Posture — same read-auto / write-confirm split as above, per MCP TOOL:**
  **read/analysis** MCP tools → **auto-use + log**; **write/irreversible** MCP
  tools → **follow the confirm rule** (`soe:soe-modes` / `lib/escalation.js`
  `isIrreversible`). Never auto-invoke a mutating MCP without confirmation.

See `soe:using-mcp` for the full routing + posture contract.

## Optional tag convention (precise routing)

For precise routing, a provider MAY declare its role in frontmatter — this is
authoritative and outranks keyword inference:

```yaml
---
name: go-reviewer
description: Comprehensive Go code review
role: code-review      # or: domain: go
---
```

- `role:` / `domain:` — routes the provider **exactly** to that role. Preferred.
- **No tag** — soe-core still routes best-effort by scanning name + description
  for role keywords (`review`→code-review, `security`→security, `go`/`golang`→go,
  `e2e`/`tdd`→testing, ...), so non-conforming plugins still slot in.

A tagged provider always outranks a keyword-only one for the same role, so
declaring a tag guarantees your specialist wins `resolveRole` / `pickReviewer`.

## Red flags (stop and correct)

- Any code path that **requires** a pack to be installed — core must run with the
  extras absent, falling back to its generics.
- Skipping the fallback and erroring when `resolveRole` returns `null` instead of
  using the soe-core generic.
- Auto-adopting a **side-effecting/irreversible** provider without going through
  the `soe:soe-modes` / `lib/escalation.js` confirm rule.
- Adopting a discovered specialist **without logging** which provider was chosen.
