# Fast-Path — Phase 0 Measurements

Source: baseline `titlecase` run, orchestrator transcript `agent-aae657b8fcbd3250e.jsonl` (2026-07-04, soe 0.3.0, CC 2.1.193).

## Task 0.1 — per-cause overhead breakdown (of 27.2 min total)

| Cause | Wall-clock | % | Note |
|---|---|---|---|
| **poll-wait** (`until [ -f ]; sleep` blocking on leaf result files) | **21.0 min** | **77%** | the target |
| gaps (orchestrator reasoning + async re-invocation reprocessing) | 6.1 min | 22% | secondary |
| **worktree** (`git worktree add/merge/remove`) | **0.0 min** | ~0% | **confirms Fix 2 correctly dropped** |
| state I/O (`node -e import lib/…`) | 0.0 min | ~0% | negligible |
| other bash / read / agent-ack | 0.1 min | ~0% | negligible |

**Finding 1:** the worktree is NOT the cost (0 min) — Fix 2 (skip-worktree) is confirmed the wrong target and stays deferred/rejected.

## Task 0.1b — is the 21 min poll reclaimable, or genuine leaf latency?

Each blocking `until` wait vs the leaf's actual work time:

| poll wait | leaf it waited on (work time) | non-work latency |
|---|---|---|
| 7.0 min | a leaf working ~0.5–1.2 min | ~6 min |
| 7.0 min | " | ~6 min |
| 5.0 min | " | ~4 min |
| 2.0 min | " | ~1 min |

Leaf **work** (first→last assistant turn) was 0.5–4.2 min each; the orchestrator **blocked 2–7 min** per leaf. So most of the 21 min is the gap between *dispatch* and *result-file-appears* — i.e. **async nested-subagent scheduling + cold-start + finalize latency**, not the leaves computing and not (mostly) polling granularity.

## Task 0.2 — cold-start contrast (the smoking gun)

- **Direct** trivial async probes (main session → leaf, e.g. `RELOADED-SONNET-PROBE-OK`): dispatch→completion **~3–10 seconds**.
- **Nested** leaves (orchestrator subagent → leaf) in the loop: **5–7 minutes** for ~1 min of work.

**Finding 2:** nested async subagents are scheduled **~30–100× slower** than direct ones. The dominant, reclaimable cost is **nested async scheduling latency**, which the orchestrator spends blocked in `until` polls.

## Implication for Fix 1 (sharpens Probe A)

The reclaimable amount hinges on ONE question the critique (#6) raised: does dispatching a nested leaf **foreground** (`background: false`) avoid the background scheduling queue, or does it just *block* for the same latency?

- If foreground dispatch runs the leaf promptly (like direct dispatch's 3–10 s cold-start) → most of the ~15 min of nested-scheduling latency is reclaimed. **Big win.**
- If foreground merely blocks for the same end-to-end latency → `background: false` buys little; the real lever becomes **reduce nested-hop count** (Branch B) or flatten dispatch toward the main session.

**Probe A is therefore not just "is it synchronous" — it must measure end-to-end wall-clock foreground vs background for the SAME nested leaf.** That number decides Branch A vs Branch B.

## Decisions locked by Phase 0
1. Fix 2 (skip-worktree) stays rejected — worktree is 0 min.
2. Fix 1 targets **nested async scheduling latency** (the 21 min), not polling cosmetics.
3. Probe A must produce a **foreground-vs-background wall-clock delta** on a nested leaf, not a boolean.

## Phase 1 — the real cause (overturns the "async is slow" hypothesis)

- **Nested-async trivial leaf, dispatched WITHOUT bash-polling (native completion await): 2.8s end-to-end, 0.0s cold-start.** (baseline probe → child `agent-a0b3ff6ddbc09c7c1`.)
- **Loop leaves did work continuously** — the executor ran 1.1 min with **zero idle gaps >20s** (not starved internally).
- Yet the orchestrator **blocked 2–7 min per leaf** in `until [ -f ]; sleep` polls.

**Root cause (corrected):** it is NOT nested-async scheduling latency and NOT `background:false`. It is the orchestrator's **improvised bash-poll being scheduler-hostile** — a blocking `until … sleep` loop inside a background agent does not yield cleanly to the runtime, so the poller and the awaited child both crawl. The native async completion path (dispatch → end turn → re-invoked with the child's return) is ~100× faster (2.8s vs minutes) and, unlike foreground `background:false`, **keeps parallel fan-out parallel**.

**Fix 1 (final):** remove the bash-polling from `soe-orchestrator`/`soe-workers`; dispatch leaves async and rely on the **native completion signal** — never a bash `until`/`sleep` wait. `background:false` is dropped (unneeded, and would serialize the board). Fix 2 stays dropped (worktree = 0 min).

## Phase 3 — VALIDATION (post-fix, reloaded)

Fresh `kebab` trivial track, same shape as the baseline:

| Metric | Baseline | Post-fix |
|---|---|---|
| total wall-clock | 27.6 min | **7.0 min** (3.9×) |
| poll-wait (`until`/`sleep`) | 21.0 min | **0.0 min** |
| `until`/`sleep` polls | many | **0** |
| fan-out (Agent calls) | 4 | 4 |
| tiers | — | planner/board/eval `claude-opus-4-8`, executor `claude-sonnet-5` |

The prose fix was obeyed: the orchestrator dispatched async and collected the native completion signal with **zero** bash polling. The remaining ~7 min is leaf work (~3.4 min) + orchestrator reasoning/re-invocation reprocessing (~3.6 min) — inherent to multi-phase orchestration, not pathological. **Board-parallel (5 directors concurrent) was NOT exercised this run** (collapsed board / single devils-advocate gate used); the board-meeting native-collect fix is in place + guard-tested but unverified live — flagged for a future high-stakes run.

**Outcome:** Fix 1 shipped and validated. Fix 2 (worktree) correctly dropped. `background:false` dropped.
