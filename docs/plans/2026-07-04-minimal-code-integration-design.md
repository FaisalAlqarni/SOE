# Minimal-Code (Ponytail) Integration — Design

> Bundle the *discipline* of [ponytail](https://github.com/DietrichGebert/ponytail) (make the agent write minimal, idiomatic code) into soe — adapted to soe's worker / evaluator / risk-matrix model — without importing its MCP, Python plugin, or 16-harness packaging.

- **Status:** Design approved for planning
- **Date:** 2026-07-04
- **Source:** ponytail v4.8.4 (MIT), `/development/_sources/ponytail`
- **Fit:** directly serves soe's value hierarchy (**integrity > simplicity > maintainability > … > tokens**) and token-frugality goal.


> **Correction (post-review, token-first):** the `lib/minimal-intensity.js` helper (§7, §9) is **superseded** — a computed intensity lib would be dead code AND add per-worker-dispatch token cost, defeating ponytail's net-token-saving purpose. Instead the intensity mapping is **self-assessed prose** in the skill/worker-template, cued by the plan's existing per-task Risks field (from `writing-plans`) — zero added tokens. The pipeline over-engineering lens is advisory + config-gated **off by default** (ambient `/simplify` is the primary path). See the v2 implementation plan.

## 1. Purpose

Ponytail measurably reduces agent output (~54% less code, ~20% cheaper, ~27% faster, 100% safe) by biasing the agent toward the *shortest working solution* (native `<input type="date">` instead of a flatpickr wrapper). soe already values simplicity/DRY/no-over-engineering; this bakes that discipline into soe's implementation path and adds an over-engineering review lens — so soe produces less, cheaper, faster code by default.

## 2. Scope

**Bring (the value, adapted):**
- The core ladder discipline as a soe skill.
- Worker-template wiring (implementation is minimal-by-construction).
- Two over-engineering review agents (diff + repo), run as an advisory lens in the loop.
- Two ambient commands for outside-the-pipeline use.
- The `soe:minimal` marker convention (deliberate-shortcut flag).

**Skip (low merit / duplicative / harmful for soe):**
- **MCP server** — redundant for Claude Code (skills/hooks are the injection point); adds `@modelcontextprotocol/sdk`+`zod`.
- **Python/Hermes plugin + the 13 non-target harness adapters** — soe targets Claude Code + Codex + OpenCode and already has Layer-1 multi-harness packaging; ponytail rides that for free.
- **Blanket `SubagentStart` hook** — ponytail issue **#502**: it injects lazy-mode into *every* subagent, biasing review/security agents. soe wires the discipline into the worker-template instead, so it can never leak into reviewers.
- `-gain`/`-help` (thin display). `-debt` (marker ledger) — optional later.

## 3. The two-dimensional guard (the safety core)

Minimal-code fires **only** on:
1. **Implementation agents** — never on `code-reviewer`, `security-reviewer`, `eval-*`, `board`, `devils-advocate`, or spec/brainstorm agents. Those must stay thorough.
2. **Code — never documentation.** Excluded: user/developer docs, how-to guides, READMEs, API docs, tutorials, human-facing comments/explanations. Docs are governed by soe's `writing-clearly`/`writing-plans` discipline (clarity + completeness), never reduction.

Enforced by *where* it's wired (worker-template + a disable toggle), not a global hook.

## 4. The four pieces

1. **`skills/minimal-code/SKILL.md`** — ponytail's core ladder adapted: 7 rungs (YAGNI → reuse in-codebase → stdlib → native platform → installed dep → one line → minimum), *"stop at the first rung that holds,"* the `soe:minimal` marker for deliberate shortcuts, and the **"when NOT to be lazy"** guardrails (validation, error handling, security, a11y, *"never lazy about understanding the problem"*, *"shortest **working** diff"*). Renamed to avoid ponytail's skill-name collisions (#501). Frontmatter tags it `role: implementation-discipline`.

2. **Worker-template wiring** — `skills/soe-workers/worker-template.md` already mandates TDD; add: *"apply `soe:minimal-code` at the intensity for this task's risk tier — write the shortest diff that passes the test **and is understood**. Code only; never minimize docs."* So every implementation worker is minimal-by-construction. **Always-on, disable-able** via `.soe/config.json` `minimal_code: true|false` (default true).

3. **`agents/over-engineering-reviewer.md` (diff) + `agents/over-engineering-auditor.md` (repo)** — adapted from ponytail-review/audit. They hunt reducible **code** (tags `delete:/stdlib:/native:/yagni:/shrink:`, ending `net: -N lines possible` + severity). **Skip docs/prose.** Tier-pinned (`sonnet` — mechanical scan). Wired into `loop-execution-evaluator` to run in parallel during `EVALUATE_EXEC`; findings are **advisory, orchestrator-weighed** (see §6).

4. **Ambient commands** — `/soe:simplify <path|diff>` (dispatch `over-engineering-reviewer`) + `/soe:over-eng-audit` (dispatch `over-engineering-auditor`). Same agents, no `/go` needed — for manual/ad-hoc use.

## 5. Risk-matrix intensity (reuses `lib/risk-matrix.js`)

Intensity scales **inversely with stakes**; a **docs-only change doesn't trigger it at all**:

| Change | Intensity |
|---|---|
| Docs / prose | **N/A (excluded)** — clarity + completeness, never reduced |
| Trivial code (safe, small) | **ultra** — max reduction (over-build traps) |
| Standard code | **full** |
| High-stakes code (auth/payment/crypto/secrets/SQL-migration/PII per the matrix) | **lite** + guardrails **enforced** (no shortcuts on validation/error-handling/security/the risky path) |

The worker inherits its task's tier (assigned at planning) → picks intensity. The **#432 guardrails are always on regardless of intensity** — so we get the savings without the hallucinate-a-variable failure mode.

## 6. Orchestrator-weighing (subordinate lens)

During `EVALUATE_EXEC` the evaluator runs `over-engineering-reviewer` in parallel with the correctness/security/integration evaluators. The orchestrator weighs its findings, **subordinate to integrity > simplicity:**

- **Correctness/security evaluators decide first.** An over-engineering finding **never** overrides a code-quality or security FAIL — fix real bugs first.
- **Substantive over-build on *safe* code** (net reduction above a threshold, non-high-stakes) → treated as a FIX dimension → `loop-fixer` applies reductions (bounded by the fix cap).
- **Minor findings / already-minimal code** → **logged advisory**, proceed (don't burn a fix cycle shaving a few lines).
- **High-stakes tier** → findings **advisory only**; never auto-reduce risky code; logged for the human.

## 7. Testing

- Skill/agent validity + reference-integrity (new skill, 2 agents, 2 commands must pass soe's gates; no dangling refs).
- A `lib/` helper if intensity-selection needs code: `minimalIntensity(tier)` mapping `trivial→ultra / standard→full / high-stakes→lite`, with a docs-only input → `none`. TDD it (mirrors risk-matrix pattern).
- Guard test: assert the discipline is referenced by the worker-template but NOT by any review/security/eval/spec agent (a grep-style test), and that the review agents scope to code (documented exclusion).
- All existing soe tests stay green.

## 8. Open-issue mitigations (folded in)

- **#502 (subagent bias):** no blanket hook — wired into worker-template only; two-dimensional guard keeps it off reviewers.
- **#432 (over-minimization/hallucination):** guardrails always on + intensity throttled by risk tier + orchestrator-weighing subordinate to correctness/security.
- **#501 (skill-name collisions):** renamed `minimal-code`; no recursive multi-copy packaging imported.

## 9. Build sequence (for the plan)

1. `skills/minimal-code/SKILL.md` (adapt ponytail core; add marker + guardrails + role tag).
2. `lib/minimal-intensity.js` + test (tier→intensity, docs→none).
3. Worker-template wiring (always-on, `.soe/config.json minimal_code` toggle, code-only note).
4. `over-engineering-reviewer` + `over-engineering-auditor` agents (code-only, tier-pinned).
5. `loop-execution-evaluator` wiring + orchestrator-weighing note (subordinate lens).
6. `/soe:simplify` + `/soe:over-eng-audit` commands.
7. Guard test + validity/refs green.
