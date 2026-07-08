import { test } from 'node:test';
import assert from 'node:assert';

import { auditCompletions, requireTrackLenses } from '../lib/review-gate.js';
import { requiredReviews } from '../lib/review-policy.js';

// review-gate.test.js — pure completion auditor over injected fakes (NO fs).
// For every completed task, verifies each required review lens has a report,
// that the report PASSES, and that the reviewer is not the implementer
// (self-review is forbidden).

function header({ lens, reviewer, verdict = 'PASS', blocking = 0 }) {
  return `LENS: ${lens}\nREVIEWER: ${reviewer}\nVERDICT: ${verdict}\nBLOCKING: ${blocking}\n`;
}

function makeFakes({ reports = {}, tiers = {}, touches = {}, implementers = {} } = {}) {
  return {
    requiredReviews,
    hasReport: (taskId, lens) => Boolean(reports[taskId] && reports[taskId][lens]),
    readReport: (taskId, lens) => reports[taskId][lens],
    tierOf: (task) => tiers[task.id] || 'standard',
    touchesOf: (task) => touches[task.id] || {},
    implementerOf: (task) => implementers[task.id] || 'soe:implementer',
  };
}

test('clean track (all required reviews PASS) => ok:true, no violations', () => {
  const state = { tasks: [{ id: 'P1.1', status: 'completed' }] };
  const reports = {
    'P1.1': { code: header({ lens: 'code', reviewer: 'soe:code-reviewer' }) },
  };
  const fakes = makeFakes({ reports, tiers: { 'P1.1': 'standard' } });
  const out = auditCompletions(state, fakes);
  assert.equal(out.ok, true);
  assert.deepEqual(out.violations, []);
});

test('full-tier task missing its security report => one no-review violation', () => {
  const state = { tasks: [{ id: 'P2.1', status: 'completed' }] };
  const reports = {
    'P2.1': { code: header({ lens: 'code', reviewer: 'soe:code-reviewer' }) },
    // security report absent
  };
  const fakes = makeFakes({ reports, tiers: { 'P2.1': 'full' } });
  const out = auditCompletions(state, fakes);
  assert.equal(out.ok, false);
  assert.equal(out.violations.length, 1);
  assert.deepEqual(out.violations[0], { taskId: 'P2.1', lens: 'security', kind: 'no-review' });
});

test('completed task whose security report is FAIL => review-failed violation', () => {
  const state = { tasks: [{ id: 'P3.1', status: 'completed' }] };
  const reports = {
    'P3.1': {
      code: header({ lens: 'code', reviewer: 'soe:code-reviewer' }),
      security: header({ lens: 'security', reviewer: 'soe:security-reviewer', verdict: 'FAIL' }),
    },
  };
  const fakes = makeFakes({ reports, tiers: { 'P3.1': 'full' } });
  const out = auditCompletions(state, fakes);
  assert.equal(out.ok, false);
  const v = out.violations.find((v) => v.lens === 'security');
  assert.equal(v.kind, 'review-failed');
  assert.equal(v.taskId, 'P3.1');
});

test('trivial task with zero reviews => ok:true (required set is empty)', () => {
  const state = { tasks: [{ id: 'P4.1', status: 'completed' }] };
  const reports = {};
  const fakes = makeFakes({ reports, tiers: { 'P4.1': 'trivial' } });
  const out = auditCompletions(state, fakes);
  assert.equal(out.ok, true);
  assert.deepEqual(out.violations, []);
});

test('report whose reviewer == implementer => self-review violation', () => {
  const state = { tasks: [{ id: 'P5.1', status: 'completed' }] };
  const reports = {
    'P5.1': { code: header({ lens: 'code', reviewer: 'soe:implementer-x' }) },
  };
  const fakes = makeFakes({
    reports,
    tiers: { 'P5.1': 'standard' },
    implementers: { 'P5.1': 'soe:implementer-x' },
  });
  const out = auditCompletions(state, fakes);
  assert.equal(out.ok, false);
  assert.equal(out.violations.length, 1);
  assert.deepEqual(out.violations[0], { taskId: 'P5.1', lens: 'code', kind: 'self-review' });
});

