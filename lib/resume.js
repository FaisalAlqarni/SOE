import { spawnSync } from 'node:child_process';

import { readState } from './state.js';

/**
 * lib/resume.js — crash-safe resume + idempotency guard for the orchestration
 * engine. Addresses adversarial findings F14 & F18.
 *
 * F14 — resume is a REAL mechanism computed over the SINGLE authoritative state
 *   store (lib/state.js), not a checkbox/heuristic reconciliation. resumePoint()
 *   walks the ordered task list and returns the first task that is not
 *   `completed`. There is exactly one source of truth: the task's own status.
 *
 * F18 — idempotency. A crash can leave a task `in_progress` AFTER its commit has
 *   already landed in the branch. Re-running such a task would double-apply work
 *   (or corrupt the tree). nextAction() therefore treats an `in_progress` task
 *   whose recorded commitSha is already present in the branch as completed, and
 *   SKIPS it. The branch check is INJECTED (isAlreadyApplied(task, gitRunner)),
 *   so the unit path never shells out to git.
 *
 * State shape (single source of truth):
 *   { tasks: [ { id, status, commitSha? }, ... ] }
 *   status ∈ { 'pending' | 'in_progress' | 'completed' }.
 * The task list is ORDERED — resume walks it front to back.
 */

/**
 * Sentinel returned when there is no further task to run (all tasks completed,
 * or there are no tasks at all). Frozen so callers can compare by identity
 * (`action === DONE`) and cannot mutate it.
 */
export const DONE = Object.freeze({ done: true });

const COMPLETED = 'completed';
const IN_PROGRESS = 'in_progress';

/** Extract the ordered task array from a state object, tolerating null/absent. */
function taskList(state) {
  if (!state || !Array.isArray(state.tasks)) return [];
  return state.tasks;
}

/**
 * The default git runner. Shells out to real git to decide whether a commit is
 * present in the current branch. Overridable: every public function accepts a
 * runner, and tests pass a stub so no real repo/git is required.
 *
 * commitExists(sha) is true when `sha` resolves to a commit object that exists
 * in the repository. `git cat-file -e <sha>^{commit}` exits 0 iff so.
 */
export const defaultGitRunner = {
  commitExists(sha) {
    if (!sha) return false;
    const res = spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], {
      encoding: 'utf8',
    });
    return res.status === 0;
  },
};

/**
 * Compute the resume point over the single authoritative state (F14).
 * Returns the FIRST task whose status is not `completed`, walking the ordered
 * list front to back. A task left `in_progress` by a crash is NOT skipped — it
 * is returned so it can be re-run. Returns the DONE sentinel when every task is
 * completed, or when there are no tasks.
 *
 * This is a PURE function of the state object — no fs, no git.
 *
 * @param {object|null} state - The authoritative state object.
 * @returns {object|typeof DONE} The task to resume at, or DONE.
 */
export function resumePoint(state) {
  for (const task of taskList(state)) {
    if (task.status !== COMPLETED) return task;
  }
  return DONE;
}

/**
 * Idempotency guard (F18). Returns true when the task's recorded commitSha is
 * ALREADY present in the branch — i.e. its work already landed and re-running it
 * would double-apply. The branch check is INJECTED via `gitRunner.commitExists`,
 * so this stays unit-testable and the unit path never shells out.
 *
 * A task with no recorded commitSha has provably not landed a commit, so this
 * returns false WITHOUT consulting git.
 *
 * @param {object} task - A task record ({ id, status, commitSha? }).
 * @param {{commitExists: (sha: string) => boolean}} [gitRunner] - Injectable check.
 * @returns {boolean} True if the task's commit already exists in the branch.
 */
export function isAlreadyApplied(task, gitRunner = defaultGitRunner) {
  const sha = task && task.commitSha;
  if (!sha) return false;
  return gitRunner.commitExists(sha) === true;
}

/**
 * Combine resumePoint + the idempotency guard to pick the next task to actually
 * run. If the resume point is an `in_progress` task whose commit already landed
 * (isAlreadyApplied), that task is treated as completed and SKIPPED — resume
 * advances to the following not-completed task. This is repeated so multiple
 * already-landed in-flight tasks are all skipped. Returns DONE when nothing is
 * left to run.
 *
 * Pure over (state, gitRunner): the only side effect is the injected git check,
 * which is a stub in tests and real git in production.
 *
 * @param {object|null} state - The authoritative state object.
 * @param {{commitExists: (sha: string) => boolean}} [gitRunner] - Injectable check.
 * @returns {object|typeof DONE} The next task to run, or DONE.
 */
export function nextAction(state, gitRunner = defaultGitRunner) {
  for (const task of taskList(state)) {
    if (task.status === COMPLETED) continue;
    // An in-flight task whose commit already landed is idempotently done: skip.
    if (task.status === IN_PROGRESS && isAlreadyApplied(task, gitRunner)) {
      continue;
    }
    return task;
  }
  return DONE;
}

/**
 * Convenience wrapper: load the authoritative state from `dir` via state.js,
 * then compute nextAction over it. Returns DONE when no state is committed
 * (readState returns null) or nothing is left to run. The core functions above
 * remain pure over the state object; this is the fs-touching entry point.
 *
 * @param {string} dir - State directory (as consumed by lib/state.js).
 * @param {{commitExists: (sha: string) => boolean}} [gitRunner] - Injectable check.
 * @returns {object|typeof DONE} The next task to run, or DONE.
 */
export function resumeFromDir(dir, gitRunner = defaultGitRunner) {
  const state = readState(dir);
  return nextAction(state, gitRunner);
}

/**
 * Phase-aware resume (addresses adversarial finding F2).
 *
 * The bug it fixes: nextAction/resumeFromDir only walk tasks[], so at the PLAN
 * phase with tasks:[] they return the DONE sentinel — which is AMBIGUOUS with
 * "all tasks completed". A naive driver reading DONE would wrongly SKIP the PLAN
 * phase entirely.
 *
 * resumePhase resolves that ambiguity by reading the AUTHORITATIVE phase from
 * `state.loop_state.current_step` (defaulting to 'PLAN' when loop_state is
 * absent). It only computes the next task when the phase is 'EXECUTE' — every
 * other phase returns task:null, which is unambiguously "not a completed run".
 *
 *   PLAN    + tasks:[]  → { step:'PLAN',    task:null }   (NOT DONE)
 *   EXECUTE + pending   → { step:'EXECUTE', task:<next> }
 *   EXECUTE + all done  → { step:'EXECUTE', task:DONE }
 *
 * Pure over (state, git) — git is only consulted through nextAction's injected
 * idempotency check when the phase is EXECUTE.
 *
 * @param {object|null} state - The authoritative state object.
 * @param {{commitExists: (sha: string) => boolean}} [git] - Injectable check.
 * @returns {{ step: string, task: object|typeof DONE|null }} Phase + next task.
 */
export function resumePhase(state, git = defaultGitRunner) {
  const step = state?.loop_state?.current_step ?? 'PLAN';
  const task = step === 'EXECUTE' ? nextAction(state, git) : null;
  return { step, task };
}

/**
 * Convenience wrapper: load the authoritative state from `dir` via state.js,
 * then compute resumePhase over it. The fs-touching entry point for F2.
 *
 * @param {string} dir - State directory (as consumed by lib/state.js).
 * @param {{commitExists: (sha: string) => boolean}} [git] - Injectable check.
 * @returns {{ step: string, task: object|typeof DONE|null }} Phase + next task.
 */
export function resumePhaseFromDir(dir, git = defaultGitRunner) {
  const state = readState(dir);
  return resumePhase(state, git);
}
