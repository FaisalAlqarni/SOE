# Minimal-Code (Ponytail) Integration — Implementation Plan (v2 — token-first, post adversarial review)

> **For Claude:** REQUIRED SUB-SKILL: Use sp-ecc:subagent-driven-development to execute this plan task-by-task.

**Goal:** Bundle ponytail's minimal-code *discipline* into soe as **pure prose discipline** (faithful to ponytail, a net token *saver*): a `minimal-code` skill applied always-on in implementation workers via the worker-template they already load, intensity **self-assessed** from each task's existing `writing-plans` Risks annotation, plus two advisory over-engineering review agents (primary path: ambient commands), guarded to implementation-code only.

**Architecture:** No new runtime machinery. The discipline is markdown the worker already reads; intensity is self-assessed from the plan's per-task Risks field (already produced by `soe:writing-plans`) — **nothing is computed or injected per-task, so no added tokens.** Deliberately **no `lib/` helper** (a computed intensity lib would be dead code AND add per-dispatch token cost — the exact over-engineering ponytail argues against). Only tests + markdown + a config flag.

**Tech Stack:** Claude Code plugin markdown (skills/agents/commands); Node `node:test` for the guard test only; soe's existing `skills/soe-workers/worker-template.md`, `agents/loop-execution-evaluator.md`, `skills/soe-orchestrator/SKILL.md`, `lib/setup.js`.

**Complexity:** Low (~6 tasks, mostly copy-then-adapt markdown; one dev-time guard test; one config default).

