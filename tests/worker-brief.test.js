import { test } from 'node:test';
import assert from 'node:assert';
import { buildWorkerBrief, renderWorkerPrompt, DEFAULT_BUDGET_CHARS } from '../lib/worker-brief.js';

// worker-brief.js — the orchestrator holds full context; each worker gets ONLY
// its responsibility + file handles. These tests lock that the brief stays tiny
// and the prompt forbids re-reading the world.

const task = {
  id: 'M1.2',
  title: 'Per-event validation returning {accepted, rejected}',
  acceptance: 'POST returns 200 with per-event status; retryable errors surfaced',
  files: ['app/controllers/events_controller.rb', 'spec/requests/events_spec.rb'],
  depends_on: ['M1.1'],
};

test('brief carries only the task slice: id, responsibility, acceptance, file HANDLES', () => {
  const b = buildWorkerBrief(task);
  assert.equal(b.task_id, 'M1.2');
  assert.match(b.responsibility, /Per-event validation/);
  assert.deepEqual(b.touches, task.files); // paths, not contents
  assert.deepEqual(b.depends_on, ['M1.1']);
});

test('brief EXCLUDES the design doc / full plan / sibling tasks (no such fields leak in)', () => {
  const b = buildWorkerBrief(task, { design_doc: 'HUGE', plan: 'HUGE', tasks: ['a', 'b'] });
  assert.equal(b.design_doc, undefined);
  assert.equal(b.plan, undefined);
  assert.equal(b.tasks, undefined);
});

test('only task-relevant constraints are included, capped; global-flagged pass through', () => {
  const state = { constraints: [
    { text: 'no destructive migrations', applies_to: ['M1.2'] },   // relevant by id
    { text: 'touches events_controller', applies_to: ['app/controllers/events_controller.rb'] }, // by file
    { text: 'irrelevant to this task', applies_to: ['Z9.9'] },      // dropped
    { text: 'always: minimal diff', global: true },                // global
  ] };
  const b = buildWorkerBrief(task, state);
  assert.ok(b.constraints.includes('no destructive migrations'));
  assert.ok(b.constraints.includes('touches events_controller'));
  assert.ok(b.constraints.includes('always: minimal diff'));
  assert.ok(!b.constraints.includes('irrelevant to this task'));
});

test('_within_budget flags an oversized brief', () => {
  const small = buildWorkerBrief(task);
  assert.equal(small._within_budget, true);
  const huge = buildWorkerBrief({ ...task, title: 'x'.repeat(DEFAULT_BUDGET_CHARS + 100) });
  assert.equal(huge._within_budget, false);
});

test('buildWorkerBrief throws without a task id', () => {
  assert.throws(() => buildWorkerBrief({}), /task with an id/);
  assert.throws(() => buildWorkerBrief(null), /task with an id/);
});

test('rendered prompt scopes the worker: forbids reading the world, lists touch-files, demands firewall envelope', () => {
  const p = renderWorkerPrompt(buildWorkerBrief(task));
  assert.match(p, /EXACTLY ONE task: M1\.2/);
  assert.match(p, /Do NOT read the design doc/);
  assert.match(p, /events_controller\.rb/);
  assert.match(p, /ORCHESTRATOR holds the full/i);
  assert.match(p, /firewall envelope \{ path, summary, confidence \}/);
  assert.match(p, /TDD/);
});
