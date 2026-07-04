# Fast-Path Implementation Plan (Phase 0 + Fix 1)

> **For Claude:** REQUIRED SUB-SKILL: execute task-by-task. TDD where lib code changes. DO NOT git commit (user handles git). Design: `docs/plans/2026-07-04-fast-path-design.md`.

**Goal:** Cut the ~24 min/27 min dispatch overhead in the Evaluate-Loop for low-stakes tracks — by measuring the per-cause cost first, then fixing only what's proven costly (dispatch/wait), without removing any isolation or verification.

**Architecture:** Measure → probe two candidate levers → commit to one → apply as skill/frontmatter changes → validate with a timed re-run. No engine rewrite; the change is *how the orchestrator waits*, not *what it verifies*.

**Complexity:** Medium. **Tech:** Claude Code subagent `background` frontmatter; existing `lib/risk-matrix.js`; transcript analysis (node).

**Risks:**
- HIGH: `background:false` may be a no-op → Phase 1 Probe A gates the whole lever choice; Branch B (hop-reduction) is the fallback.
- MEDIUM: reload-gated probes need the user to `/reload-plugins` mid-plan (marked as CHECKPOINTs).
- MEDIUM: fan-out collection may itself reprocess context per completion → Probe B measures it before we rely on it.

**Testing:** transcript-measurement scripts (deterministic); empirical probes (observed sync/async + wall-clock); final timed re-run vs the 27.6-min baseline + board-parallel check; `npm test` for no integrity regression.

---

## Phase 0 — MEASURE (gates everything)

### Task 0.1: Per-cause overhead breakdown from the baseline run
**Files:** Create `docs/plans/fast-path-measurements.md` (findings only; not code).
**Steps:**
1. From the titlecase orchestrator transcript (`…/subagents/agent-aae657b8fcbd3250e.jsonl`), write a throwaway node analysis (scratch dir, not the repo) that buckets wall-clock by cause:
   - **poll-wait** — sum of Bash calls whose command matches `until \[|sleep`.
   - **worktree** — Bash matching `git worktree (add|remove)|merge`.
   - **state I/O** — Bash matching `node -e .*import.*lib/`.
   - **reprocessing/idle** — `total_span − Σ(leaf durations) − Σ(other bash)`.
2. Compute leaf durations from each leaf transcript (first→last timestamp), as already done.
3. Record the seconds/percent per bucket in `fast-path-measurements.md`.
**Done when:** the 24 min is attributed to named causes (no more lumped n=1). **Decision:** if worktree ≪ poll+reprocessing (expected), Fix-1-only is confirmed; Fix 2 stays deferred.

### Task 0.2: One controlled cold-start measurement
**Steps:** Dispatch a single trivial leaf (`fast-worker`, "reply OK"), record dispatch→first-token and dispatch→completion latency from its transcript timestamps. This isolates unavoidable platform cold-start/queue from soe-controllable overhead.
**Done when:** cold-start seconds are known (a floor the fixes can't beat).

---

## Phase 1 — PROBES (decide the Fix-1 lever)

### Task 1.1 — Probe A: is `background: false` a real foreground lever?
**Files:** temporarily edit `agents/loop-planner.md` (+ sync to cache) to add `background: false`.
**Steps:**
1. Add `background: false` to `loop-planner.md` frontmatter; sync to the active cache.
2. **CHECKPOINT (user):** `/reload-plugins`.
3. Dispatch `soe:loop-planner` with a trivial probe prompt.
4. Observe: does the Agent call return **synchronously** (no "Async agent launched…"), and does the transcript need no `until`-poll?
**Done when:** Probe A verdict recorded (foreground honored: yes/no) with the observed behavior. **Gates Phase 2 branch.**

### Task 1.2 — Probe B: can a fan-out parent await-all without polling?
**Steps:**
1. Dispatch `soe:board-meeting` (it now carries the `Agent` tool) with a probe instruction: spawn 2 trivial async children, collect both, report.
2. Inspect the board-meeting transcript: did it collect both via a native completion signal, or fall back to a bash poll? Measure per-completion reprocessing (transcript entries/time added per child return).
**Done when:** we know whether fan-out collection is clean or needs a batched-wait strategy — and its reprocessing cost (finding #3).

---

## Phase 2 — FIX 1 (branch on Phase 1 verdict)

> Commit to ONE branch based on Probes A/B, then implement. Revert the temporary `loop-planner` probe edit first if Branch B is chosen.

### Branch A — right-size dispatch by topology (if Probe A passed)
**Task 2A.1:** Add `background: false` to the **sequential** leaf agents only: `loop-planner`, `loop-fixer`, `loop-execution-evaluator`, and the single EXECUTE worker path (`loop-executor`/`fast-worker` — resolve the node identity per Task 2.3). **Leave `board-meeting` directors and parallel workers async.**
**Task 2A.2:** Update `skills/soe-orchestrator/SKILL.md` + `skills/soe-workers/SKILL.md`: state the runtime is async-by-default; sequential phases use `background:false` (foreground await); fan-out stays parallel and waits on the native completion signal (or Probe B's batched-wait). **Delete** any wording that invites a manual `until`/`sleep` poll.

### Branch B — reduce hop count for trivial tracks (if Probe A failed / reprocessing dominates)
**Task 2B.1:** In `skills/soe-orchestrator/SKILL.md`, gate on `lib/risk-matrix.js` tier: for `trivial` tier, the orchestrator performs the cheap gate(s) **inline** (e.g. an inline plan sanity-check instead of dispatching the `devils-advocate` opus subagent) — attacking the most expensive hop. Fresh-context specialist subagents are retained for `standard`/`full` per the risk matrix (raise-only).
**Task 2B.2:** If a tested decision helper is warranted, add `lib/ceremony.js` `ceremonyFor(tier)` → `{ inlineGate: boolean, … }` (TDD, pure) rather than prose-only logic. Keep it minimal.

### Task 2.3 (both branches): resolve the EXECUTE-node ambiguity (critique #8)
Specify in the skills who executes and how tier routes to it: `loop-executor` vs a `soe-workers` worker vs `fast-worker`. One node, one rule. No behavior change beyond disambiguation.

---

## Phase 3 — VALIDATE

### Task 3.1: Timed re-run on a fresh trivial track
Create a fresh scratch repo + a trivial track (like `titlecase`), run the loop, record total wall-clock. **Done when:** measured drop vs the 27.6-min baseline, with the poll-wait bucket at ~0.

### Task 3.2: Board-parallel regression check
Run (or simulate) a track that triggers the **full board**; confirm the 5 directors run **concurrently** (overlapping timestamps), not serialized. **Done when:** concurrency proven — the board was not broken by Fix 1.

### Task 3.3: Integrity gate
`npm run test:all` green (no regression to bounded loops, firewall, risk-matrix, state). Confirm **no worktree/isolation removed**. Sync changed files to the active cache. **CHECKPOINT (user):** `/reload-plugins` before any final live confirmation.

---

## Acceptance criteria (from design v2)
1. Phase 0 per-cause breakdown exists (diagnosis no longer n=1-lumped).
2. Chosen lever shows a **measured** before/after wall-clock drop on the same track type.
3. Full-board track still runs 5 directors **concurrently**.
4. `npm test` green; **no isolation removed**; nothing committed.

---
**READY?** Proceed / Modify / Re-critique the plan.
