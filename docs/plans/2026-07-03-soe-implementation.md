# soe Implementation Plan (v2 — post adversarial review)

> **For Claude:** REQUIRED SUB-SKILL: Use sp-ecc:executing-plans (or soe:executing-plans once built) to implement this plan task-by-task. Execute via subagent-driven-development after approval.

**Goal:** Build `soe` — a lean, AGPL-licensed Claude Code plugin fusing the Superpowers 6.1.1 discipline pipeline with a simplified, real (tested) multi-agent orchestration engine, the few ECC/user process-meta skills that improve the pipeline, the user's rules/logging/instinct system, cross-plugin capability discovery, and tiered multi-harness support.

**Architecture:** New repo at `/development/soe`. Markdown skills/agents/commands drive behavior; a set of **real, tested `lib/` JS scripts** provide every reliability-critical primitive (atomic + single-writer state I/O, resume with idempotency guard, bounded-loop guard, deterministic risk matrix, scrutiny selector, escalation gate, capability scan). Orchestration is an Evaluate-Loop where the orchestrator **spawns worker subagents and awaits their returns** (the completion signal) then applies results **serially** — no message bus, no concurrent shared-state writes. State splits into `docs/plans/` (human) + `.soe/` (machine).

**Tech Stack:** Claude Code plugin format; Node.js (`node:test`) for `lib/` + tests; POSIX shell for skill validity/reference-integrity; GitHub Actions CI; `ecc-agentshield` (npm, pinned); optional MCP for graphify.

**Complexity:** High (multi-week, phased).

**Design-adherence principle:** load-bearing invariants live in **tested `lib/` code**, not prose. Where an invariant can only be enforced by an LLM following a skill (inherent to the platform), the honest path is routed through a tested lib function that logs, and the residual LLM-adherence risk is stated explicitly — never claimed as a hard guarantee.

**Risks:**
- HIGH: engine reliability — mitigated by atomic + single-writer `lib/state.js`, `lib/resume.js` idempotency guard, subagent-return completion model, `lib/loop-guard.js`, and engine-mechanics tests.
- HIGH: integrity-vs-token inversion — mitigated by deterministic `lib/risk-matrix.js` + `lib/scrutiny.js` (all downscoping routed + logged through it) + dangerous-change corpus.
- MEDIUM: dangling / un-rewritten namespace refs — mitigated by a reference-integrity test that fails on BOTH dangling `soe:` and any residual `superpowers:`/`supaconductor:`/`sp-ecc:`.
- MEDIUM: merge completeness — canonical ECC inventory (277 unique) + completeness gate.
- MEDIUM: supply-chain of bundled scripts — AgentShield-on-self + bundled-exec audit.
- MEDIUM: prose-enforced invariants (single-writer, risk-call, irreversible-confirm) — minimized by routing through tested libs + integration-style driver tests; residual acknowledged.

**Testing:** Unit (`node:test`) for every `lib/`; shell tests for validity + reference-integrity (incl. old-namespace); engine mechanics (atomic+lock state, resume+idempotency, bounded loops, isolation); scrutiny corpus; escalation-irreversible driver; discovery fallback; graphify blast-radius; collapsed-board JSON contract; hook behavior; security self-audit gate. All green in CI before merge.

