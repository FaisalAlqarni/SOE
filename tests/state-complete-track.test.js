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

// getDiff stubs — inject a fake diff so tests don't depend on real git.
const emptyDiff = () => '';
const trivialDiff = () => '--- a/README.md\n+++ b/README.md\n+docs change\n';

test('completeTrack: valid PASS + on-disk report advances to COMPLETE and stores provenance', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'soe-ct-'));
  try {
    await advanceStep(dir, 'EVALUATE_EXEC', 'DONE');
    const report = join(dir, 'evaluation-report.md');
    writeFileSync(report, 'PASS');
    await completeTrack(dir, { ...prov(report), tier: 'trivial' }, { getDiff: emptyDiff });
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
      completeTrack(dir, { ...prov(join(dir, 'missing.md')), tier: 'trivial' }, { getDiff: emptyDiff }),
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
        tier: 'trivial',
      }, { getDiff: emptyDiff }),
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
    await assert.rejects(
      () => completeTrack(dir, rec, { getDiff: emptyDiff }),
      /board decision 'REJECTED' does not permit/,
    );
    assert.equal(readState(dir).loop_state.current_step, 'EVALUATE_EXEC');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('completeTrack: full-tier board APPROVED advances to COMPLETE', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'soe-ct-'));
  try {
    await advanceStep(dir, 'EVALUATE_EXEC', 'DONE');
    const report = join(dir, 'evaluation-report.md');
    writeFileSync(report, 'PASS');
    const codeReport = join(dir, 'code-review.md');
    writeFileSync(codeReport, 'PASS');
    const securityReport = join(dir, 'security-review.md');
    writeFileSync(securityReport, 'PASS');
    const rec = {
      ...prov(report),
      board: { decision: 'APPROVED', tier: 'full' },
      tier: 'full',
      reviews: [
        { lens: 'code', agent: 'soe:code-reviewer', verdict: 'PASS', report: codeReport },
        { lens: 'security', agent: 'soe:security-reviewer', verdict: 'PASS', report: securityReport },
      ],
    };
    await completeTrack(dir, rec, { getDiff: emptyDiff });
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
    await assert.rejects(() => completeTrack(dir, rec, { getDiff: emptyDiff }), /does not permit completion/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('completeTrack: non-full board field is ignored (APPROVED not required for standard tier)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'soe-ct-'));
  try {
    await advanceStep(dir, 'EVALUATE_EXEC', 'DONE');
    const report = join(dir, 'evaluation-report.md');
    writeFileSync(report, 'PASS');
    const rec = { ...prov(report), tier: 'trivial', board: { decision: 'REJECTED', tier: 'standard' } };
    await completeTrack(dir, rec, { getDiff: emptyDiff }); // tier !== 'full' => board not enforced
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
    await assert.rejects(() => completeTrack(dir, rec, { getDiff: emptyDiff }), /required review lenses/);
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
    await completeTrack(dir, rec, { getDiff: emptyDiff });
    assert.equal(readState(dir).loop_state.current_step, 'COMPLETE');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// --- Hardening: an omitted or under-stated tier can no longer dodge the
// differentiated-lens gate. The effective tier is floored by classify()'ing
// the actual diff, so a forgetful/malicious orchestrator that skips `tier`
// (or lies with a low one) is still forced through the lenses the real risk
// requires.

test('completeTrack: NO tier + diff that classifies as full-risk THROWS (omit-path no longer a silent pass)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'soe-ct-'));
  try {
    await advanceStep(dir, 'EVALUATE_EXEC', 'DONE');
    const report = join(dir, 'evaluation-report.md');
    writeFileSync(report, 'PASS');
    // A diff touching an auth path classifies 'full' via risk-matrix markers.
    const riskyDiff = () =>
      '--- a/lib/auth/login.js\n+++ b/lib/auth/login.js\n+function login() {}\n';
    await assert.rejects(
      completeTrack(dir, prov(report), { getDiff: riskyDiff }), // no tier field at all
      /required review lenses/,
    );
    assert.equal(readState(dir).loop_state.current_step, 'EVALUATE_EXEC'); // untouched
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('completeTrack: NO tier + empty/undeterminable diff THROWS cannot-determine-tier, state untouched', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'soe-ct-'));
  try {
    await advanceStep(dir, 'EVALUATE_EXEC', 'DONE');
    const report = join(dir, 'evaluation-report.md');
    writeFileSync(report, 'PASS');
    await assert.rejects(
      completeTrack(dir, prov(report), { getDiff: emptyDiff }), // no tier, no derivable floor
      /cannot determine tier/,
    );
    assert.equal(readState(dir).loop_state.current_step, 'EVALUATE_EXEC'); // untouched
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('completeTrack: under-stated tier ("trivial") is RAISED to the diff-derived floor ("full") and still requires lenses', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'soe-ct-'));
  try {
    await advanceStep(dir, 'EVALUATE_EXEC', 'DONE');
    const report = join(dir, 'evaluation-report.md');
    writeFileSync(report, 'PASS');
    const riskyDiff = () =>
      '--- a/lib/auth/login.js\n+++ b/lib/auth/login.js\n+function login() {}\n';
    // Orchestrator under-states tier as 'trivial'; the diff floor ('full') must win.
    await assert.rejects(
      completeTrack(dir, { ...prov(report), tier: 'trivial' }, { getDiff: riskyDiff }),
      /required review lenses/,
    );
    assert.equal(readState(dir).loop_state.current_step, 'EVALUATE_EXEC'); // untouched
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('completeTrack: provenance with NO tier + trivial diff (docs-only) completes (lens gate requires nothing)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'soe-ct-'));
  try {
    await advanceStep(dir, 'EVALUATE_EXEC', 'DONE');
    const report = join(dir, 'evaluation-report.md');
    writeFileSync(report, 'PASS');
    await completeTrack(dir, prov(report), { getDiff: trivialDiff }); // no tier field, diff floors to trivial
    assert.equal(readState(dir).loop_state.current_step, 'COMPLETE');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
