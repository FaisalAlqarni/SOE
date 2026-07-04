---
name: using-graphify
description: Use graphify (a code knowledge-graph) as a first-class OPTIONAL provider when present — detected via graphify-out/graph.json or its registered MCP server. Routes context retrieval through query_graph/get_neighbors/shortest_path instead of grep-and-read (token win), and feeds get_pr_impact/shortest_path into the risk matrix's blast-radius (lib/risk-matrix.js blastRadius). Consume-only, staleness-aware, confidence-labeled; silently falls back to native file/grep tools when graphify is absent or empty. Registered as an optional provider by soe:capability-discovery.
metadata:
  role: retrieval
  provider: graphify
  posture: enhancement
---

# using-graphify — optional code knowledge-graph provider (design §6.1, F12)

[graphify](https://github.com/safishamsi/graphify) is a **first-class OPTIONAL**
provider: a code knowledge-graph soe uses for **token efficiency** (retrieval)
and **integrity** (blast-radius). soe uses it **if present** and **silently
falls back** to native file/grep tools if absent. Core never hard-depends on it.

> Prefer the graph when it exists and is fresh; trust ground-truth (files/diff)
> for anything changed this session; treat inferred edges as hints; fall back
> silently when absent or empty.

## 1. Detect (never assume)

graphify is **present** when EITHER is true:

- **On-disk index:** `graphify-out/graph.json` exists in the project (an AST/graph
  export already built by the user), OR
- **MCP server:** a graphify MCP server is registered (its tools — `query_graph`,
  `get_neighbors`, `shortest_path`, `get_pr_impact` — are available).

If **neither** is found, graphify is **absent**: do nothing special, use native
`Read`/`Grep`/`Glob`. No error, no prompt — this is the silent-fallback path.
Detection is also **empty-safe**: a present-but-empty graph (no nodes) is treated
as absent for routing purposes.

## 2. Role A — Retrieval (token win)

When present and fresh, route context retrieval through the graph instead of
grep-and-read. The retrieval layer, workers, and evaluators use:

| Need | Graph query | Replaces |
|---|---|---|
| "what is this symbol / who defines it" | `query_graph` | grep + read whole files |
| "what depends on / calls this" | `get_neighbors` | grep across the tree |
| "how does A reach B" | `shortest_path` | manual multi-file tracing |

On large corpora this is dramatically fewer tokens per query (graphify's
reproducible benchmark: ~71× on large repos; ~1× on tiny ones — so **no harm**
when the codebase is small; the fallback and the graph converge). Feed the graph
result to the caller as the retrieval answer; only read the specific files the
graph points at, not the whole neighborhood.

## 3. Role B — Blast-radius for fail-safe scrutiny (§4, F12)

Feed graphify's **real dependency impact** into the deterministic risk matrix so
right-sizing can be raised — never lowered — by graph reach. This upgrades the
risk matrix from path-pattern matching to graph-based impact analysis.

Call `lib/risk-matrix.js`'s `blastRadius(files, graphify, { impactThreshold })`
with a provider that exposes graphify's `get_pr_impact` as a `getPrImpact`-shaped
method returning impact data:

```js
import { classify, applyClassifierHint, blastRadius } from '../../lib/risk-matrix.js';

// Adapter: wrap graphify's get_pr_impact / shortest_path behind the duck-typed
// contract blastRadius expects. Absent graphify => pass null (silent no-op).
const graphify = graphifyPresent
  ? {
      getPrImpact: (files) => {
        // graphify MCP get_pr_impact -> normalize to the blastRadius contract:
        const r = graphifyMcp.get_pr_impact(files); // or derive via shortest_path fan-out
        return {
          impactedCount: r.impactedCount,          // size of dependency reach
          impactedFiles: r.impactedFiles,          // reached files (optional)
          touchesSecurityPath: r.touchesSecurityPath, // reaches auth/authz/secrets/... path
        };
      },
    }
  : null;

// Deterministic floor first, then let the graph RAISE it (never lower).
const { tier: floor } = classify(diff);
const signal = blastRadius(changedPaths, graphify); // null when absent / small / broken
let tier = floor;
if (signal) tier = applyClassifierHint(tier, signal.raiseTo); // raiseTo === 'full'
```

- A **large** blast-radius (impacted files `> impactThreshold`) or a
  **security-path-touching** blast-radius returns `{ raiseTo: 'full', reason }`;
  merging it via `applyClassifierHint` **raises** even a would-be-`trivial`
  classification to `full`.
- Absent (`null`) graphify → `blastRadius` returns `null` (no-op); a broken /
  throwing provider also fails safe to `null`. The path/marker rules remain the
  floor. `blastRadius` **never throws** and can only **raise** the tier.

## 4. Integration RULES (integrity > tokens — design §6.1)

These four are non-negotiable; they are the reason graphify is safe to trust:

1. **Consume-only — never auto-build the index.** Semantic extraction can cost
   LLM tokens/money, so soe **never** triggers a semantic build. It may **nudge**
   the user to run the **free AST-only** `graphify update` if the graph looks
   stale — a suggestion, not an action.
2. **Respect staleness.** For code changed **this session**, trust ground-truth
   (the actual files / the diff), **not** the possibly-stale graph. The graph is
   authoritative only for code you have **not** touched since it was built.
3. **Honor confidence labels.** Treat `INFERRED` / `AMBIGUOUS` edges as **hints,
   not facts** — never let a low-confidence edge alone drive an irreversible
   decision; corroborate against ground-truth first.
4. **Silent fallback.** When graphify is absent or the graph is empty, drop to
   native file/grep tools with **no error and no prompt**. The run proceeds
   unchanged; graphify is purely additive.

## 5. Posture

Retrieval + blast-radius are **read-only ENHANCEMENT** roles (reversible, no side
effects) → **auto-use + log** which provider answered (per
`soe:capability-discovery`). graphify never takes an irreversible action, so it
does not touch the escalation/confirm gate.

## Red flags (stop and correct)

- **Requiring** graphify — any code path that errors when it's absent instead of
  falling back to native tools. Core must run graphify-absent, unchanged.
- **Auto-building** the semantic index (spending tokens) instead of consuming an
  existing one / nudging the free `graphify update`.
- Trusting the **graph over the diff** for code changed **this session** (stale).
- Treating an `INFERRED` / `AMBIGUOUS` edge as **fact**.
- Letting blast-radius **lower** scrutiny — it may only **raise** to `full`,
  never downscope (that would break the fail-safe floor).