**Revision note (v4 — post 2nd adversarial pass + Advisor eval):** de-risks multi-model orchestration. Fable 5 **confirmed real** (user's `/model`), addressed via the `fable` **alias** (not full ID). **Advisor NOT used** (Anthropic-API-only; user is on a Claude *subscription*). Topology is **session-model-led + self-selected** from the `model-orchestration` skill (no fragile SessionStart model-detection); **no runtime auto-fallback** (user picks the model); **no deterministic Fable-spend gate** (user-managed). Model-pinned agents use aliases `fable`/`opus`/`sonnet`; existing loop agents are tier-pinned directly (no duplicated tiering, F15). Context firewall uses an **absolute shared scratch dir outside worktrees** (F5) with a tested `lib/firewall-return.js` validator for the `path+summary+confidence` contract (F12). Ambient use stated modestly (orchestrator-chooses-to-delegate, guided by the skill — not an enforced mechanism, F6/F11). `codex-peer` stays optional/experimental.

**Revision note (v3):** added multi-model orchestration (design §4.1) — superseded by v4 above.

**Revision note (v2):** folds in all 18 adversarial-review findings — canonical ECC inventory (F1), model-routing sourced from the user repo (F2), real crash-split atomic test (F3), explicit subagent-return worker model (F4), P2 reordered so leaf agents precede the orchestrator (F5,F10), single-writer lock + meaningful isolation test (F6), scrutiny routed through a tested lib (F7), old-namespace reference guard (F8), `lib/loop-guard.js` tested with the enforcer (F9), finishing-branch absorption task (F16), escalation-irreversible driver test (F11), graphify blast-radius test (F12), extras-absent fallback test (F13,F17), resume idempotency guard (F14,F18), Layer-1 multi-harness scoped with acceptance criteria (F15), AGPL publish gate (F14-legal), P1.9 split with hook tests (F17), collapsed-board JSON contract test (F18-board).

**Phasing (each independently shippable):** P0 scaffold → P1 discipline → P2 engine → P3 gates/modes/learning → P4 discovery/security → P5 ECC merge/companion/multi-harness/migration.

**Source clones (read-only):** Superpowers 6.1.1 `/development/_sources/superpowers`; ECC 2.0 `/development/_sources/ECC`; Conductor 3.7.0 `/development/_sources/conductor-orchestrator-superpowers`; user flavours `/development/superpower-ecc`; 3-way baselines `/development/_sources/superpowers-4.1.1`, `/development/_sources/ECC-1.7.0`.

---

## Phase P0: Scaffold & guardrails

### Task P0.1: Node project + test harness

**Files:** Create `package.json`, `tests/.gitkeep`

**Steps:**
1. `package.json`: `"name":"soe"`, `"private":true`, `"type":"module"`, scripts `test`→`node --test tests/`, `test:refs`→`bash tests/reference-integrity.sh`, `test:validity`→`bash tests/skill-validity.sh`, `test:all`→`npm run test:validity && npm run test:refs && npm test`, `"license":"AGPL-3.0"`.
2. Create `tests/.gitkeep`.
3. Run `cd /development/soe && node --test tests/` → Expected: passes, 0 tests.
4. Commit: `git add package.json tests/.gitkeep && git commit -m "chore: node+shell test harness"`

### Task P0.2: Plugin manifests

**Files:** Create `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`; Test `tests/manifest.test.js`

**Step 1:** Write `tests/manifest.test.js` asserting `plugin.json` parses, `name==='soe'`, `license==='AGPL-3.0'`, semver version, description length > 10.
**Step 2:** `node --test tests/manifest.test.js` → FAIL (ENOENT).
**Step 3:** Write `plugin.json` (name `soe`, version `0.1.0`, license `AGPL-3.0`, author Faisal Alqarni, description, keywords) + `marketplace.json` (owner Faisal, one plugin `soe` source `./`).
**Step 4:** Re-run → PASS.
**Step 5:** `git add .claude-plugin tests/manifest.test.js && git commit -m "feat: plugin + marketplace manifests"`

### Task P0.3: Licensing & credit

**Files:** Create `LICENSE` (AGPL-3.0), `LICENSES/{soe-AGPL-3.0,superpowers-MIT,ECC-MIT,conductor-AGPL-3.0}.txt`, `NOTICE.md`

**Steps:**
1. Copy AGPL text (from `/development/_sources/conductor-orchestrator-superpowers/LICENSE`) → `LICENSE` + `LICENSES/soe-AGPL-3.0.txt`.
2. Copy MIT texts from superpowers + ECC clones; conductor AGPL → its file.
3. `NOTICE.md` credits Jesse Vincent (Superpowers, MIT), Affaan Mustafa (ECC, MIT), Ibrahim (Conductor, AGPL); state "distributed under AGPL-3.0 per authors' reuse permission." **Add a checkbox: `[ ] written permission from Ibrahim attached (BLOCKS publish — see P5.6)`.**
4. Commit: `git add LICENSE LICENSES NOTICE.md && git commit -m "docs: AGPL license + upstream credit + permission checklist"`

### Task P0.4: Skill/agent validity test

**Files:** Create `tests/skill-validity.sh`, `tests/fixtures/{valid-skill,invalid-skill}/SKILL.md`

**Step 1:** Write `skill-validity.sh` scanning `skills/*/SKILL.md` + `agents/*.md` for frontmatter with non-empty `name:` + `description:`; accepts a dir arg for fixtures.
**Step 2:** With an invalid fixture (no description), `bash tests/skill-validity.sh tests/fixtures` → FAIL naming it.
**Step 3:** Complete the script (awk frontmatter parse, aggregate exit code).
**Step 4:** `bash tests/skill-validity.sh tests/fixtures/valid-skill` → PASS.
**Step 5:** `git add tests/skill-validity.sh tests/fixtures && git commit -m "test: skill/agent frontmatter validity"`

### Task P0.5: Reference-integrity test (dangling + old-namespace)

**Files:** Create `tests/reference-integrity.sh`, `tests/fixtures/refs/…`

**Step 1:** Write `reference-integrity.sh` that (a) greps `soe:[a-z0-9-]+` across `skills/ agents/ commands/`, builds the existing skill/agent/command name set, fails on any dangling target; AND (b) **fails on any residual `superpowers:`/`supaconductor:`/`orchestrator-supaconductor:`/`sp-ecc:` token** (case-insensitive) — closing the rename blind spot.
**Step 2:** Fixture referencing `soe:missing` and one containing `sp-ecc:foo` → run → FAIL on both.
**Step 3:** Implement both checks.
**Step 4:** Fix the fixtures → PASS.
**Step 5:** `git add tests/reference-integrity.sh tests/fixtures/refs && git commit -m "test: reference-integrity (dangling + residual old-namespace)"`

### Task P0.6: Namespace-rename tool

**Files:** Create `scripts/rename-namespace.mjs`; Test `tests/rename-namespace.test.js`; `tests/fixtures/rename/before.md`

**Step 1:** Test that the transform rewrites `orchestrator-supaconductor:`/`supaconductor:`/`sp-ecc:`/`superpowers:` → `soe:` and leaves other text intact.
**Step 2:** `node --test tests/rename-namespace.test.js` → FAIL.
**Step 3:** Implement `rename-namespace.mjs` (walk dir, replace prefixes, write back; export transform).
**Step 4:** Re-run → PASS.
**Step 5:** `git add scripts/rename-namespace.mjs tests/rename-namespace.test.js tests/fixtures/rename && git commit -m "feat: namespace-rename tool"`

### Task P0.7: CI + doc stubs

**Files:** Create `.github/workflows/ci.yml`, `docs/ARCHITECTURE.md`, `README.md`, `SECURITY.md` (stubs)

**Steps:**
1. `ci.yml`: on push/PR → setup Node 20 → `npm ci || true` → `npm run test:all`.
2. One-paragraph stubs so links resolve.
3. `npm run test:all` → all green.
4. Commit: `git add .github docs README.md SECURITY.md && git commit -m "ci: validity+refs+unit"`

---

## Phase P1: Discipline pipeline

Imports SP 6.1.1 discipline skills, applies merit-based flavour merges, adopts process gates, and lands rules/logging/instincts + `using-soe`. Note: `subagent-driven-development` and `finishing-a-development-branch` are imported as SP 6.1.1 bases here; their engine ABSORPTION happens in P2/P3.

### Task P1.1: Import SP 6.1.1 discipline skills

**Files:** Create `skills/{brainstorming,writing-plans,executing-plans,subagent-driven-development,test-driven-development,systematic-debugging,verification-before-completion,using-git-worktrees,finishing-a-development-branch,requesting-code-review,receiving-code-review,writing-skills,dispatching-parallel-agents}/`

**Depends on:** P0
**Steps:** 1. Copy each from `/development/_sources/superpowers/skills`. 2. `node scripts/rename-namespace.mjs skills`. 3. `npm run test:validity && npm run test:refs` → PASS (import any referenced-but-missing skill or trim ref). 4. `git commit -m "feat: import SP 6.1.1 discipline skills"`

### Task P1.2: Merge brainstorming flavour
**Files:** Modify `skills/brainstorming/SKILL.md`; add `skills/brainstorming/{elements-of-style,writing-clearly-and-concisely}.md` (from user repo)
**Depends on:** P1.1
**Steps:** 1. Graft user's **4-option menu** + **workspace-prompt**; copy the two supporting files; preserve the HARD-GATE. 2. validity+refs → PASS. 3. `git commit -m "feat: brainstorming 4-option+workspace flavour"`

### Task P1.3: Merge test-driven-development flavour
**Files:** Modify `skills/test-driven-development/SKILL.md` (+ optional `reference.md` if >120 lines)
**Depends on:** P1.1
**Steps:** 1. Base SP Iron Law + ECC RED-gate (compile-time-RED, runner detection, evidence report) + user Step-0 Define-the-API / coverage tiers / common-mistakes. 2. Progressive-disclosure only if the file exceeds ~120 lines. 3. validity+refs → PASS. 4. `git commit -m "feat: TDD merged (iron-law+RED-gate+user additions)"`

### Task P1.4: Merge writing-plans flavour + SP schema + idempotency criterion
**Files:** Modify `skills/writing-plans/SKILL.md`
**Depends on:** P1.1
**Steps:** 1. Base SP 6.1.1 (Global Constraints + per-task Interfaces) + user per-task Depends-on/Risks/Testing + Requirements Restatement + Phasing + Red Flags. 2. **Add an explicit acceptance rule: every task that mutates state/commits must be written to be idempotent / safe to re-run** (supports resume, F14/F18). 3. validity+refs → PASS. 4. `git commit -m "feat: writing-plans merged + idempotency criterion"`

### Task P1.5: Adopt ECC process gates
**Files:** Create `skills/{search-first,intent-driven-development,strategic-compact}/`
**Depends on:** P1.1
**Steps:** 1. Copy from ECC; verify free/MIT (grep paywall markers). 2. Strip agent-name coupling from search-first; rebrand. 3. Cross-link brainstorming→intent-driven, execution→search-first. 4. validity+refs → PASS. 5. `git commit -m "feat: ECC process gates"`

### Task P1.6: Multi-model orchestration (skill + model-pinned agents) — replaces model-routing (design §4.1)
**Files:** Create `skills/model-orchestration/SKILL.md`, `agents/strategist.md`, `agents/deep-reasoner.md`, `agents/fast-worker.md`; Test `tests/model-agents.test.js`
**Depends on:** P1.1
**Step 1:** Test: each agent's frontmatter uses a **valid Claude Code model alias** (`fable` / `opus` / `sonnet` — NOT full IDs like `claude-fable-5`, and NOT any other string). Pins: `strategist`→`fable`, `deep-reasoner`→`opus`, `fast-worker`→`sonnet`. The test rejects any non-alias value. (Runtime confirmation that the pin actually routes is manual — a unit test can only assert a valid alias.)
**Step 2:** `node --test tests/model-agents.test.js` → FAIL.
**Step 3:** Author the three model-pinned agents (roles per §4.1: `strategist`=Fable top-tier judgment (used when the orchestrator is *not* Fable), `deep-reasoner`=opus reasoning/debug, `fast-worker`=sonnet mechanical) with concise prompts + the context-firewall return contract (`path + 3-line summary + confidence`). Author `model-orchestration` skill holding the **session-model-led topology profiles** (On Fable → Fable orchestrates, deep-reasoner+fast-worker; On Opus → Opus orchestrates, fast-worker, strategist only if Fable available; On Sonnet → Sonnet orchestrates, deep-reasoner) — the orchestrator **self-selects** its profile from its own model identity. **No runtime auto-fallback** (the user picks the model). **No Advisor** (API-only; user is on subscription). **No deterministic Fable-spend gate** (user-managed). Do NOT copy ECC/user `model-routing`.
**Step 4:** Re-run → PASS; validity+refs → PASS.
**Step 5:** `git commit -m "feat: multi-model orchestration skill + model-pinned agents"`

### Task P1.7: Rules compiled in
**Files:** Create `rules/common/*` (from user repo); Modify governing skills to cross-link
**Depends on:** P1.1
**Steps:** 1. Copy all `rules/common/*.md`. 2. Add "Applies rule: `rules/common/<x>.md`" cross-links in governing skills (security→security.md, TDD→testing.md, finishing→git-workflow.md, etc.). 3. validity+refs → PASS. 4. `git commit -m "feat: rules/common compiled into skills"`

### Task P1.8: Logging (into core)
**Files:** Create `skills/logging-best-practices/`, `commands/logging.md`, `agents/logging-reviewer.md`
**Depends on:** P1.1
**Steps:** 1. Copy user's wide-events logging skill+command+reviewer. 2. Rebrand. 3. validity+refs → PASS. 4. `git commit -m "feat: wide-events logging in core"`

### Task P1.9: Continuous-learning / instinct system
**Files:** Create `skills/{continuous-learning-v2,extract-patterns}/`, `commands/{evolve,learn,learn-eval,instinct-export,instinct-import,instinct-status}.md`
**Depends on:** P1.1
**Steps:** 1. Copy user's skills + six commands. 2. Rebrand; note observation-hook wiring lands in P1.11. 3. validity+refs → PASS. 4. `git commit -m "feat: continuous-learning/instinct system"`

### Task P1.10: `using-soe` bootstrap + SessionStart (design §4.1)
**Files:** Create `skills/using-soe/SKILL.md`, `hooks/session-start.sh`, `lib/skills-core.js`; Test `tests/session-start.test.js`
**Depends on:** P0, P1.1, P1.6
**Step 1:** Test: `bash hooks/session-start.sh` stdout is valid JSON with `hookSpecificOutput.hookEventName==='SessionStart'` and `additionalContext` containing "soe".
**Step 2:** `node --test tests/session-start.test.js` → FAIL.
**Step 3:** Adapt user's `session-start.sh` + `skills-core.js` (rebrand); author `using-soe` (adapt using-sp-ecc + conductor entry contract) and have it reference the `model-orchestration` skill. **No model-detection branch in the hook** (SessionStart doesn't receive the session model reliably); the orchestrator **self-selects** its topology profile from the `model-orchestration` skill based on its own model identity.
**Step 4:** Re-run → PASS.
**Step 5:** `git commit -m "feat: using-soe + SessionStart hook (tested)"`

