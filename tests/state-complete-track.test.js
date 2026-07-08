import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { completeTrack, readState, advanceStep } from '../lib/state.js';

const prov = (report) => ({
  implementers: ['soe:fast-worker'],
  evaluator: { agent: 'soe:loop-execution-evaluator', verdict: 'PASS', report },
});

test('completeTrack: valid PASS + on-disk report advances to COMPLETE and stores provenance', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'soe-ct-'));
  try {
    await advanceStep(dir, 'EVALUATE_EXEC', 'DONE');
    const report = join(dir, 'evaluation-report.md');
    writeFileSync(report, 'PASS');
    await completeTrack(dir, prov(report));
    const s = readState(dir);
    assert.equal(s.loop_state.current_step, 'COMPLETE');
    assert.equal(s.provenance.evaluator.verdict, 'PASS');
    assert.equal(s.status, 'complete');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('completeTrack: THROWS when the report handle is not on disk, and does NOT advance', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'soe-ct-'));
  try {
    await advanceStep(dir, 'EVALUATE_EXEC', 'DONE');
    await assert.rejects(
      completeTrack(dir, prov(join(dir, 'missing.md'))),
      /does not exist on disk/,
    );
    assert.equal(readState(dir).loop_state.current_step, 'EVALUATE_EXEC'); // untouched
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('completeTrack: THROWS on self-review (evaluator in implementers), no advance', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'soe-ct-'));
  try {
    await advanceStep(dir, 'EVALUATE_EXEC', 'DONE');
    const report = join(dir, 'evaluation-report.md');
    writeFileSync(report, 'PASS');
    await assert.rejects(
      completeTrack(dir, {
        implementers: ['soe:loop-execution-evaluator'],
        evaluator: { agent: 'soe:loop-execution-evaluator', verdict: 'PASS', report },
      }),
      /self-review/,
    );
    assert.equal(readState(dir).loop_state.current_step, 'EVALUATE_EXEC');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('completeTrack: full-tier board REJECTED throws and does NOT advance', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'soe-ct-'));
  try {
    await advanceStep(dir, 'EVALUATE_EXEC', 'DONE');
    const report = join(dir, 'evaluation-report.md');
    writeFileSync(report, 'PASS');
    const rec = { ...prov(report), board: { decision: 'REJECTED', tier: 'full' } };
    await assert.rejects(() => completeTrack(dir, rec), /board decision 'REJECTED' does not permit/);
    assert.equal(readState(dir).loop_state.current_step, 'EVALUATE_EXEC');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('completeTrack: full-tier board APPROVED advances to COMPLETE', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'soe-ct-'));
  try {
    await advanceStep(dir, 'EVALUATE_EXEC', 'DONE');
    const report = join(dir, 'evaluation-report.md');
    writeFileSync(report, 'PASS');
    const rec = { ...prov(report), board: { decision: 'APPROVED', tier: 'full' } };
    await completeTrack(dir, rec);
    assert.equal(readState(dir).loop_state.current_step, 'COMPLETE');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('completeTrack: ESCALATE does not permit completion', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'soe-ct-'));
  try {
    await advanceStep(dir, 'EVALUATE_EXEC', 'DONE');
    const report = join(dir, 'evaluation-report.md');
    writeFileSync(report, 'PASS');
    const rec = { ...prov(report), board: { decision: 'ESCALATE', tier: 'full' } };
    await assert.rejects(() => completeTrack(dir, rec), /does not permit completion/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('completeTrack: non-full board field is ignored (APPROVED not required for standard tier)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'soe-ct-'));
  try {
    await advanceStep(dir, 'EVALUATE_EXEC', 'DONE');
    const report = join(dir, 'evaluation-report.md');
    writeFileSync(report, 'PASS');
    const rec = { ...prov(report), board: { decision: 'REJECTED', tier: 'standard' } };
    await completeTrack(dir, rec); // tier !== 'full' => board not enforced
    assert.equal(readState(dir).loop_state.current_step, 'COMPLETE');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// requireTrackLenses wiring: a track cannot complete unless its tier's
// differentiated review lenses (code/security/…) actually ran.

test('completeTrack: full-tier provenance missing the security lens review THROWS, state untouched', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'soe-ct-'));
  try {
    await advanceStep(dir, 'EVALUATE_EXEC', 'DONE');
    const evalReport = join(dir, 'evaluation-report.md');
    writeFileSync(evalReport, 'PASS');
    const codeReport = join(dir, 'code-review.md');
    writeFileSync(codeReport, 'PASS');
    const rec = {
      ...prov(evalReport),
      tier: 'full',
      reviews: [{ lens: 'code', agent: 'soe:code-reviewer', verdict: 'PASS', report: codeReport }],
    };
    await assert.rejects(() => completeTrack(dir, rec), /required review lenses/);
    assert.equal(readState(dir).loop_state.current_step, 'EVALUATE_EXEC'); // untouched
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('completeTrack: full-tier provenance with both code + security PASS reviews (on disk) completes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'soe-ct-'));
  try {
    await advanceStep(dir, 'EVALUATE_EXEC', 'DONE');
    const evalReport = join(dir, 'evaluation-report.md');
    writeFileSync(evalReport, 'PASS');
    const codeReport = join(dir, 'code-review.md');
    writeFileSync(codeReport, 'PASS');
    const securityReport = join(dir, 'security-review.md');
    writeFileSync(securityReport, 'PASS');
    const rec = {
      ...prov(evalReport),
      tier: 'full',
      reviews: [
        { lens: 'code', agent: 'soe:code-reviewer', verdict: 'PASS', report: codeReport },
        { lens: 'security', agent: 'soe:security-reviewer', verdict: 'PASS', report: securityReport },
      ],
    };
    await completeTrack(dir, rec);
    assert.equal(readState(dir).loop_state.current_step, 'COMPLETE');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('completeTrack: provenance with NO tier completes (back-compat, lens gate skipped)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'soe-ct-'));
  try {
    await advanceStep(dir, 'EVALUATE_EXEC', 'DONE');
    const report = join(dir, 'evaluation-report.md');
    writeFileSync(report, 'PASS');
    await completeTrack(dir, prov(report)); // no tier field at all
    assert.equal(readState(dir).loop_state.current_step, 'COMPLETE');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
