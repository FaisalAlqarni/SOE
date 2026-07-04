# Orchestration Fix — Main-Session Orchestrator + Real Model Tiering

> **For Claude:** REQUIRED SUB-SKILL: execute task-by-task, TDD where lib code changes. DO NOT git commit (user handles git).

**Goal:** Make soe's multi-agent engine actually run (real leaf-agent dispatch) and make model tiering actually take effect (latest full IDs, with a config gate to disable Fable → fall back to Opus).

**Root cause (proven in the 0.2.0 shakedown):** the `/go*` commands dispatch `soe:soe-orchestrator` **as a subagent**. A subagent cannot spawn the nested planner/board/worker/evaluator subagents the orchestrator is built to fan out to, so it silently ran the whole loop inline as one Opus agent — no real board, no real workers, no tiering. Evidence: the run's orchestrator transcript made 35 Bash / 6 Read / 9 Write / 5 Edit calls and **0 Task calls**; zero leaf-agent transcripts exist for the run. Direct probes proved leaf agents dispatched **from the main session** DO honor their `model:` pins (fast-worker→`claude-sonnet-4-6`, haiku override→`claude-haiku-4-5`).

**Design intent we drifted from:** `soe-design.md §4.1` — *"The session model the user selects IS the orchestrator; subagents are pinned to other tiers."* The commands wired it one level too deep.

**Complexity:** Medium. **Risk:**
- MEDIUM: rewording commands could leave a stale "dispatch the agent" path → mitigate with a grep-guard test.
- MEDIUM: per-invocation model override must be reachable from the main session's Task tool (proven: the Agent tool exposes `model`) → strategist fable-disable relies on it.
- LOW: full-ID pins go stale as models advance → config `models` block is authoritative, frontmatter is fallback.

**Testing:** new `lib/model-resolve.js` unit tests (node:test); reference-integrity + validity; a guard test asserting commands orchestrate in-session; a live re-run of the todo shakedown verifying leaf-agent transcripts appear with the right tiers.

---

## Design decisions

1. **Main session is the orchestrator.** `/go`, `/go-auto`, `/go-all` stop dispatching the orchestrator agent. Instead they instruct the **main session** to load `skills/soe-orchestrator/SKILL.md` and run the loop itself, spawning leaf agents directly via `Task`. (The skill already contains the in-session loop logic.)

2. **`agents/soe-orchestrator.md` becomes a guardrail, not a trap.** Prominent top warning: if running as a dispatched subagent, STOP — you cannot spawn leaf agents; the main session must orchestrate. Kept only for ambient "orchestrate this" phrasing.

3. **Model tiers = latest full IDs**, config-authoritative:
   | Tier | Model | Agents |
   |---|---|---|
   | reasoner | `claude-opus-4-8` | loop-planner, loop-execution-evaluator, board-meeting, devils-advocate, deep-reasoner |
   | worker | `claude-sonnet-5` | loop-executor, loop-fixer, fast-worker |
   | cheap | `claude-haiku-4-5` | (config only; ad-hoc cheap work) |
   | strategist | `claude-fable-5` | strategist — **gated** |

4. **Fable gate.** `.soe/config.json` gains `"fable_enabled": true`. When `false`, the strategist tier resolves to `claude-opus-4-8`. Resolution is done by the orchestrator at dispatch time via a tested `resolveModel(config, tier)` helper, passed as the per-invocation `model` param on the `Task` call (per-invocation model outranks frontmatter). Frontmatter keeps the full-ID default for ambient invocation.

---

## Tasks

### Task 1: `lib/model-resolve.js` (TDD)
- **Create:** `lib/model-resolve.js`, `tests/model-resolve.test.js`
- `resolveModel(config, tier)` → returns model ID string.
  - Defaults: `reasoner→claude-opus-4-8`, `worker→claude-sonnet-5`, `cheap→claude-haiku-4-5`, `strategist→claude-fable-5`.
  - Honors `config.models[tier]` override when present.
  - If `tier==='strategist'` **and** `config.fable_enabled===false` → return the reasoner model (`claude-opus-4-8`).
  - Unknown tier → throw (fail-safe).
  - Missing/empty config → defaults; `fable_enabled` defaults to `true`.
- Tests: each tier default; config override; fable-enabled→fable; fable-disabled→opus; unknown-tier throws; empty-config defaults.

### Task 2: config scaffold — `lib/setup.js`
- Update the `models` block to full IDs + `strategist` + `cheap`; add `fable_enabled: true`.
- Preserve existing-config non-clobber behavior. Update/extend `tests/setup.test.js` assertions.

### Task 3: agent frontmatter → latest full IDs
- `opus` → `claude-opus-4-8`: loop-planner, loop-execution-evaluator, board-meeting, devils-advocate, deep-reasoner.
- `sonnet` → `claude-sonnet-5`: loop-executor, loop-fixer, fast-worker.
- `fable` → `claude-fable-5`: strategist.
- soe-orchestrator stays unpinned (session model).

### Task 4: rewire the three commands (main-session orchestration)
- In `commands/go.md`, `go-auto.md`, `go-all.md`: change the "Dispatch the orchestrator" step and the intro/related lines from *"Use the soe:soe-orchestrator agent to run…"* to *"Load the `soe:soe-orchestrator` skill and run the Evaluate-Loop yourself in THIS session — you are the orchestrator; dispatch the leaf agents (planner/board/workers/evaluator/fixer) directly via Task. Do NOT dispatch the orchestrator as a subagent."*
- Keep `allowed_tools` including `Task`.

### Task 5: orchestrator SKILL — in-session framing + config-driven model dispatch
- `skills/soe-orchestrator/SKILL.md`: assert it runs as the main session; when dispatching each leaf agent, resolve the tier's model via `resolveModel(config, tier)` and pass it as the `Task` `model` param. Document the fable gate.

### Task 6: neuter `agents/soe-orchestrator.md`
- Add the top guardrail warning (Decision 2).

### Task 7: model-orchestration skill + docs honesty
- `skills/model-orchestration/SKILL.md`: replace *"aliases … never full IDs"* with latest-full-ID guidance + fable-gate note.
- Update `soe-design.md` / README multi-model section to state: main session orchestrates, leaf agents tier-pinned via full IDs, Fable config-gated. Remove overselling.

### Task 8: regression guard test
- `tests/orchestration-wiring.test.js`: assert none of the three commands contain "Use the soe:soe-orchestrator agent" (the trap phrasing), and each instructs in-session orchestration. Fails RED against current files first.

### Task 9: verify
- `npm test` (validity + refs + node:test) all green.
- Sync to installed cache (bump handled separately by user).
- **Live proof:** re-run a fresh `/go-auto` shakedown; confirm leaf-agent transcripts now appear, with planner=opus-4-8 and workers=sonnet-5 (inspect transcript `model` fields). This is the acceptance criterion.

---

## Acceptance criteria
1. A `/go-auto` run produces **real** leaf-agent transcripts (planner, board, ≥1 worker, evaluator) — not an all-inline orchestrator.
2. Worker transcripts show `claude-sonnet-5`; planner/board/evaluator show `claude-opus-4-8`.
3. With `fable_enabled:false`, a strategist dispatch shows `claude-opus-4-8`; with `true`, `claude-fable-5`.
4. `npm test` green, including the new resolveModel tests and the wiring guard.
5. No command contains the trap phrase "Use the soe:soe-orchestrator agent."

---
**READY?** Proceed / Modify / Devil's-advocate first.