### Task P1.11: Port hooks.json + git-guard test (split from old P1.9, F17)
**Files:** Create `hooks/hooks.json`, `hooks/run-hook.cmd`; Test `tests/git-guard.test.js`
**Depends on:** P1.10
**Step 1:** Test: the PreToolUse git-guard blocks a destructive command (e.g. `git push --force`) and allows a normal `git commit` (drive the hook script with a fixture tool-call payload; assert block/allow).
**Step 2:** `node --test tests/git-guard.test.js` → FAIL.
**Step 3:** Port user's richer `hooks.json` (git guards, PostToolUse format, learning-eval, compaction nudges) + `run-hook.cmd`, rebranded; wire the observation hooks for P1.9.
**Step 4:** Re-run → PASS.
**Step 5:** `git commit -m "feat: port hooks.json + git-guard (tested)"`

### Task P1.12: Meta commands
**Files:** Create `commands/skill-create.md`, `skills/skill-create/`, `skills/skill-stocktake/` (base)
**Depends on:** P1.1
**Steps:** 1. Copy skill-create (git-history miner) + skill-stocktake base (full ECC merge in P5). 2. Rebrand. 3. validity+refs → PASS. 4. `git commit -m "feat: skill-create + skill-stocktake base"`

---

## Phase P2: Real orchestration engine

