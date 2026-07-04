import { test } from 'node:test';
import assert from 'node:assert';

import {
  incFix,
  incPlanRevision,
  resetFix,
  resetPlanRevision,
  DEFAULT_MAX_FIX_CYCLES,
  DEFAULT_MAX_PLAN_REVISIONS,
} from '../lib/loop-guard.js';

// loop-guard.test.js — the Evaluate-Loop MUST be bounded (addresses adversarial
// finding F9). Fix cycles and plan revisions each have a hard cap; once the cap
// is reached the guard signals halt so the orchestrator stops looping.
//
// CAP SEMANTICS (halt AT the cap — "count-then-compare"):
//   incFix increments state.loop_state.fix_cycle_count FIRST, then compares.
//   It returns { halt:false, count } while count < maxFixCycles, and
//   { halt:true, reason:'fix-cap', count } once count >= maxFixCycles.
//   So with the default cap of 5: the 1st..4th calls return halt:false and the
//   5th call returns halt:true. The Nth cycle is the last permitted one and the
//   guard flags halt ON it, so no more than N cycles ever run.
//   incPlanRevision is identical against maxPlanRevisions (default 3),
//   reason 'plan-cap'. Counters are pure over the passed state object and live
//   under state.loop_state; the orchestrator persists state via state.js.

/** A fresh state object for each test (mirrors the orchestrator's state). */
function freshState() {
  return {};
}

// --- (a) incFix increments, halts AT the cap ----------------------------------

test('(a) incFix increments the fix-cycle counter and halts at the default cap (5)', () => {
  const state = freshState();

  // Calls 1..4 are under the cap.
  for (let i = 1; i <= DEFAULT_MAX_FIX_CYCLES - 1; i++) {
    const r = incFix(state);
    assert.equal(r.halt, false, `call ${i} should be under the cap`);
    assert.equal(r.count, i, `count should be ${i}`);
    assert.equal(state.loop_state.fix_cycle_count, i, 'counter persists in state');
  }

  // The 5th (Nth) call reaches the cap → halt.
  const capped = incFix(state);
  assert.equal(capped.halt, true, 'the 5th fix cycle reaches the cap → halt');
  assert.equal(capped.reason, 'fix-cap');
  assert.equal(capped.count, DEFAULT_MAX_FIX_CYCLES);
  assert.equal(state.loop_state.fix_cycle_count, DEFAULT_MAX_FIX_CYCLES);
});

test('(a) incFix keeps halting past the cap and the counter keeps climbing', () => {
  const state = freshState();
  let last;
  for (let i = 0; i < DEFAULT_MAX_FIX_CYCLES + 2; i++) last = incFix(state);
  assert.equal(last.halt, true);
  assert.equal(last.reason, 'fix-cap');
  assert.equal(state.loop_state.fix_cycle_count, DEFAULT_MAX_FIX_CYCLES + 2);
});

// --- (b) incPlanRevision — same behavior, plan-cap (default 3) -----------------

test('(b) incPlanRevision increments and halts at the default cap (3) with reason plan-cap', () => {
  const state = freshState();

  for (let i = 1; i <= DEFAULT_MAX_PLAN_REVISIONS - 1; i++) {
    const r = incPlanRevision(state);
    assert.equal(r.halt, false, `plan revision ${i} should be under the cap`);
    assert.equal(r.count, i);
    assert.equal(state.loop_state.plan_revision_count, i);
  }

  const capped = incPlanRevision(state);
  assert.equal(capped.halt, true, 'the 3rd plan revision reaches the cap → halt');
  assert.equal(capped.reason, 'plan-cap');
  assert.equal(capped.count, DEFAULT_MAX_PLAN_REVISIONS);
  assert.equal(state.loop_state.plan_revision_count, DEFAULT_MAX_PLAN_REVISIONS);
});

// --- (c) Configurable caps ----------------------------------------------------

test('(c) a custom maxFixCycles halts sooner', () => {
  const state = freshState();
  const cfg = { maxFixCycles: 2 };

  const r1 = incFix(state, cfg);
  assert.deepEqual({ halt: r1.halt, count: r1.count }, { halt: false, count: 1 });

  const r2 = incFix(state, cfg);
  assert.equal(r2.halt, true, 'custom cap of 2 halts on the 2nd call');
  assert.equal(r2.reason, 'fix-cap');
  assert.equal(r2.count, 2);
});