**Risks:**
- HIGH: leaking laziness into reviewers/security (ponytail #502) — mitigated by wiring into the worker-template only + a **programmatic** guard test (globs the reviewer/security/eval/spec set) + a **SessionStart-hook audit** confirming no global minimal-code injection.
- MEDIUM: over-minimization/hallucination (ponytail #432) — mitigated by **TDD as the backstop** (a hallucinated symbol fails the test) + always-on guardrails + intensity throttled (self-assessed, lite on high-stakes).
- MEDIUM: reducing docs — mitigated by the **code-only** rule in the skill/template/review-agents (docs→skip; docs follow soe's writing discipline, referenced by name not a `soe:` token to avoid a phantom ref).
- LOW/token: extra reviewer pass taxing every run — mitigated by making the pipeline over-engineering lens **config-gated + skip-trivial/docs + advisory-only**; the primary path is the on-demand ambient commands.

**Testing:** One `node:test` guard test (programmatic implementation-only + code-only + content-presence assertions); soe's `test:validity` + `test:refs` gate the new skill/agents/commands; all existing tests stay green. No new lib to unit-test (by design).

**Working dir:** `/development/soe`, default branch. Design: `docs/plans/2026-07-04-minimal-code-integration-design.md` (note: the design's `lib/minimal-intensity.js` is **superseded** — self-assessed prose instead, per the token constraint).

---

### Task 1: `minimal-code` skill (adapt ponytail core, self-assessed intensity)

**Files:**
- Create: `/development/soe/skills/minimal-code/SKILL.md`
- Reference (read-only): `/development/_sources/ponytail/skills/ponytail/SKILL.md`

**Depends on:** none

**Step 1: Author the skill (copy-then-adapt — minimal edits, don't regenerate).** Copy ponytail's core `SKILL.md`, then adapt:
- Frontmatter `name: minimal-code`, a `description`, `metadata: role: implementation-discipline`.
- Keep the 7-rung ladder + *"stop at the first rung that holds"* + the `soe:minimal` marker convention (renamed from `ponytail:`; a code comment flagging a deliberate shortcut).
- Keep the **"when NOT to be lazy"** guardrails verbatim in spirit (validation, error handling, security, a11y, *"never lazy about understanding,"* *"shortest **working** diff"*).
- **Self-assessed intensity table (inline — no lib):** *"Pick intensity from this task's risk (use the plan's per-task Risks field; if absent, judge the change): docs/prose → **skip (never minimize docs)**; trivial safe code → **ultra**; normal code → **full**; high-stakes code (auth/payment/crypto/secrets/SQL-migration/PII) → **lite** + guardrails enforced."*
- **Two-dimensional guard section:** (a) **implementation only** — never review/security/audit/spec agents; (b) **code only** — never documentation/READMEs/how-to guides/tutorials/human-facing prose (those follow soe's writing-clearly discipline — refer to it by plain name, NOT `soe:writing-clearly`, which is a supporting file not a skill).
- **#432 note:** *"TDD is the backstop — every shortcut must keep the test green; a hallucinated symbol fails the test."*

**Step 2: Validate.** `node /development/soe/scripts/rename-namespace.mjs skills`. `cd /development/soe && npm run test:validity` → PASS. `npm run test:refs` → CLEAN (do NOT introduce a `soe:writing-clearly` ref).

**Step 3: Commit.** `git add skills/minimal-code && git commit -m "feat: minimal-code discipline skill (self-assessed intensity, code-only, TDD backstop)"`

---

### Task 2: Worker-template wiring + config toggle (always-on, code-only)

**Files:**
- Modify: `/development/soe/skills/soe-workers/worker-template.md`
- Modify: `/development/soe/lib/setup.js` (config default) + `/development/soe/tests/setup.test.js` (assert it)

**Depends on:** Task 1

**Step 1: Config default (TDD).** In `tests/setup.test.js` extend the defaults test to assert `runSetup(dir)` writes `.soe/config.json` with `minimal_code: true`. Run → FAIL. Add `minimal_code: true` to `defaultConfig()` in `lib/setup.js`. Run → PASS.

**Step 2: Wire the worker-template (one inserted block, don't rewrite).** After the existing TDD-mandatory section add: *"**Minimal-code (if `.soe/config.json` `minimal_code` is true — default):** apply `soe:minimal-code`. Self-assess intensity from this task's Risks annotation (docs→skip, trivial→ultra, normal→full, high-stakes→lite). Write the shortest diff that passes the test **and is understood**. **Code only — never minimize documentation.** Mark deliberate shortcuts with `soe:minimal`."*  (The worker already loads this template — zero added tokens beyond the skill's own small length.)

**Step 3: Validate.** `node scripts/rename-namespace.mjs skills`. `npm run test:all` → GREEN.

**Step 4: Commit.** `git add skills/soe-workers/worker-template.md lib/setup.js tests/setup.test.js && git commit -m "feat: workers apply minimal-code (always-on, self-assessed, config-disableable, code-only)"`

---

### Task 3: Over-engineering review agents (code-only, judgment, advisory)

**Files:**
- Create: `/development/soe/agents/over-engineering-reviewer.md`, `/development/soe/agents/over-engineering-auditor.md`
- Reference (read-only): `/development/_sources/ponytail/skills/{ponytail-review,ponytail-audit}/SKILL.md`

**Depends on:** Task 1

**Step 1: Author `over-engineering-reviewer.md`** (copy-then-adapt ponytail-review): `name: over-engineering-reviewer`, `description` (reviews a **diff** for reducible code), **`model: opus`** (this requires *judgment* — trace the flow before claiming reducibility — NOT a mechanical grep; opus matches soe's other reviewers). Body: hunt reducible code (`delete:/stdlib:/native:/yagni:/shrink:`), end `net: -N lines possible` + severity. **Rules: reviews CODE only — skip docs/prose; never flag documentation length. Verify each suggested reduction still references real symbols (don't propose a hallucinated shorter form). Advisory — the orchestrator/human decides.**

**Step 2: Author `over-engineering-auditor.md`** — same, repo-wide (`name: over-engineering-auditor`, `model: opus`, code-only, verify-real-symbols, advisory).

**Step 3: Validate.** `node scripts/rename-namespace.mjs agents`. `npm run test:validity` → PASS (valid `model` aliases). `npm run test:refs` → CLEAN.

**Step 4: Commit.** `git add agents/over-engineering-reviewer.md agents/over-engineering-auditor.md && git commit -m "feat: over-engineering review+audit agents (opus, code-only, advisory)"`

---

### Task 4: Ambient commands (the primary, token-frugal path)

**Files:**
- Create: `/development/soe/commands/simplify.md`, `/development/soe/commands/over-eng-audit.md`

**Depends on:** Task 3

**Step 1: `commands/simplify.md`** — `name: simplify`, `allowed_tools: Read, Task`; `/soe:simplify [path|diff]` dispatches `soe:over-engineering-reviewer` on the target (or current diff). On-demand, no `/go`, zero pipeline tax.

**Step 2: `commands/over-eng-audit.md`** — `name: over-eng-audit`; dispatches `soe:over-engineering-auditor` repo-wide.

**Step 3: Validate.** `node scripts/rename-namespace.mjs commands`. `npm run test:refs` → CLEAN. `npm run test:all` → GREEN.

**Step 4: Commit.** `git add commands/simplify.md commands/over-eng-audit.md && git commit -m "feat: /soe:simplify + /soe:over-eng-audit ambient commands"`

---

### Task 5: Pipeline lens wiring — advisory, config-gated, token-frugal

**Files:**
- Modify: `/development/soe/agents/loop-execution-evaluator.md`
- Modify: `/development/soe/skills/soe-orchestrator/SKILL.md`
- Modify: `/development/soe/lib/setup.js` (+ test) — add `over_engineering_lens: "on-demand"` config default

**Depends on:** Task 3

**Step 1: Config default (TDD).** Assert `runSetup` writes `over_engineering_lens: "on-demand"` (default: NOT in the pipeline — ambient only, to avoid taxing every run). Values: `"on-demand" | "code-changes" | "off"`. RED → add to `defaultConfig()` → GREEN.

**Step 2: Evaluator wiring (one inserted block).** In `loop-execution-evaluator.md`: *"If `.soe/config.json` `over_engineering_lens` == `code-changes` AND the change is code (not docs) AND not trivial, also dispatch `soe:over-engineering-reviewer` in parallel — **advisory**. Skip entirely when `on-demand` (default) or `off`."*

**Step 3: Orchestrator-weighing (one inserted block — resolve the advisory/FIX contradiction).** In `soe-orchestrator.md` `EVALUATE_EXEC`: *"The over-engineering lens is **advisory only — it never produces a FAIL verdict and never routes to FIX** (avoids extra token-costly loops). Correctness/security evaluators own the verdict. Its `net: -N` findings are **logged to decision-log.md**; on substantive over-build of *safe* code the orchestrator MAY note a follow-up `/soe:simplify` rather than auto-fixing. High-stakes → advisory, never reduce."*

**Step 4: Validate.** `node scripts/rename-namespace.mjs agents && node scripts/rename-namespace.mjs skills`. `npm run test:all` → GREEN; `test:refs` CLEAN.

**Step 5: Commit.** `git add agents/loop-execution-evaluator.md skills/soe-orchestrator lib/setup.js tests/setup.test.js && git commit -m "feat: over-engineering lens (advisory, config-gated off-by-default, no FIX loops)"`

---

### Task 6: Guard test (#502) + SessionStart audit + content criteria + final verification

**Files:**
- Create: `/development/soe/tests/minimal-code-guard.test.js`

**Depends on:** Tasks 1–5

**Step 1: Write the guard test** (ESM node:test) — make assertions PROGRAMMATIC and precise:
- **Content presence:** `skills/minimal-code/SKILL.md` contains the 7-rung ladder markers, the guardrails ("when NOT to be lazy"), the **code-only** exclusion (grep "never minimize" / "documentation"), and the `soe:minimal` marker — so an empty-bodied-but-valid skill fails.
- **Implementation-only (#502), programmatic:** glob the reviewer/security/eval/spec set — `agents/*review*.md`, `agents/*security*.md`, `agents/*audit*.md`, `agents/architect.md`, `skills/eval-*/SKILL.md`, `skills/adversarial-review/SKILL.md`, `skills/soe-workers` excluded — and assert **none is instructed to APPLY minimal-code to its own work** (fail on an imperative like `apply soe:minimal-code`/`be minimal`/`be lazy` directed at itself; the over-engineering agents may *hunt* reducible code — assert precisely that they don't tell themselves to be minimal). Assert the **worker-template DOES** reference `minimal-code`.
- **SessionStart-hook audit:** assert `hooks/session-start.sh` / `hooks/session-start.js` do NOT inject `minimal-code`/`be lazy` globally (grep the hook + what it cats — it injects `using-soe`; assert `using-soe` doesn't carry a global lazy directive). Closes the leak path the review flagged.

**Step 2: Run → iterate to green.** `node --test tests/minimal-code-guard.test.js` → fix any leak until PASS.

**Step 3: Full verification.** `npm run test:all` GREEN; `bash tests/reference-integrity.sh` CLEAN; `npm run test:validity` PASS.

**Step 4: Commit.** `git add tests/minimal-code-guard.test.js && git commit -m "test: minimal-code guard — programmatic impl-only + code-only + SessionStart audit (#502)"`

---

## After all tasks
- Run soe's verification-loop (test:all + validity + refs + harness-L1 + bundled-exec) — all green.
- Confirm the **net-token story holds**: the discipline is a small prose skill the worker already loads; no per-task computation/injection; the pipeline lens is off-by-default (ambient-only). It should reduce output tokens, not add overhead.
- No publish (soe AGPL permission gate still open).

---
**READY?** Proceed / Modify: [changes] / Different approach: [alternative]

**Plan v2 saved to `docs/plans/2026-07-04-minimal-code-integration-plan.md`. Ready to execute?** (REQUIRED SUB-SKILL on approval: sp-ecc:subagent-driven-development.)