Real tested `lib/` primitives, `.soe/` layout, `/setup`, then **leaf agents (planner/executor/evaluator/fixer, workers, board, evaluators) BEFORE the orchestrator** that references them (F5/F10), then `/go`. Worker model is explicit (F4): orchestrator spawns worker subagents via the Task tool and **awaits their returns** (completion signal); results applied serially by the sole state writer.

### Task P2.1: `lib/state.js` — atomic + single-writer state store (F3,F6)
**Files:** Create `lib/state.js`; Test `tests/state.test.js`
**Depends on:** P0
**Step 1:** Tests: (a) `writeTmp(dir,obj)` then `commitRename(dir)` round-trips via `readState`; (b) after `writeTmp` only (no rename), `readState` returns the PRIOR committed value — proving no torn read (real crash-split, F3); (c) `withWriterLock(dir, fn)` throws if a lock is already held (single-writer, F6); (d) a spawned child process killed mid-`withWriterLock` leaves a stale lock that `withWriterLock` reclaims after TTL.
**Step 2:** `node --test tests/state.test.js` → FAIL.
**Step 3:** Implement: `writeTmp`→`state.json.tmp`+fsync; `commitRename`→atomic rename; `writeState`=writeTmp+commitRename; `readState`; `withWriterLock` (create `state.lock` exclusively `wx`, TTL reclaim, release in `finally`); `markTaskComplete(dir,taskId,commitSha)`.
**Step 4:** Re-run → PASS.
**Step 5:** `git commit -m "feat(engine): atomic + single-writer state store"`

### Task P2.2: `lib/resume.js` — resume + idempotency guard (F14,F18)
**Files:** Create `lib/resume.js`; Test `tests/resume.test.js`
**Depends on:** P2.1
**Step 1:** Tests: `resumePoint(state)` returns first non-completed task; completed skipped; in-flight task returned for re-run; **`isAlreadyApplied(task, git)` returns true when the task's recorded commitSha is already in the branch → resume skips it instead of re-running** (idempotency guard, F18).
**Step 2:** → FAIL.
**Step 3:** Implement reading `state.json` as single source of truth; `isAlreadyApplied` checks recorded commitSha via `git cat-file -e`.
**Step 4:** → PASS.
**Step 5:** `git commit -m "feat(engine): resume + idempotency guard"`

### Task P2.3: `lib/gitignore-manager.js`
**Files:** Create `lib/gitignore-manager.js`; Test `tests/gitignore-manager.test.js`
**Depends on:** P0
**Step 1:** Tests: adds `.soe/**/run/` + ephemeral patterns, NOT `docs/plans/` or durable `.soe`; idempotent; preserves existing content (managed block delimiters).
**Step 2:** → FAIL. **Step 3:** Implement managed block `# >>> soe managed >>>`…`# <<< soe managed <<<`. **Step 4:** → PASS. **Step 5:** `git commit -m "feat(engine): precise .gitignore manager"`

