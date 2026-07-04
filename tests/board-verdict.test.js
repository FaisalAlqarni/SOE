import { test } from 'node:test';
import assert from 'node:assert';

import { parseCollapsed, aggregateFull } from '../lib/board-verdict.js';

// board-verdict.test.js — the Board-of-Directors verdict engine (addresses
// adversarial finding F18-board). The board has TWO modes and this lib is the
// deterministic, tested judge for each:
//
//   COLLAPSED board (default): ONE model call produces all 5 lenses in a single
//     JSON object. `parseCollapsed` validates that JSON against a strict
//     contract and normalizes it — malformed boards are REJECTED, never
//     silently accepted, so a broken/hallucinated board output can't sneak a
//     bogus verdict past the orchestrator.
//
//   FULL board (high-stakes only): 5 INDEPENDENT persona assessments each cast
//     an approve/reject vote. `aggregateFull` applies the fixed board rule over
//     the vote array and returns the resolution enum. Deterministic tallying
//     lives in tested code, not in a prompt.
//
// The two modes are complementary: parseCollapsed guards the cheap default path;
// aggregateFull guards the expensive escalation path.

const LENSES = ['architect', 'product', 'security', 'operations', 'experience'];

/** A well-formed collapsed board object (5 lenses + overall). */
function goodCollapsed() {
  return {
    architect: { verdict: 'approve', score: 8, concerns: [] },
    product: { verdict: 'approve', score: 7, concerns: [] },
    security: { verdict: 'conditions', score: 6, concerns: ['add rate limiting'] },
    operations: { verdict: 'approve', score: 8, concerns: [] },
    experience: { verdict: 'approve', score: 9, concerns: [] },
    decision: 'APPROVED',
  };
}

// ===========================================================================
// parseCollapsed — validate + normalize the COLLAPSED-board JSON contract
// ===========================================================================

test('parseCollapsed accepts a well-formed object and returns a normalized verdict', () => {
  const out = parseCollapsed(goodCollapsed());
  // All 5 lenses survive, each with a verdict.
  for (const lens of LENSES) {
    assert.ok(out[lens], `lens ${lens} must be present`);
    assert.ok(
      ['approve', 'reject', 'conditions'].includes(out[lens].verdict),
      `lens ${lens} verdict must be a valid enum`,
    );
  }
  // The overall decision is carried through.
  assert.equal(out.decision, 'APPROVED');
});

test('parseCollapsed accepts a JSON STRING (not just an object)', () => {
  const out = parseCollapsed(JSON.stringify(goodCollapsed()));
  assert.equal(out.architect.verdict, 'approve');
  assert.equal(out.decision, 'APPROVED');
});

test('parseCollapsed carries score and concerns through when present', () => {
  const out = parseCollapsed(goodCollapsed());
  assert.equal(out.security.score, 6);
  assert.deepEqual(out.security.concerns, ['add rate limiting']);
});

test('parseCollapsed allows a lens with only a verdict (score/concerns optional)', () => {
  const board = goodCollapsed();
  board.architect = { verdict: 'reject' };
  const out = parseCollapsed(board);
  assert.equal(out.architect.verdict, 'reject');
});

// --- REJECTIONS ------------------------------------------------------------

test('parseCollapsed REJECTS a non-object / non-JSON-string input', () => {
  assert.throws(() => parseCollapsed(42), /object|json|invalid/i);
  assert.throws(() => parseCollapsed(null), /object|json|invalid/i);
  assert.throws(() => parseCollapsed('not json at all {{{'), /json|parse|invalid/i);
});

test('parseCollapsed REJECTS when a lens is missing', () => {
  const board = goodCollapsed();
  delete board.security;
  assert.throws(() => parseCollapsed(board), /security|lens|missing/i);
});

test('parseCollapsed REJECTS a bad verdict enum on a lens', () => {
  const board = goodCollapsed();
  board.product.verdict = 'maybe';
  assert.throws(() => parseCollapsed(board), /verdict|enum|product/i);
});

test('parseCollapsed REJECTS when a lens is not an object', () => {
  const board = goodCollapsed();
  board.operations = 'approve';
  assert.throws(() => parseCollapsed(board), /operations|object|lens/i);
});

test('parseCollapsed REJECTS when the overall decision is missing', () => {
  const board = goodCollapsed();
  delete board.decision;
  assert.throws(() => parseCollapsed(board), /decision|overall/i);
});

// ===========================================================================
// aggregateFull — full-board voting rule over an array of approve/reject votes
// ===========================================================================
//
// Rule:
//   >= 4 approve            -> APPROVED
//   exactly 3 approve       -> APPROVED_WITH_REVIEW
//   >= 3 reject             -> REJECTED
//   else                    -> ESCALATE
//
// With 5 directors each voting approve|reject, the boundaries are:
//   5-0 -> APPROVED
//   4-1 -> APPROVED
//   3-2 -> APPROVED_WITH_REVIEW
//   2-3 -> REJECTED
//   0-5 -> REJECTED

function votes(nApprove, nReject) {
  return [
    ...Array(nApprove).fill({ verdict: 'approve' }),
    ...Array(nReject).fill({ verdict: 'reject' }),
  ];
}

test('aggregateFull: 5-0 -> APPROVED', () => {
  assert.equal(aggregateFull(votes(5, 0)), 'APPROVED');
});

test('aggregateFull: 4-1 -> APPROVED', () => {
  assert.equal(aggregateFull(votes(4, 1)), 'APPROVED');
});

test('aggregateFull: 3-2 -> APPROVED_WITH_REVIEW', () => {
  assert.equal(aggregateFull(votes(3, 2)), 'APPROVED_WITH_REVIEW');
});

test('aggregateFull: 2-3 -> REJECTED', () => {
  assert.equal(aggregateFull(votes(2, 3)), 'REJECTED');
});

test('aggregateFull: 0-5 -> REJECTED', () => {
  assert.equal(aggregateFull(votes(0, 5)), 'REJECTED');
});

test('aggregateFull accepts bare-string votes too ("approve"/"reject")', () => {
  assert.equal(aggregateFull(['approve', 'approve', 'approve', 'approve', 'reject']), 'APPROVED');
});

test('aggregateFull rejects a non-array input', () => {
  assert.throws(() => aggregateFull('approve'), /array/i);
});