test('(c) a custom maxPlanRevisions halts sooner', () => {
  const state = freshState();
  const cfg = { maxPlanRevisions: 1 };

  const r1 = incPlanRevision(state, cfg);
  assert.equal(r1.halt, true, 'custom cap of 1 halts on the very first revision');
  assert.equal(r1.reason, 'plan-cap');
  assert.equal(r1.count, 1);
});

test('(c) caps can also be supplied on state.config (read from .soe/config.json)', () => {
  const state = { config: { max_fix_cycles: 2, max_plan_revisions: 1 } };

  assert.equal(incFix(state).halt, false, 'fix call 1 under state.config cap of 2');
  assert.equal(incFix(state).halt, true, 'fix call 2 hits state.config cap of 2');

  assert.equal(incPlanRevision(state).halt, true, 'plan call 1 hits state.config cap of 1');
});

test('(c) an explicit config arg overrides state.config', () => {
  const state = { config: { max_fix_cycles: 2 } };
  // Explicit arg says cap 4, so call 2 (which would hit the state.config cap of
  // 2) must NOT halt — the arg wins.
  assert.equal(incFix(state, { maxFixCycles: 4 }).halt, false);
  assert.equal(incFix(state, { maxFixCycles: 4 }).halt, false);
  assert.equal(incFix(state, { maxFixCycles: 4 }).halt, false);
  assert.equal(incFix(state, { maxFixCycles: 4 }).halt, true, 'halts at the arg cap of 4');
});

// --- (d) Counters are independent and persist across calls --------------------

test('(d) incrementing fix does not affect the plan-revision counter (independent)', () => {
  const state = freshState();

  incFix(state);
  incFix(state);
  incFix(state);
  assert.equal(state.loop_state.fix_cycle_count, 3);
  assert.equal(state.loop_state.plan_revision_count ?? 0, 0, 'plan counter untouched by incFix');

  incPlanRevision(state);
  assert.equal(state.loop_state.plan_revision_count, 1);
  assert.equal(state.loop_state.fix_cycle_count, 3, 'fix counter untouched by incPlanRevision');
});

test('(d) exactly 5 fix cycles are allowed: calls 1-4 pass, call 5 halts (off-by-one nailed)', () => {
  const state = freshState();
  const results = [];
  for (let i = 0; i < 5; i++) results.push(incFix(state).halt);
  // halts on the 5th (index 4), not the 6th — halt AT the cap, not exceed-the-cap.
  assert.deepEqual(results, [false, false, false, false, true]);
  assert.equal(state.loop_state.fix_cycle_count, 5, 'counter persisted across all 5 calls');
});

// --- (e) reset helpers --------------------------------------------------------

test('(e) resetFix zeroes the fix counter (new task/phase) and re-allows a full run', () => {
  const state = freshState();
  for (let i = 0; i < DEFAULT_MAX_FIX_CYCLES; i++) incFix(state);
  assert.equal(state.loop_state.fix_cycle_count, DEFAULT_MAX_FIX_CYCLES);

  resetFix(state);
  assert.equal(state.loop_state.fix_cycle_count, 0, 'fix counter reset to 0');

  // A fresh run is possible again, and the first call is under the cap.
  const r = incFix(state);
  assert.equal(r.halt, false);
  assert.equal(r.count, 1);
});

test('(e) resetFix does not touch the plan-revision counter and vice versa', () => {
  const state = freshState();
  incFix(state);
  incPlanRevision(state);
  incPlanRevision(state);

  resetFix(state);
  assert.equal(state.loop_state.fix_cycle_count, 0);
  assert.equal(state.loop_state.plan_revision_count, 2, 'plan counter untouched by resetFix');

  resetPlanRevision(state);
  assert.equal(state.loop_state.plan_revision_count, 0);
  assert.equal(state.loop_state.fix_cycle_count, 0, 'fix counter untouched by resetPlanRevision');
});

// --- purity -------------------------------------------------------------------

test('functions mutate and return the SAME state object (pure over state, no fs)', () => {
  const state = freshState();
  const before = state;
  incFix(state);
  incPlanRevision(state);
  resetFix(state);
  assert.strictEqual(state, before, 'operates in place on the passed state object');
  assert.ok(state.loop_state && typeof state.loop_state === 'object');
});