### Task P2.4: `lib/loop-guard.js` — bounded loops (F9)
**Files:** Create `lib/loop-guard.js`; Test `tests/loop-guard.test.js`
**Depends on:** P2.1
**Step 1:** Tests: `incFix(state)` past `max_fix_cycles` (5) returns `{halt:true, reason:'fix-cap'}`; `incPlanRevision` past `max_plan_revisions` (3) halts; counts persist in `state.json`; caps read from `.soe/config.json`.
**Step 2:** → FAIL. **Step 3:** Implement real counters in state. **Step 4:** → PASS. **Step 5:** `git commit -m "feat(engine): bounded-loop guard"`

### Task P2.5: `.soe/` layout + `/setup`
**Files:** Create `commands/setup.md`, `skills/soe-setup/SKILL.md`
**Depends on:** P2.1, P2.3
**Steps:** 1. `/setup` scaffolds `.soe/config.json` (mode `autonomous-guardrailed`, `max_fix_cycles:5`, `max_plan_revisions:3`, model-routing defaults), `.soe/tracks/`; calls `lib/gitignore-manager.js`; documents `docs/plans/` (human specs/plans) + `.soe/tracks/{id}/` (state.json, progress.md rendered from state.json, decision-log.md, retrospective.md, `run/` ephemeral); idempotent via `setup_state.json`. 2. validity+refs → PASS. 3. `git commit -m "feat(engine): /setup + .soe layout"`

### Task P2.6: Loop agents (leaf — built before orchestrator, F5/F10)
**Files:** Create `agents/{loop-planner,loop-executor,loop-execution-evaluator,loop-fixer}.md`
**Depends on:** P2.4, P1.1
**Steps:** 1. Adapt conductor's loop agents, rebranded. `loop-planner` writes plan+DAG into `docs/plans/*-plan.md` (Depends-on feeds the DAG). `loop-fixer` calls `lib/loop-guard.js` and halts at the cap. 2. **Pin each loop agent to its tier alias directly (design §4.1, avoids duplicating tiering machinery, F15):** `loop-planner`→`opus`, `loop-execution-evaluator`→`opus`, `loop-executor`→`sonnet`, `loop-fixer`→`sonnet` (the `model:` alias test from P1.6 covers these too). 3. validity+refs → PASS. 4. `git commit -m "feat(engine): loop agents (tier-pinned)"`

### Task P2.7: Worktree-isolated workers + context-firewall validator (F4/F5/F12, design §4.1)
**Files:** Create `skills/soe-workers/SKILL.md`, `skills/soe-workers/worker-template.md`, `lib/firewall-return.js`; Test `tests/firewall-return.test.js`
**Depends on:** P2.6, P1.1 (using-git-worktrees), P2.1
**Step 1:** Test `lib/firewall-return.js`: `parse(returnStr)` accepts a valid `{path, summary, confidence}` where `path` resolves on disk and `confidence` is a number 0–1; **rejects** malformed / missing-confidence / non-existent-path / out-of-range; never trusts an unparsed string.
**Step 2:** `node --test tests/firewall-return.test.js` → FAIL.
**Step 3:** Implement `lib/firewall-return.js`. Author the worker skill/template: orchestrator **dispatches each worker as a subagent (Task tool) in its own git worktree and awaits the return** (the return IS the completion signal — no message bus); results applied **serially** by the sole `state.json` writer via `withWriterLock`. **Context firewall (F5 fix):** workers write full output to an **absolute shared scratch dir OUTSIDE the worktrees** — `${SOE_SCRATCH:-$PWD/.soe/scratch}/<track>/<task>/` resolved to an absolute path the orchestrator's main working dir can read (NOT a relative `.soe/…` inside a worker's worktree) — and return only `path + 3-line summary + confidence`, validated by `lib/firewall-return.js` before any downstream use. Graft user's TDD-mandating implementer prompt + "Actual Code Changes" spec gate.
**Step 4:** Re-run → PASS; validity+refs → PASS.
**Step 5:** `git commit -m "feat(engine): worktree workers + validated context firewall"`

### Task P2.8: Board of Directors (+ JSON contract test, F18-board)
**Files:** Create `skills/board-of-directors/SKILL.md`, `skills/board-of-directors/directors/{chief-architect,chief-product-officer,chief-security-officer,chief-operations-officer,chief-experience-officer}.md`, `agents/board-meeting.md`, `lib/board-verdict.js`; Test `tests/board-verdict.test.js`
**Depends on:** P2.6
**Step 1:** Test `lib/board-verdict.js`: `parseCollapsed(json)` validates the collapsed-board JSON contract (5 lenses, each `{verdict, score, concerns}`, overall `approve|reject|conditions`); rejects malformed; `aggregateFull(votes)` implements ≥4 approve→APPROVED, 3→APPROVED_WITH_REVIEW, ≥3 reject→REJECTED, else ESCALATE.
**Step 2:** → FAIL. **Step 3:** Implement `board-verdict.js`; author collapsed (1 Opus call → the JSON contract) + full (5 personas → vote) board skills; personas from conductor `chief-*` files. **Step 4:** → PASS. **Step 5:** `git commit -m "feat(engine): board (collapsed JSON contract + full vote)"`

### Task P2.9: Evaluators + reviewer agents
**Files:** Create `skills/{eval-code-quality,eval-integration,eval-business-logic}/`, `agents/{code-reviewer,security-reviewer,architect,build-error-resolver,tdd-guide,doc-updater,refactor-cleaner,e2e-runner,database-reviewer}.md`
**Depends on:** P2.6
**Steps:** 1. Adapt conductor eval-* skills; import user's reviewer agents (rebranded) as leaf/fallback agents. 2. validity+refs → PASS. 3. `git commit -m "feat(engine): evaluators + reviewer agents"`

