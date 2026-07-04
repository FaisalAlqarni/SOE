import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  resumePoint,
  isAlreadyApplied,
  nextAction,
  resumeFromDir,
  resumePhase,
  resumePhaseFromDir,
  DONE,
} from '../lib/resume.js';

import { writeState } from '../lib/state.js';

// resume.test.js — crash-safe resume + idempotency guard (addresses adversarial
// findings F14 & F18).
//
// F14 — resume is a REAL mechanism computed over the single authoritative state
//   store, not a checkbox/heuristic reconciliation. resumePoint() walks the
//   ordered task list and returns the first task that is not `completed`.
//
// F18 — idempotency: a task left `in_progress` by a crash whose commit ALREADY
//   landed in the branch must be SKIPPED, not re-run. isAlreadyApplied() checks
//   the recorded commitSha against the branch via an INJECTED git runner, so the
//   unit path never shells out. nextAction() combines the two.
//
// A track's state carries an ORDERED list of tasks:
//   { tasks: [ { id, status, commitSha? }, ... ] }
// status ∈ { pending, in_progress, completed }.

/** A stub git runner whose known shas are the ones present in the branch. */
function gitStub(presentShas = []) {
  const present = new Set(presentShas);
  return {
    calls: [],
    commitExists(sha) {
      this.calls.push(sha);
      return present.has(sha);
    },
  };
}

/** Create a fresh temp working dir for a test; cleaned up automatically. */
function mkdir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'soe-resume-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// --- (a) resumePoint: first not-completed, skip completed, done sentinel ------

test('(a) resumePoint returns the first task NOT completed, skipping completed', () => {
  const state = {
    tasks: [
      { id: 'P1', status: 'completed', commitSha: 'aaa' },
      { id: 'P2', status: 'completed', commitSha: 'bbb' },
      { id: 'P3', status: 'pending' },
      { id: 'P4', status: 'pending' },
    ],
  };
  const rp = resumePoint(state);
  assert.equal(rp.id, 'P3', 'skips the two completed tasks, returns P3');
});

test('(a) resumePoint returns DONE when all tasks are completed', () => {
  const state = {
    tasks: [
      { id: 'P1', status: 'completed', commitSha: 'aaa' },
      { id: 'P2', status: 'completed', commitSha: 'bbb' },
    ],
  };
  assert.equal(resumePoint(state), DONE, 'all completed → DONE sentinel');
});

test('(a) resumePoint returns the first task when none are completed', () => {
  const state = {
    tasks: [
      { id: 'P1', status: 'pending' },
      { id: 'P2', status: 'pending' },
    ],
  };
  assert.equal(resumePoint(state).id, 'P1');
});

test('(a) resumePoint on an empty task list returns DONE (nothing to run)', () => {
  assert.equal(resumePoint({ tasks: [] }), DONE);
});

test('(a) resumePoint on an absent/null task list returns DONE', () => {
  assert.equal(resumePoint({}), DONE, 'absent tasks → DONE');
  assert.equal(resumePoint(null), DONE, 'null state → DONE');
});

// --- (b) in-flight re-run: in_progress is returned, not skipped ---------------

test('(b) resumePoint returns an in_progress (crashed mid-task) task for re-run', () => {
  const state = {
    tasks: [
      { id: 'P1', status: 'completed', commitSha: 'aaa' },
      { id: 'P2', status: 'in_progress' }, // crashed mid-task
      { id: 'P3', status: 'pending' },
    ],
  };
  const rp = resumePoint(state);
  assert.equal(rp.id, 'P2', 'in_progress task is returned for re-run, not skipped');
});

// --- (c) isAlreadyApplied: uses the injected commit-existence check ------------

test('(c) isAlreadyApplied is true when the recorded commitSha is present in the branch', () => {
  const task = { id: 'P2', status: 'in_progress', commitSha: 'cafe123' };
  const git = gitStub(['cafe123']);
  assert.equal(isAlreadyApplied(task, git), true);
  assert.deepEqual(git.calls, ['cafe123'], 'the injected check was consulted with the sha');
});

test('(c) isAlreadyApplied is false when the recorded commitSha is absent/unknown', () => {
  const task = { id: 'P2', status: 'in_progress', commitSha: 'cafe123' };
  const git = gitStub([]); // sha not present in branch
  assert.equal(isAlreadyApplied(task, git), false);
  assert.deepEqual(git.calls, ['cafe123']);
});

test('(c) isAlreadyApplied is false when the task has no recorded commitSha', () => {
  const task = { id: 'P2', status: 'in_progress' }; // no commitSha at all
  const git = gitStub(['whatever']);
  assert.equal(isAlreadyApplied(task, git), false, 'no sha to check → not applied');
  assert.deepEqual(git.calls, [], 'the git check is not even consulted without a sha');
});

// --- (d) nextAction: combine resumePoint + idempotency skip (F18) --------------

test('(d) nextAction returns the in_progress task for re-run when its commit did NOT land', () => {
  const state = {
    tasks: [
      { id: 'P1', status: 'completed', commitSha: 'aaa' },
      { id: 'P2', status: 'in_progress', commitSha: 'bbb' }, // crashed, commit absent
      { id: 'P3', status: 'pending' },
    ],
  };
  const git = gitStub(['aaa']); // bbb did NOT land
  const action = nextAction(state, git);
  assert.equal(action.id, 'P2', 'commit absent → re-run the in_progress task');
});

