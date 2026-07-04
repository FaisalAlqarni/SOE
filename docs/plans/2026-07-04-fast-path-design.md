# Fast-Path Design v2 — measure, then cut dispatch overhead

**Status:** DESIGN v2 (post-critique). Rewritten after `/soe:critique` found Fix 2 (skip-worktree) unsound and Fix 1 built on an unverified lever. Scope now: **measure first, then fix dispatch overhead only.** Ceremony-reduction (worktree-skip) is **rejected/deferred** — rationale below.

## Problem (measured, but n=1)
A trivial one-function `/go-auto` track: **27.6 min total, ~3.4 min real leaf work, ~24 min overhead.** Transcripts show the orchestrator improvised bash `until [ -f resultfile ]; sleep` polling to wait for async children (CC 2.1.193 dispatches subagents in the background by default; soe's skills assume synchronous returns) plus context reprocessing on each async re-invocation, plus a single-file git worktree create/merge/cleanup.

**Caveat that now drives the design:** this is **one trivial run with no per-cause attribution.** The 24 min is lumped (poll-wait + re-invocation reprocessing + worktree + cold-start). We do **not** yet know which dominates — so we measure before we fix.

## What the critique changed (folded in)
- **Fix 2 (risk-gated skip-worktree) is REJECTED as specified.** (a) Its safety net doesn't exist — risk classification is wired at EVALUATE_PLAN, not EVALUATE_EXEC, and even if built it's *post-hoc*: it cannot restore isolation already skipped. (b) `classifyFromPlan` is structurally blind to `classify()`'s **content** markers (auth/secrets/SQL/crypto in an innocuous-named file), so it under-tiers exactly the risks the matrix exists to catch — while making the isolation call. (c) "commit-per-task = rollback" is false for a **mid-task crash** (uncommitted partial edit in the real tree; resume re-runs `in_progress` on top of it). (d) A single-file worktree is **seconds**, almost certainly a rounding error vs the 24 min. Net: it trades a proven isolation/rollback/crash-safety property for unmeasured, likely-tiny savings. **Deferred** until measurement proves the worktree is a real cost — and if so, revisited with isolation *preserved* (a lighter checkpoint), never in-place editing.
- **Fix 1 must be probe-gated.** `background:false` is unverified (docs promise `true`=background, not `false`=foreground; no agent uses it today), and the naive fallback (ride the async completion signal) *is* the current behavior that produced the overhead. So Fix 1 designs in a **second, different lever** (reduce hop count) rather than hoping the probe passes.

## Phase 0 — MEASURE (gates everything; no fix ships without it)
Attribute the overhead per cause, from the existing transcripts + one controlled probe run:
- **poll-wait** — wall-clock the orchestrator spent in `until [ -f ]; sleep` loops.
- **re-invocation reprocessing** — time/tokens the orchestrator burned resuming after each async child (context reprocessed per completion).
- **worktree** — seconds for `git worktree add` + merge + cleanup.
- **cold-start / queue** — latency between dispatch and a child's first token.

**Deliverable:** a per-cause seconds breakdown. We fix only what's proven costly. If (as suspected) poll-wait + reprocessing dominate and worktree is seconds, this confirms Fix-1-only.

## Probe A — is `background:false` a real foreground lever?
Pin ONE sequential leaf (`loop-planner`) `background: false`, reload, dispatch, confirm: (a) the Agent call returns **synchronously** (no "Async agent launched"), (b) no `until`-poll needed, (c) measure the wall-clock vs the async path. If it's a no-op → Probe A fails → Fix 1 uses the hop-reduction lever instead.

## Probe B — can a fan-out parent await-all without polling?
A `board-meeting`-like parent dispatches 2 async children and collects both. Confirm it gets a clean native completion signal (not a bash poll), and **measure the per-completion reprocessing cost** on the parent (finding #3: if collecting N directors = N× parent reprocessing, the board needs a different collection strategy, e.g. a single batched wait).

## Fix 1 — reduce dispatch overhead (final scope set by Phase 0 + probes)
Two levers; choose by evidence, not hope:

1. **Right-size by topology (if Probe A passes).** Sequential single-await phases (`loop-planner` → EXECUTE worker → `loop-fixer` → `loop-execution-evaluator`) → `background: false` (foreground; clean await, no poll). Parallel fan-out (the 5-director Board, genuine multi-task parallel workers) → **stays async** + native await-all (Probe B) — never serialized.
2. **Reduce hop count for low-stakes tracks (if Probe A fails, or reprocessing dominates).** For a `trivial`-tier track the orchestrator does the cheap phases **inline** instead of paying a separate subagent dispatch each — e.g. collapse the EVALUATE_PLAN devil's-advocate into an inline sanity check (addresses the incoherent cost model: today we'd cut the seconds-cheap worktree but keep the *most expensive* opus fresh-context hop). Fresh-context specialist subagents are retained wherever the **risk matrix** (raise-only, fail-safe) says stakes warrant them.

Either lever: **delete the improvised `until`/`sleep` polling wording** the runtime mismatch induced, and update `soe-orchestrator`/`soe-workers` skills to state the runtime is async-by-default and how each topology waits.

**Wiring to nail down when scope is set (critique #8):** the EXECUTE node is ambiguous today — `loop-executor` vs `soe-workers` worker vs `fast-worker`. The plan must specify who executes and how tier routes to that choice, or it drifts.

## Integrity invariants — unchanged, non-negotiable
`EVALUATE_EXEC` (tests + evaluator) always runs; bounded loops (fix ≤5, plan-rev ≤3); orchestrator is sole `state.json` writer; context firewall on every return; risk-matrix fail-safe (tiers only RAISE). **No isolation is removed** — the worktree stays. This design changes *how the orchestrator waits*, not *what it verifies*.

## Deferred / rejected (recorded, not lost)
- **Skip-worktree ceremony reduction** — rejected (isolation/rollback/crash-safety + unmeasured savings). Revisit only if Phase 0 proves the worktree costs real minutes, with isolation preserved.
- **Fold PLAN+EXECUTE** — deferred (removes the plan gate, not just a hop).

## Acceptance criteria
1. Phase 0 produces a per-cause seconds breakdown (the diagnosis is no longer n=1-lumped).
2. The chosen Fix-1 lever shows a **measured before/after** wall-clock drop on the *same* track.
3. A **full-board** track still runs its 5 directors **concurrently** (overlapping transcript timestamps) — the board is not serialized.
4. All existing integrity tests stay green; no worktree/isolation removed.

---
**READY?** Re-critique / Modify / Proceed to plan.