### Task P2.10: Evaluate-Loop orchestrator (built AFTER its leaves, F5/F10)
**Files:** Create `skills/soe-orchestrator/SKILL.md`, `agents/soe-orchestrator.md`
**Depends on:** P2.6, P2.7, P2.8, P2.9, P2.1, P2.2, P2.4
**Steps:** 1. Adapt conductor-orchestrator, SIMPLIFIED: sole serial writer of `state.json` via `lib/state.js` `withWriterLock`; state machine `PLAN→EVALUATE_PLAN→EXECUTE→EVALUATE_EXEC→(FIX↺|COMPLETE)`; FIX/plan-revision via `lib/loop-guard.js`; resume via `lib/resume.js` (+ idempotency skip); dispatch workers per P2.7. References now-existing agents (P2.6/8/9), so refs test is real. 2. validity+refs → PASS. 3. `git commit -m "feat(engine): Evaluate-Loop orchestrator"`

### Task P2.11: `/go` entry
**Files:** Create `commands/go.md`
**Depends on:** P2.5, P2.10
**Steps:** 1. Adapt `/go`: goal → match/create track → dispatch orchestrator; bare `/go` resumes. Rebrand. 2. validity+refs → PASS. 3. `git commit -m "feat(engine): /go entry"`

### Task P2.12: Engine mechanics integration tests (F6 meaningful isolation)
**Files:** Create `tests/engine-mechanics.test.js`
**Depends on:** P2.1–P2.11
**Step 1:** Tests: atomic+lock state (concurrent `withWriterLock` attempts serialize / second throws); resume skips completed + skips already-applied; bounded loops halt at caps via `lib/loop-guard.js`; **worktree isolation is meaningful — a driver creating two worker worktrees asserts each has a distinct working dir AND that a write in one is not visible in the other's tree** (not mere string inequality).
**Step 2:** → some FAIL until wiring correct. **Step 3:** Fix wiring. **Step 4:** → PASS. **Step 5:** `git commit -m "test(engine): atomic/lock, resume+idempotency, caps, real isolation"`

---

## Phase P3: Gates, modes & learning

### Task P3.1: Interaction modes
**Files:** Create `skills/soe-modes/SKILL.md`; Modify `commands/setup.md`, `skills/soe-orchestrator/SKILL.md`
**Depends on:** P2.5, P2.10
**Steps:** 1. Author modes (autonomous-guardrailed default / interactive / fully-agentic); orchestrator reads `.soe/config.json.mode`. 2. validity+refs → PASS. 3. `git commit -m "feat: interaction modes"`

### Task P3.2: Gate classification
**Files:** Create `skills/gate-classification/SKILL.md`; Modify discipline skills to tag gate type
**Depends on:** P3.1
**Steps:** 1. Verification gates run autonomously; judgment gates front-load/escalate; tag each skill. 2. validity+refs → PASS. 3. `git commit -m "feat: gate classification"`

### Task P3.3: `lib/escalation.js` — valve + irreversible classifier
**Files:** Create `lib/escalation.js`; Test `tests/escalation.test.js`
**Depends on:** P2.1
**Step 1:** Tests: `shouldEscalate(ctx)` on high-impact/irreversible/bound-exhaustion; `isIrreversible(action)` true for data-loss migration/prod deploy/force-push/secret rotation; `resolveViaInstinct(ctx,instincts)` returns a resolution ONLY when `!isIrreversible && confidence>=threshold`, and NEVER for irreversible.
**Step 2:** → FAIL. **Step 3:** Implement. **Step 4:** → PASS. **Step 5:** `git commit -m "feat: escalation valve + irreversible classifier"`

### Task P3.4: Escalation-learning loop + irreversible driver test (F11)
**Files:** Create `skills/escalation-learning/SKILL.md`; Modify `hooks/hooks.json`, `skills/soe-orchestrator/SKILL.md`; Test `tests/escalation-flow.test.js`
**Depends on:** P1.9, P3.3
**Step 1:** Driver test: a simulated decision path that, given an irreversible action + a high-confidence matching instinct, still routes to confirm (calls `lib/escalation.js` and gets `escalate=true`) — proving the invariant holds where it matters, not just in the unit.
**Step 2:** → FAIL. **Step 3:** Author `escalation-learning` (capture `{situation,decision,reasoning,principle}`→instinct; pre-check before escalating; log "would have escalated"; corrections update instinct); wire orchestrator to call `lib/escalation.js` on every escalation candidate. **Step 4:** → PASS. **Step 5:** `git commit -m "feat: escalation-learning + irreversible driver test"`

### Task P3.5: `lib/risk-matrix.js` — deterministic risk floor
**Files:** Create `lib/risk-matrix.js`; Test `tests/risk-matrix.test.js`
**Depends on:** P2.1
**Step 1:** Tests: diff touching auth/authz/payment/crypto/secrets/SQL-migration/deletion/PII/prod-config/force-push/security-paths OR > LOC threshold → floor `full`; docs-only → `trivial`; `applyClassifierHint(floor,hint)` may RAISE but a `trivial` hint can NOT lower a `full` floor.
**Step 2:** → FAIL. **Step 3:** Implement `classify(diff,{locThreshold=300})` (rule-based marker scan) + `applyClassifierHint` + optional `blastRadius(files, graphify)` hook. **Step 4:** → PASS. **Step 5:** `git commit -m "feat: deterministic risk matrix"`

### Task P3.6: `lib/scrutiny.js` — routed downscoping + corpus (F7)
**Files:** Create `lib/scrutiny.js`; Test `tests/scrutiny.test.js`, `tests/dangerous-corpus.test.js`, `tests/fixtures/dangerous/*.diff`; Modify `skills/soe-orchestrator/SKILL.md`, `skills/board-of-directors/SKILL.md`
**Depends on:** P3.5, P2.8
**Step 1:** Tests: `selectScrutiny(diff, classifierHint, logger)` returns `{tier, board:'collapsed'|'full'}` — always routing through `lib/risk-matrix.js`, forcing `full`+full-board on any marker, logging every downscope; the dangerous corpus (auth bypass, SQL injection, payment logic, destructive migration) each → `full`+full-board; a downscope with no logger entry fails the test.
**Step 2:** → FAIL. **Step 3:** Implement `scrutiny.js`; make the orchestrator's ceremony/board choice CALL `selectScrutiny` (the only sanctioned path) and pass a logger writing to decision-log. **Step 4:** → PASS. **Step 5:** `git commit -m "feat: routed fail-safe scrutiny + dangerous corpus"`