test('(d) nextAction SKIPS an in_progress task whose commit ALREADY landed (idempotency, F18)', () => {
  const state = {
    tasks: [
      { id: 'P1', status: 'completed', commitSha: 'aaa' },
      { id: 'P2', status: 'in_progress', commitSha: 'bbb' }, // crashed AFTER commit landed
      { id: 'P3', status: 'pending' },
    ],
  };
  const git = gitStub(['aaa', 'bbb']); // bbb DID land
  const action = nextAction(state, git);
  assert.equal(action.id, 'P3', 'commit already landed → treat P2 as done, run P3');
});

test('(d) nextAction returns DONE when the last in_progress task already landed', () => {
  const state = {
    tasks: [
      { id: 'P1', status: 'completed', commitSha: 'aaa' },
      { id: 'P2', status: 'in_progress', commitSha: 'bbb' },
    ],
  };
  const git = gitStub(['aaa', 'bbb']); // both landed → nothing left
  assert.equal(nextAction(state, git), DONE);
});

test('(d) nextAction does not consult git for a plain pending task', () => {
  const state = {
    tasks: [
      { id: 'P1', status: 'completed', commitSha: 'aaa' },
      { id: 'P2', status: 'pending' },
    ],
  };
  const git = gitStub(['aaa']);
  const action = nextAction(state, git);
  assert.equal(action.id, 'P2');
  assert.deepEqual(git.calls, [], 'pending (not in_progress) → no idempotency git check needed');
});

test('(d) nextAction returns DONE for an all-completed state', () => {
  const state = { tasks: [{ id: 'P1', status: 'completed', commitSha: 'aaa' }] };
  assert.equal(nextAction(state, gitStub(['aaa'])), DONE);
});

// --- resumeFromDir: loads state via state.js then computes nextAction ----------

test('resumeFromDir loads the authoritative state from a dir and resumes over it', (t) => {
  const dir = mkdir(t);
  writeState(dir, {
    tasks: [
      { id: 'P1', status: 'completed', commitSha: 'aaa' },
      { id: 'P2', status: 'in_progress', commitSha: 'bbb' },
      { id: 'P3', status: 'pending' },
    ],
  });

  // bbb already landed → P2 is skipped, resume at P3.
  const action = resumeFromDir(dir, gitStub(['aaa', 'bbb']));
  assert.equal(action.id, 'P3');
});

test('resumeFromDir returns DONE when there is no committed state', (t) => {
  const dir = mkdir(t);
  assert.equal(resumeFromDir(dir, gitStub([])), DONE);
});

// --- (e) resumePhase: phase-aware resume (F2) ---------------------------------
//
// The bug: resumeFromDir/nextAction only walk tasks[], so at PLAN with tasks:[]
// they return the DONE sentinel — ambiguous with "all tasks done", causing a
// naive driver to SKIP the PLAN phase. resumePhase reads the AUTHORITATIVE phase
// from loop_state.current_step and only computes the next task when EXECUTEing.

test('(e) resumePhase at PLAN with an empty task list returns {step:PLAN, task:null}, NOT DONE', () => {
  const state = { loop_state: { current_step: 'PLAN' }, tasks: [] };
  const r = resumePhase(state, gitStub([]));
  assert.equal(r.step, 'PLAN', 'authoritative phase is PLAN');
  assert.equal(r.task, null, 'no task to run at PLAN');
  // The disambiguation: this must NOT be the DONE sentinel (all-tasks-done).
  assert.notEqual(r.task, DONE, 'PLAN with no tasks is NOT the DONE sentinel');
});

test('(e) resumePhase at EXECUTE with a pending task returns {step:EXECUTE, task:<that task>}', () => {
  const state = {
    loop_state: { current_step: 'EXECUTE' },
    tasks: [
      { id: 'P1', status: 'completed', commitSha: 'aaa' },
      { id: 'P2', status: 'pending' },
    ],
  };
  const r = resumePhase(state, gitStub(['aaa']));
  assert.equal(r.step, 'EXECUTE');
  assert.equal(r.task.id, 'P2', 'returns the next pending task');
});

test('(e) resumePhase at EXECUTE with all tasks completed returns {step:EXECUTE, task:DONE}', () => {
  const state = {
    loop_state: { current_step: 'EXECUTE' },
    tasks: [{ id: 'P1', status: 'completed', commitSha: 'aaa' }],
  };
  const r = resumePhase(state, gitStub(['aaa']));
  assert.equal(r.step, 'EXECUTE');
  assert.equal(r.task, DONE, 'all EXECUTE tasks done → DONE sentinel');
});

test('(e) resumePhase defaults step to PLAN when loop_state is missing', () => {
  const r = resumePhase({ tasks: [] }, gitStub([]));
  assert.equal(r.step, 'PLAN', 'missing loop_state → PLAN default');
  assert.equal(r.task, null);
});

test('(e) resumePhase defaults step to PLAN for null state', () => {
  const r = resumePhase(null, gitStub([]));
  assert.equal(r.step, 'PLAN');
  assert.equal(r.task, null);
});

test('resumePhaseFromDir reads state via state.js then computes resumePhase', (t) => {
  const dir = mkdir(t);
  writeState(dir, {
    loop_state: { current_step: 'EXECUTE' },
    tasks: [
      { id: 'P1', status: 'completed', commitSha: 'aaa' },
      { id: 'P2', status: 'pending' },
    ],
  });
  const r = resumePhaseFromDir(dir, gitStub(['aaa']));
  assert.equal(r.step, 'EXECUTE');
  assert.equal(r.task.id, 'P2');
});

test('resumePhaseFromDir at PLAN with no committed tasks returns {step:PLAN, task:null}', (t) => {
  const dir = mkdir(t);
  writeState(dir, { loop_state: { current_step: 'PLAN' }, tasks: [] });
  const r = resumePhaseFromDir(dir, gitStub([]));
  assert.equal(r.step, 'PLAN');
  assert.equal(r.task, null);
});
