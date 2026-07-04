---
name: soe-workers
description: Use when the orchestrator needs to delegate an implementation task to an isolated worker — dispatches each worker as a Task-tool subagent in its own git worktree, awaits its return as the completion signal, and applies results serially as the sole state.json writer behind a validated context firewall
---

# SOE Workers

## Overview

A **worker** is a single implementation task delegated by the orchestrator. The
orchestrator dispatches each worker as a **subagent (Task tool) in its own git
worktree**, then **awaits its return**. The return IS the completion signal.

**Core principle:** one worker per task, isolated in a worktree, returning a
tiny validated envelope — never streaming its full context back to the
orchestrator.

**Announce at start:** "I'm using the soe-workers skill to dispatch an isolated
worker."

## The worker model

### 1. Isolation — one worktree per worker

Before dispatching, the orchestrator ensures the worker gets an isolated
workspace via `soe:using-git-worktrees`. Each worker operates in its **own git
worktree** so concurrent workers never trample one another's working tree,
index, or branch. The worker does all of its editing, building, and testing
inside that worktree.

### 2. The return IS the completion signal — NO message bus, NO bash poll

There is **no message bus, no polling, no shared mailbox**. The orchestrator
dispatches the worker with the Agent tool and **awaits its return**. When the
subagent returns, that return — and only that return — signals completion.

**CRITICAL — how "await" works on this runtime (CC ≥ 2.1.198 dispatches subagents
in the BACKGROUND by default).** When you dispatch a worker, the tool replies
`Async agent launched…` and the worker runs in the background. This IS the
correct path — the runtime **re-invokes you with the worker's return when it
completes** (the native completion signal). So after dispatching:

- **DO** end your turn and let the native completion signal bring you back with
  the return. Dispatch several workers this way and you receive each completion
  as it lands (parallel fan-out stays parallel).
- **NEVER** write a Bash `until [ -f <resultfile> ]; do sleep …; done` loop (or
  any `sleep`-based wait) to poll for a worker's scratch/result file. A blocking
  bash poll inside a background agent is **scheduler-hostile**: it does not yield
  cleanly, so the poller AND the worker both crawl — measured at **2–7 min per
  worker vs 2.8 s** for the native path. The bash poll is the single biggest
  source of wasted wall-clock in the loop. There is no result file to wait on:
  the worker's firewall envelope arrives in its **return**, not via a file you poll.

### 3. Serial application by a single writer

Workers may run in parallel, but their results are **applied serially by the
orchestrator**. The orchestrator is the **sole writer of `state.json`**: it
records each worker's completion via `lib/state.js` `withWriterLock`, which
takes the exclusive on-disk lock so two completions can never interleave or
torn-write the store. Workers NEVER write `state.json` themselves.

```
orchestrator ── dispatch (Task, in worktree) ──▶ worker A
orchestrator ── dispatch (Task, in worktree) ──▶ worker B
             ◀── return { path, summary, confidence } ── worker A
   withWriterLock(stateDir): validate + record A   (serial)
             ◀── return { path, summary, confidence } ── worker B
   withWriterLock(stateDir): validate + record B   (serial)
```

## Context firewall (F5 fix)

The orchestrator's context must NOT be flooded with each worker's full output
(and any prompt-injection payload buried in it). So:

- The worker writes its **full output** (the real diff, test transcripts, notes)
  to an **absolute shared scratch path OUTSIDE every worktree**.
- The worker **returns only** `{ path, summary, confidence }` — a path handle, a
  ≤3-line summary, and a confidence in `[0,1]`.
- The orchestrator **validates that envelope with `lib/firewall-return.js`
  `parse()`** before trusting it. A hallucinated path, missing/out-of-range
  confidence, or empty/over-long summary is REJECTED (throws) → the worker is
  retried, not trusted.

### Scratch is ABSOLUTE and OUTSIDE the worktrees

This is the crux of the F5 fix. If a worker wrote to a **relative** `.soe/…`
path, that would resolve **inside its own worktree** — a private directory the
orchestrator's main working directory cannot read. The handle would dangle.

Instead, the scratch directory is resolved to an **absolute path in the shared
project checkout**, outside any worktree, that the orchestrator's main working
directory can read:

```
${SOE_SCRATCH:-<project>/.soe/scratch}/<track>/<task>/
```

- Honor `SOE_SCRATCH` if set; otherwise default to `<project>/.soe/scratch`
  where `<project>` is the **main checkout root**, NOT a worker's worktree.
- Resolve it to an **absolute path** (e.g. via `realpath`) before handing it to
  the worker, and pass that absolute path in the dispatch prompt.
- It must live OUTSIDE the worktrees so the orchestrator can read the file the
  worker's returned `path` points at.
- `.soe/scratch/` is ephemeral run-state (gitignored by
  `lib/gitignore-manager.js`) — it is a drop box, not durable memory.

The worker writes there; the orchestrator reads from there only when it decides
to (e.g. on low confidence). The default path stays firewalled behind the
envelope.

A worker that doesn't yet know what context it needs should use
`soe:iterative-retrieval` (dispatch → evaluate → refine, max 3 cycles) to fetch
context progressively rather than over-loading its window up front — this
complements the context firewall and keeps the worker token-frugal.

## Dispatch procedure

1. Ensure the worker's isolated worktree (`soe:using-git-worktrees`).
2. Compute the **absolute** scratch dir `${SOE_SCRATCH:-<project>/.soe/scratch}/<track>/<task>/`
   from the MAIN checkout and `mkdir -p` it.
3. Fill in `worker-template.md` with the task, the worktree, and the absolute
   scratch path; dispatch it as a Task-tool subagent.
4. **Await the return.**
5. Call `parse(return)` from `lib/firewall-return.js`. On reject → retry the
   worker. On accept → proceed.
   - **Ordering (load-bearing):** call `parse()` to validate the return BEFORE
     removing the worker's worktree/scratch dir — the returned `path` must still
     exist on disk at validation time, or an honest worker is wrongly rejected.
6. Under `withWriterLock` (via `lib/state.js`), record completion in
   `state.json`. This is serial and single-writer.

## Red flags

- Streaming a worker's full output back into the orchestrator's context — the
  firewall exists precisely to prevent this.
- A worker writing to a **relative** `.soe/…` path (lands inside its worktree;
  the orchestrator can't read it).
- A worker writing `state.json` — only the orchestrator does, under the lock.
- Trusting a worker's envelope without `parse()` validating it first.
- Any message bus / polling loop — the awaited Task return is the only signal.