### Task P3.7: Adversarial-review gate + finishing-branch absorption (F16)
**Files:** Create `skills/adversarial-review/SKILL.md`, `agents/devils-advocate.md`, `commands/critique.md`; Modify `skills/soe-orchestrator/SKILL.md` (EVALUATE_PLAN + COMPLETE gate), `skills/finishing-a-development-branch/SKILL.md`
**Depends on:** P2.10
**Steps:**
1. Author `adversarial-review` (design mode: gaps/inconsistencies/pattern-misuse vs lens integrity/simplicity/maintainability/readability/scalability/performance/human-debuggability; plan mode: + design↔plan cross-reference). `devils-advocate` = fresh-context executor. `/soe:critique [design|plan] <file>` = trigger. Wire into `EVALUATE_PLAN` (interactive → discuss all/some/continue; autonomous → bounded revision + log).
2. **Absorption (F16):** wire `finishing-a-development-branch`'s "refuse to finish if required gates unchecked" into the orchestrator's **COMPLETE** state (reads `state.json` gate flags), and preserve its `extract-patterns` learning hook at completion.
3. validity+refs → PASS.
4. `git commit -m "feat: adversarial-review gate + finishing-branch absorption"`

---

## Phase P4: Discovery & security

### Task P4.1: `lib/capability-scan.js`
**Files:** Create `lib/capability-scan.js`; Test `tests/capability-scan.test.js`
**Depends on:** P0
**Step 1:** Tests: enumerates providers (name+description) from a fixture registry → `role→[providers]` map; unknown role empty; a `role:`-tagged fixture matched precisely; untagged matched by description keywords.
**Step 2:** → FAIL. **Step 3:** Implement scan + tag/keyword classification. **Step 4:** → PASS. **Step 5:** `git commit -m "feat: capability scan"`

### Task P4.2: Role-routing + extras-absent fallback test (F13/F17)
**Files:** Create `skills/capability-discovery/SKILL.md`; Modify `agents/loop-execution-evaluator.md`; Test `tests/discovery-fallback.test.js`
**Depends on:** P4.1, P2.9
**Step 1:** Test: with an empty/extras-absent registry, role routing resolves every required review role to a **soe-core generic** agent (proving core never hard-depends on packs); with a specialist present, it prefers the specialist.
**Step 2:** → FAIL. **Step 3:** Author `capability-discovery` (role→provider, generic fallback, auto-use enhancement / confirm control, optional tag convention); wire the evaluator to route via `lib/capability-scan.js`. **Step 4:** → PASS. **Step 5:** `git commit -m "feat: role-routing + extras-absent fallback"`

### Task P4.3: `using-graphify` + blast-radius test (F12)
**Files:** Create `skills/using-graphify/SKILL.md`; Modify `lib/risk-matrix.js`; Test `tests/graphify-blast.test.js`
**Depends on:** P4.2, P3.5
**Step 1:** Test: `blastRadius(files, mockGraphify)` where the mock returns a large/security-touching impact → forces `risk-matrix` tier to `full`; when graphify is absent → falls back to path/marker rules (no throw).
**Step 2:** → FAIL. **Step 3:** Author `using-graphify` (detect `graphify-out/graph.json`/MCP; route retrieval; feed `get_pr_impact`/`shortest_path` into `blastRadius`; consume-only/staleness/confidence-label rules; silent fallback); implement `blastRadius`. **Step 4:** → PASS. **Step 5:** `git commit -m "feat: graphify provider + blast-radius (tested)"`

### Task P4.3b: `codex-peer` provider (optional, discovered — design §4.1/§6)
**Files:** Create `skills/using-codex/SKILL.md`; Modify `skills/capability-discovery/SKILL.md`; Test `tests/codex-detect.test.js`
**Depends on:** P4.2, P1.6
**Step 1:** Test: detection returns `available:true` only when the `codex` CLI is on PATH AND the `openai/codex-plugin-cc` is installed (drive with a fixture PATH/registry); otherwise `available:false` and the provider is silently skipped (no throw).
**Step 2:** → FAIL. **Step 3:** Author `using-codex`: registers a `codex-peer` provider used per the `model-orchestration` methodology for high-stakes **parallel synthesis** (Opus + Codex on the same problem, merged without cross-contamination); invoked via `/codex:rescue --background` (CLI-backed); enhancement-only posture (never irreversible actions without confirm). Register in `capability-discovery`. **Step 4:** → PASS. **Step 5:** `git commit -m "feat: optional codex-peer provider (discovered)"`

### Task P4.4: `/soe:self-audit` + AgentShield-on-self
**Files:** Create `commands/self-audit.md`, `skills/security-scan/SKILL.md`; Modify `package.json` (pin `ecc-agentshield`), `docs/SECURITY.md`
**Depends on:** P0
**Steps:** 1. Adopt ECC security-scan (verify free/MIT); pin `ecc-agentshield` devDep. `/soe:self-audit` = validity + refs + AgentShield against soe's OWN `.claude-plugin`/hooks/agents/scripts + config sanity. 2. Fill `SECURITY.md` (what runs, where, perms; pinned deps). 3. validity+refs → PASS. 4. `git commit -m "feat: self-audit + AgentShield-on-self"`

