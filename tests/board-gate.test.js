import { test } from 'node:test';
import assert from 'node:assert';
import { boardDecision } from '../lib/board-gate.js';

const collapsed = (verdicts) => {
  const b = { decision: 'whatever-freeform' };
  for (const [lens, v] of Object.entries(verdicts)) b[lens] = { verdict: v };
  return b;
};
const allApprove = { architect: 'approve', product: 'approve', security: 'approve', operations: 'approve', experience: 'approve' };

test('collapsed: all approve => APPROVED', () => {
  assert.equal(boardDecision(collapsed(allApprove)), 'APPROVED');
});
test('collapsed: any reject => REJECTED (overrides conditions)', () => {
  assert.equal(boardDecision(collapsed({ ...allApprove, security: 'reject', product: 'conditions' })), 'REJECTED');
});
test('collapsed: any conditions (no reject) => APPROVED_WITH_REVIEW', () => {
  assert.equal(boardDecision(collapsed({ ...allApprove, product: 'conditions' })), 'APPROVED_WITH_REVIEW');
});
test('collapsed: does NOT trust the free-form decision field', () => {
  const b = collapsed(allApprove); b.decision = 'REJECTED';
  assert.equal(boardDecision(b), 'APPROVED'); // derived from lenses, not the field
});
test('collapsed: malformed board throws (delegated to parseCollapsed)', () => {
  assert.throws(() => boardDecision({ architect: { verdict: 'approve' } }));
});
test('full: passes aggregateFull through — 4 approve => APPROVED', () => {
  assert.equal(boardDecision(['approve','approve','approve','approve'], 'full'), 'APPROVED');
});
test('full: 3 approve 1 reject => APPROVED_WITH_REVIEW', () => {
  assert.equal(boardDecision(['approve','approve','approve','reject'], 'full'), 'APPROVED_WITH_REVIEW');
});
test('full: 3 reject => REJECTED', () => {
  assert.equal(boardDecision(['reject','reject','reject','approve'], 'full'), 'REJECTED');
});
test('full: 2-2 split => ESCALATE', () => {
  assert.equal(boardDecision(['approve','approve','reject','reject'], 'full'), 'ESCALATE');
});
