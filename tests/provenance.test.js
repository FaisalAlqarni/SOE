import { test } from 'node:test';
import assert from 'node:assert';

import { gate, check, isComplete, build } from '../lib/provenance.js';

// provenance.test.js — the completion GATE is the actual fix for the founding
// incident (self-certified task marked COMPLETE with no independent review).
// A task may complete ONLY with provenance proving a non-author evaluator left a
// PASS verdict + an on-disk report handle. `fileExists` is injected so the gate
// is testable without the filesystem.

const exists = () => true; // pretend every report handle is on disk
const missing = () => false; // pretend the report handle is NOT on disk

const valid = {
  implementer: { agent: 'soe:fast-worker', model: 'claude-sonnet-5', commit: 'abc123' },
  evaluator: { agent: 'soe:loop-execution-evaluator', model: 'claude-opus-4-8', verdict: 'PASS', report: '/tmp/x/eval.md' },
};

test('gate PASSES a valid non-author PASS with an on-disk report', () => {
  assert.doesNotThrow(() => gate(valid, { fileExists: exists }));
  assert.equal(isComplete(valid, { fileExists: exists }), true);
});

test('gate THROWS when there is no evaluator (task never reviewed)', () => {
  const r = { implementer: { agent: 'soe:fast-worker' } };
  assert.throws(() => gate(r, { fileExists: exists }), /no evaluator/);
  assert.equal(isComplete(r, { fileExists: exists }), false);
});

test('gate THROWS when no implementer is recorded (cannot verify non-author review)', () => {
  const r = { implementers: [], evaluator: { agent: 'soe:loop-execution-evaluator', verdict: 'PASS', report: '/tmp/x/eval.md' } };
  assert.throws(() => gate(r, { fileExists: exists }), /no implementer/);
});
test('gate THROWS when the implementer list is entirely absent', () => {
  const r = { evaluator: { agent: 'soe:loop-execution-evaluator', verdict: 'PASS', report: '/tmp/x/eval.md' } };
  assert.throws(() => gate(r, { fileExists: exists }), /no implementer/);
});

test('gate THROWS on self-review (evaluator === implementer)', () => {
  const r = {
    implementer: { agent: 'soe:fast-worker' },
    evaluator: { agent: 'soe:fast-worker', verdict: 'PASS', report: '/tmp/x/eval.md' },
  };
  assert.throws(() => gate(r, { fileExists: exists }), /self-review/);
});

test('gate THROWS when the verdict is missing', () => {
  const r = { ...valid, evaluator: { agent: 'soe:eval', report: '/tmp/x/eval.md' } };
  assert.throws(() => gate(r, { fileExists: exists }), /verdict missing/);
});

test('gate THROWS when the verdict is not PASS (FAIL must route to fixer, not complete)', () => {
  const r = { ...valid, evaluator: { ...valid.evaluator, verdict: 'FAIL' } };
  assert.throws(() => gate(r, { fileExists: exists }), /not PASS/);
});

test('gate THROWS when the report handle is missing', () => {
  const r = { ...valid, evaluator: { agent: 'soe:eval', verdict: 'PASS' } };
  assert.throws(() => gate(r, { fileExists: exists }), /report handle missing/);
});

test('gate THROWS when the report handle does not exist on disk (dangling/forged)', () => {
  assert.throws(() => gate(valid, { fileExists: missing }), /does not exist on disk/);
  assert.equal(isComplete(valid, { fileExists: missing }), false);
});

test('gate THROWS on a null/absent record', () => {
  assert.throws(() => gate(null, { fileExists: exists }), /missing record/);
  assert.throws(() => gate(undefined, { fileExists: exists }), /missing record/);
});

test('check() never throws — returns {ok,reason}', () => {
  assert.equal(check(null).ok, false);
  assert.ok(check(null).reason);
  assert.equal(check(valid, { fileExists: exists }).ok, true);
});

test('gate accepts an array of implementers; evaluator must not be any of them', () => {
  const rec = {
    implementers: ['soe:fast-worker', 'soe:loop-fixer'],
    evaluator: { agent: 'soe:loop-execution-evaluator', verdict: 'PASS', report: '/tmp/x/eval.md' },
  };
  assert.doesNotThrow(() => gate(rec, { fileExists: exists }));
});

test('gate THROWS when the evaluator is one of the implementers (array form)', () => {
  const rec = {
    implementers: ['soe:fast-worker', 'soe:loop-execution-evaluator'],
    evaluator: { agent: 'soe:loop-execution-evaluator', verdict: 'PASS', report: '/tmp/x/eval.md' },
  };
  assert.throws(() => gate(rec, { fileExists: exists }), /self-review/);
});

test('build() keeps verdicts + handles, strips findings prose', () => {
  const rec = build({
    implementer: { agent: 'soe:fast-worker', model: 'claude-sonnet-5', commit: 'c1', extra: 'DROP' },
    evaluator: { agent: 'soe:eval', verdict: 'PASS', report: '/tmp/e.md', findings: ['DROP THIS PROSE'] },
    tests: { ran: true, summary: '12 pass', junk: 'DROP' },
    reviews: [{ agent: 'soe:security-reviewer', verdict: 'PASS', findings_count: 0, prose: 'DROP' }],
  });
  assert.equal(rec.implementer.agent, 'soe:fast-worker');
  assert.equal(rec.implementer.extra, undefined); // stripped
  assert.equal(rec.evaluator.findings, undefined); // no findings prose in state
  assert.equal(rec.evaluator.verdict, 'PASS');
  assert.equal(rec.tests.junk, undefined);
  assert.equal(rec.reviews[0].prose, undefined);
  assert.equal(rec.reviews[0].findings_count, 0);
  // and the built record passes the gate
  assert.doesNotThrow(() => gate(rec, { fileExists: exists }));
});

// --- integration: markTaskComplete + the gate (real fs) ---
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { markTaskComplete, readState, writeState } from '../lib/state.js';

test('markTaskComplete: 3-arg marks a task completed (per-task completion is ungated; enforcement is completeTrack)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'soe-prov-'));
  try {
    writeState(dir, { tasks: [] });
    await markTaskComplete(dir, 'T-legacy', 'sha1');
    assert.equal(readState(dir).tasks.find((t) => t.id === 'T-legacy').status, 'completed');
    await markTaskComplete(dir, 'T-2', 'sha2');
    const t2 = readState(dir).tasks.find((t) => t.id === 'T-2');
    assert.equal(t2.status, 'completed');
    assert.equal(t2.provenance, undefined); // no provenance stored per-task anymore
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