### Task P4.5: Bundled-exec audit + release gate
**Files:** Create `tests/bundled-exec-audit.sh`; Modify `.github/workflows/ci.yml`
**Depends on:** P4.4
**Step 1:** `bundled-exec-audit.sh` lists every shipped `.sh`/`.js`/`.mjs`/`.py`, asserts no orphan executables, runs AgentShield; **exit non-zero on critical/high, warn on low**. **Step 2:** passes on current tree (fix flagged scripts). **Step 3:** CI runs self-audit as a **release gate (block critical/high, advisory low)**. **Step 4:** `git commit -m "ci: bundled-exec audit + release gate"`

---

## Phase P5: ECC merge, companion, multi-harness, migration

### Task P5.1: ECC canonical inventory (F1)
**Files:** Create `scripts/ecc-inventory.mjs`, `docs/plans/ecc-merge-ledger-full.md`; Test `tests/ecc-inventory.test.js`
**Depends on:** P0
**Step 1:** Test: inventory scans ONLY the canonical `/development/_sources/ECC/skills/` dir (277 unique skill dirs — NOT the 887 doc/harness mirrors), emitting one row per dir.
**Step 2:** → FAIL. **Step 3:** `ecc-inventory.mjs` lists `skills/*/SKILL.md` in the canonical dir → `ecc-merge-ledger-full.md` rows `{name, concern, disposition-TODO}`. **Step 4:** → PASS. **Step 5:** `git commit -m "feat: ECC canonical inventory"`

### Task P5.2: Disposition + completeness gate
**Files:** Modify `docs/plans/ecc-merge-ledger-full.md`; Test `tests/merge-completeness.test.js`
**Depends on:** P5.1
**Step 1:** Test: every ledger row has a disposition in `{KEEP,MERGE,DROP,ADOPT}` (no TODO/blank). **Step 2:** → FAIL. **Step 3:** Disposition each (bias: process/meta improving the pipeline → ADOPT into core; language/framework → DROP-from-core, note "install ECC"); record rationale. **Step 4:** → PASS. **Step 5:** `git commit -m "feat: complete ECC disposition + completeness gate"`

### Task P5.3: Merge adopted ECC process/meta pieces
**Files:** Modify/Create `skills/skill-stocktake/` (+ restored `scripts/{scan.sh,quick-diff.sh}`), `skills/security-scan/` (from P4.4), plus any ADOPT-marked process skills (do NOT adopt ECC `model-routing` — superseded by the P1.6 `model-orchestration` skill)
**Depends on:** P5.2
**Steps:** 1. For each ADOPT: copy from ECC (verify provenance §11), rebrand, thin+reference only where warranted; restore skill-stocktake scripts. 2. validity+refs+completeness → PASS. 3. `git commit -m "feat: merge adopted ECC process/meta"`

### Task P5.4: `soe-extras` companion (+ absence already tested in P4.2)
**Files:** Create `../soe-extras/.claude-plugin/{plugin.json,marketplace.json}`, `../soe-extras/skills/{ruby-patterns,ruby-testing,rails-patterns,rails-security,rails-tdd,rails-verification,dart-patterns,dart-testing,flutter-patterns,flutter-verification}/`, `../soe-extras/LICENSES/`, mirrored `tests/`
**Depends on:** P0
**Steps:** 1. New `soe-extras` repo; copy user's authored language skills; rebrand; **tag each with `role:`/`domain:`** for precise discovery (P4.2). 2. Manifest `soe-extras`, AGPL, credit Faisal. 3. Mirror validity+refs check. 4. `git init && git add . && git commit -m "feat: soe-extras companion"`

### Task P5.5: Multi-harness Layer-1 (scoped, F15)
**Files:** Create `.codex/`, `.opencode/` skill/rule packaging; Modify `hooks/session-start.sh` (harness-aware); Test `tests/harness-layer1.sh`
**Depends on:** P1, P3.7
**Acceptance criteria (concrete):** Layer-1 = skills + rules + adversarial-review guidance + shared `.soe/`/`docs/plans/` state exposed for Codex + OpenCode. Engine (Layer-2) stays Claude-Code-only (documented deferral, design §8/§13).
**Step 1:** `harness-layer1.sh` asserts each harness dir exposes the discipline skills + rules and that `.soe/`/`docs/plans/` paths are referenced identically (shared-state consumability check). **Step 2:** → FAIL. **Step 3:** Package Layer-1; make SessionStart harness-aware; explicitly mark engine deferred. **Step 4:** → PASS. **Step 5:** `git commit -m "feat: multi-harness Layer-1 (Codex/OpenCode)"`

### Task P5.6: Migration + final docs + publish gate (F14-legal)
**Files:** Create `docs/MIGRATION.md`, `docs/USAGE.md`; Modify `README.md`, `docs/ARCHITECTURE.md`, `NOTICE.md`
**Depends on:** P1–P5
**Steps:**
1. `MIGRATION.md`: old sp-ecc → new soe mapping (or "dropped, superseded by X"); instinct carry-over via `/instinct-export`→`/instinct-import`; coexistence (no alias shims — clean break).
2. `ARCHITECTURE.md`, `USAGE.md`, `README.md` (install, quickstart, credit).
3. Dogfood: `/soe:critique design docs/plans/2026-07-03-soe-design.md` + `/soe:self-audit`; address findings.
4. **Publish gate:** confirm the `NOTICE.md` written-permission checkbox (P0.3) is checked; **do NOT tag/publish a release while unresolved.**
5. `npm run test:all` → all green.
6. `git commit -m "docs: migration, architecture, usage, readme + publish gate"`

---
**READY?** Proceed / Modify: [changes] / Different approach: [alternative]

**Plan v2 complete and saved to `docs/plans/2026-07-03-soe-implementation.md`. Ready to execute?**

**If approved:**
- **REQUIRED SUB-SKILL:** Use sp-ecc:subagent-driven-development (or soe:subagent-driven-development once P1 lands)
- Stay in this session; fresh subagent per task + multi-stage review (spec, quality, security, verification gate).
