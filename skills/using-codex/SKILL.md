---
name: using-codex
description: Register `codex-peer` — an OPTIONAL, EXPERIMENTAL "different-perspective peer" — as a discovered provider used per the soe:model-orchestration methodology for high-stakes PARALLEL SYNTHESIS (run Opus AND Codex on the same problem, merge without cross-contamination). Detected only when BOTH the `codex` CLI is on PATH AND the `openai/codex-plugin-cc` plugin is installed (lib/codex-detect.js isCodexAvailable); invoked via the official Codex plugin (`/codex:rescue --background` style, CLI-backed). ENHANCEMENT-only posture — best-effort, honest scope, SILENTLY SKIPPED when absent, and NEVER takes an irreversible/control action without the soe:soe-modes confirm rule. Registered as an optional peer-synthesis provider by soe:capability-discovery.
metadata:
  role: peer-synthesis
  provider: codex-peer
  posture: enhancement
  status: experimental
---

# using-codex — optional `codex-peer` different-perspective peer (design §4.1/§6)

Codex is an **OPTIONAL, EXPERIMENTAL** provider: a *different-perspective peer*
soe can run **alongside** Opus on the **same** high-stakes problem, then merge the
two independent answers **without cross-contamination**. It is used **only if
available** and is **NEVER a hard dependency** — when absent it is **silently
skipped** and soe-core proceeds unchanged on its own reasoning.

> On a genuinely high-stakes call, a second **independent** model is worth more
> than a second pass from the same one. Use codex as that independent peer when
> present; skip it silently when not. Honest scope: experimental, best-effort.

## 1. Detect (never assume) — BOTH required

codex-peer is **available** only when **BOTH** facts hold:

1. the **`codex` CLI binary is on PATH**, AND
2. the **`openai/codex-plugin-cc` plugin is installed** (the official Codex
   plugin that backs `/codex:*` commands).

Use the pure, injectable detector so this stays deterministic and testable:

```js
import { isCodexAvailable, probeCodex } from '../../lib/codex-detect.js';

// Pure over injected facts (unit-tested): true ONLY when binary AND plugin.
const available = isCodexAvailable({ hasBinary, hasPlugin });

// Or best-effort probe of the real environment (never throws):
const { available } = probeCodex(); // { available, hasBinary, hasPlugin }
```

If **either** fact is missing → `false` → **silent skip**. No error, no prompt.
This is the "never a hard dependency" posture, encoded: a partially-known world
is treated as absent, never optimistically as present.

## 2. What it's for — high-stakes PARALLEL SYNTHESIS (design §4.1)

codex-peer is reserved for **high-stakes** work where an independent second
perspective materially reduces the chance of a wrong answer (hard architecture
calls, subtle correctness/security reasoning, ambiguous root-cause). Route it per
the `soe:model-orchestration` methodology — score the slice on stakes /
reversibility / ambiguity; only genuinely high slices merit the extra spend.

The pattern is **parallel synthesis without cross-contamination**:

1. **Fork the same problem statement** to both peers independently — Opus (the
   session/`deep-reasoner` tier) and codex-peer. Neither sees the other's draft.
2. **Each answers in isolation**, writing to its own scratch path (the context
   firewall from `soe:model-orchestration` — an absolute path outside any
   worktree; return only `path + summary + confidence`).
3. **Merge afterward**, comparing the two independent answers: agreements raise
   confidence; disagreements are the signal to dig in. The merge is a fresh step
   — do NOT feed one peer's draft into the other mid-flight (that would collapse
   the independence that makes the second perspective valuable).

## 3. Invocation — via the official Codex plugin (CLI-backed)

codex-peer is invoked **through the official Codex plugin**, not a bespoke
integration: a `/codex:rescue --background`-style, CLI-backed call. Run it in the
**background** so the Opus branch proceeds in parallel, then collect codex's
result at the merge step. soe never shells out to `codex` directly around the
plugin — the plugin is the supported surface.

## 4. Posture — ENHANCEMENT only; irreversible actions go through the confirm rule

codex-peer's role here is **peer-synthesis**: it *reasons and proposes*. That is a
**read-only ENHANCEMENT** posture (reversible, no side effects) → **auto-use +
log** which peer answered and how the merge resolved (per
`soe:capability-discovery`).

It is **ENHANCEMENT-only by contract**: codex-peer must **never take an
irreversible / control action** (destructive migration, prod deploy, force-push,
secret rotation, ...) on its own. Any such action a codex suggestion implies is
routed through the **confirm rule** defined by `soe:soe-modes` (and
`lib/escalation.js` `isIrreversible` / `shouldEscalate`) before it happens — a
discovered peer proposing an action does **not** wave it past the safety gate.

## 5. Honest scope (don't over-promise)

- **Experimental.** codex-peer is a best-effort enhancement, not a guaranteed
  capability. Frame its output as a second opinion to weigh, not an oracle.
- **Best-effort + silent skip.** Absent codex → skipped with no error and no
  prompt; the run is identical to a codex-never-installed run. Present-but-broken
  (probe throws) → also treated as absent (`probeCodex` never throws).
- **No hard dependency.** No soe-core code path may require codex. Everything
  above is additive: it only ever *adds* a perspective when both the binary and
  the plugin are there.

## Red flags (stop and correct)

- Any code path that **requires** codex — core must run codex-absent, unchanged.
- Reporting available on a **partial** signal (binary but no plugin, or vice
  versa) — availability requires **BOTH**.
- **Cross-contaminating** the peers — feeding one peer's draft into the other
  before the merge, collapsing the independence that gives the second
  perspective its value.
- Letting a codex suggestion take an **irreversible/control action** without the
  `soe:soe-modes` confirm rule.
- Over-promising — presenting an **experimental**, best-effort peer as a reliable
  hard capability, or erroring/prompting when it is simply absent.