test('multiple violations across multiple tasks aggregate', () => {
  const state = {
    tasks: [
      { id: 'P6.1', status: 'completed' }, // missing code review
      { id: 'P6.2', status: 'completed' }, // security review FAILs
      { id: 'P6.3', status: 'in_progress' }, // NOT completed — ignored
    ],
  };
  const reports = {
    'P6.1': {},
    'P6.2': {
      code: header({ lens: 'code', reviewer: 'soe:code-reviewer' }),
      security: header({ lens: 'security', reviewer: 'soe:security-reviewer', verdict: 'FAIL' }),
    },
  };
  const fakes = makeFakes({
    reports,
    tiers: { 'P6.1': 'standard', 'P6.2': 'full' },
  });
  const out = auditCompletions(state, fakes);
  assert.equal(out.ok, false);
  assert.equal(out.violations.length, 2);
  assert.ok(out.violations.some((v) => v.taskId === 'P6.1' && v.kind === 'no-review' && v.lens === 'code'));
  assert.ok(out.violations.some((v) => v.taskId === 'P6.2' && v.kind === 'review-failed' && v.lens === 'security'));
});

test('non-completed tasks are ignored entirely', () => {
  const state = { tasks: [{ id: 'P7.1', status: 'pending' }] };
  const fakes = makeFakes({});
  const out = auditCompletions(state, fakes);
  assert.equal(out.ok, true);
  assert.deepEqual(out.violations, []);
});

// requireTrackLenses — the TRACK-level completion gate: a track cannot
// complete unless the tier's differentiated review lenses actually ran
// (PASS, non-author, on disk).

test('requireTrackLenses: full tier with only a code PASS review => missing security', () => {
  const out = requireTrackLenses('full', [
    { lens: 'code', agent: 'soe:code-reviewer', verdict: 'PASS', report: '/r/code.md' },
  ], { fileExists: () => true });
  assert.equal(out.ok, false);
  assert.deepEqual(out.violations, [{ lens: 'security', kind: 'missing' }]);
});

test('requireTrackLenses: full tier with code PASS + security FAIL => failed', () => {
  const out = requireTrackLenses('full', [
    { lens: 'code', agent: 'soe:code-reviewer', verdict: 'PASS', report: '/r/code.md' },
    { lens: 'security', agent: 'soe:security-reviewer', verdict: 'FAIL', report: '/r/security.md' },
  ], { fileExists: () => true });
  assert.equal(out.ok, false);
  assert.deepEqual(out.violations, [{ lens: 'security', kind: 'failed' }]);
});

test('requireTrackLenses: full tier with both PASS + reports on disk => ok', () => {
  const out = requireTrackLenses('full', [
    { lens: 'code', agent: 'soe:code-reviewer', verdict: 'PASS', report: '/r/code.md' },
    { lens: 'security', agent: 'soe:security-reviewer', verdict: 'PASS', report: '/r/security.md' },
  ], { fileExists: () => true });
  assert.equal(out.ok, true);
  assert.deepEqual(out.violations, []);
});

test('requireTrackLenses: trivial tier with no reviews => ok (required set is empty)', () => {
  const out = requireTrackLenses('trivial', [], { fileExists: () => true });
  assert.equal(out.ok, true);
  assert.deepEqual(out.violations, []);
});

test('requireTrackLenses: security review whose agent === implementer => self-review', () => {
  const out = requireTrackLenses('full', [
    { lens: 'code', agent: 'soe:code-reviewer', verdict: 'PASS', report: '/r/code.md' },
    { lens: 'security', agent: 'soe:fast-worker', verdict: 'PASS', report: '/r/security.md' },
  ], { fileExists: () => true, implementers: ['soe:fast-worker'] });
  assert.equal(out.ok, false);
  assert.deepEqual(out.violations, [{ lens: 'security', kind: 'self-review' }]);
});

test('requireTrackLenses: dangling report path (fileExists => false) => dangling', () => {
  const out = requireTrackLenses('standard', [
    { lens: 'code', agent: 'soe:code-reviewer', verdict: 'PASS', report: '/r/code.md' },
  ], { fileExists: () => false });
  assert.equal(out.ok, false);
  assert.deepEqual(out.violations, [{ lens: 'code', kind: 'dangling' }]);
});
