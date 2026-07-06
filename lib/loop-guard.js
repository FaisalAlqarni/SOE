/**
 * lib/loop-guard.js — bounded-loop enforcement for the Evaluate-Loop
 * (addresses adversarial finding F9).
 *
 * The Evaluate-Loop must never spin forever. Two independent counters bound it:
 *   - fix cycles       — capped at max_fix_cycles     (default 5)
 *   - plan revisions    — capped at max_plan_revisions (default 3)
 *
 * These caps are a CORE INTEGRITY GUARANTEE, so they are real, tested, counter-
 * backed code — not prose in a skill. The counters live under `state.loop_state`
 * (`fix_cycle_count`, `plan_revision_count`) so the orchestrator can persist them
 * atomically via lib/state.js. This module is deliberately PURE over the passed
 * state object and does NO fs — it is unit-testable in isolation and the caller
 * owns persistence.
 *
 * CAP SEMANTICS — "halt AT the cap" (count-then-compare):
 *   incFix() increments the counter FIRST, then compares. It returns
 *   `{ halt:false, count }` while `count < max`, and
 *   `{ halt:true, reason:'fix-cap', count }` once `count >= max`.
 *   With the default cap of 5, calls 1..4 return halt:false and the 5th call
 *   returns halt:true. The Nth cycle is the LAST permitted one and the guard
 *   flags halt ON it, so the orchestrator runs at most N cycles before stopping.
 *   Once at/over the cap the guard keeps returning halt:true (it never resets
 *   itself). incPlanRevision() behaves identically against max_plan_revisions
 *   with reason 'plan-cap'.
 *
 * Cap resolution order (first defined wins):
 *   1. the explicit config arg          — e.g. incFix(state, { maxFixCycles })
 *   2. state.config (from .soe/config.json) — max_fix_cycles / max_plan_revisions
 *   3. the built-in default             — 5 / 3
 */

/** Default cap on Evaluate-Loop fix cycles. */
export const DEFAULT_MAX_FIX_CYCLES = 5;
/** Default cap on plan revisions. */
export const DEFAULT_MAX_PLAN_REVISIONS = 3;
/** Default cap on Board reject/escalate cycles for a single track. */
export const DEFAULT_MAX_BOARD_REJECTS = 3;

/** Ensure `state.loop_state` exists and return it. */
function loopState(state) {
  if (!state.loop_state || typeof state.loop_state !== 'object') {
    state.loop_state = {};
  }
  return state.loop_state;
}

/**
 * Resolve a cap from (1) the explicit config arg, (2) state.config, (3) default.
 *
 * @param {number|undefined} argValue - Cap from the config arg (may be undefined).
 * @param {object} state - The state object (may carry state.config).
 * @param {string} configKey - Snake-case key on state.config (e.g. 'max_fix_cycles').
 * @param {number} fallback - Built-in default.
 * @returns {number} The resolved cap.
 */
function resolveCap(argValue, state, configKey, fallback) {
  if (typeof argValue === 'number') return argValue;
  const fromState = state.config && state.config[configKey];
  if (typeof fromState === 'number') return fromState;
  return fallback;
}

/**
 * Record that a fix cycle is being consumed and report whether the loop must halt.
 *
 * @param {object} state - The orchestration state (mutated in place).
 * @param {{ maxFixCycles?: number }} [config] - Optional explicit cap override.
 * @returns {{ halt: boolean, count: number, reason?: 'fix-cap' }}
 *   `count` is the new fix_cycle_count. `halt` is true once count >= the cap,
 *   in which case `reason` is 'fix-cap'.
 */
export function incFix(state, config = {}) {
  const ls = loopState(state);
  const cap = resolveCap(config.maxFixCycles, state, 'max_fix_cycles', DEFAULT_MAX_FIX_CYCLES);
  ls.fix_cycle_count = (ls.fix_cycle_count || 0) + 1;
  const count = ls.fix_cycle_count;
  if (count >= cap) return { halt: true, reason: 'fix-cap', count };
  return { halt: false, count };
}

/**
 * Record that a plan revision is being consumed and report whether to halt.
 *
 * @param {object} state - The orchestration state (mutated in place).
 * @param {{ maxPlanRevisions?: number }} [config] - Optional explicit cap override.
 * @returns {{ halt: boolean, count: number, reason?: 'plan-cap' }}
 */
export function incPlanRevision(state, config = {}) {
  const ls = loopState(state);
  const cap = resolveCap(
    config.maxPlanRevisions,
    state,
    'max_plan_revisions',
    DEFAULT_MAX_PLAN_REVISIONS,
  );
  ls.plan_revision_count = (ls.plan_revision_count || 0) + 1;
  const count = ls.plan_revision_count;
  if (count >= cap) return { halt: true, reason: 'plan-cap', count };
  return { halt: false, count };
}

/**
 * Record that the Board rejected/escalated a track and report whether to halt.
 *
 * @param {object} state - The orchestration state (mutated in place).
 * @param {{ maxBoardRejects?: number }} [config] - Optional explicit cap override.
 * @returns {{ halt: boolean, count: number, reason?: 'board-reject-cap' }}
 */
export function incBoardReject(state, config = {}) {
  const ls = loopState(state);
  const cap = resolveCap(
    config.maxBoardRejects,
    state,
    'max_board_rejects',
    DEFAULT_MAX_BOARD_REJECTS,
  );
  ls.board_reject_count = (ls.board_reject_count || 0) + 1;
  const count = ls.board_reject_count;
  if (count >= cap) return { halt: true, reason: 'board-reject-cap', count };
  return { halt: false, count };
}

/**
 * Reset the fix-cycle counter to 0 — call when moving to a new task/phase so a
 * fresh bounded run of fix cycles is permitted. Leaves the plan counter alone.
 *
 * @param {object} state - The orchestration state (mutated in place).
 * @returns {object} The same state object.
 */
export function resetFix(state) {
  loopState(state).fix_cycle_count = 0;
  return state;
}

/**
 * Reset the plan-revision counter to 0. Leaves the fix counter alone.
 *
 * @param {object} state - The orchestration state (mutated in place).
 * @returns {object} The same state object.
 */
export function resetPlanRevision(state) {
  loopState(state).plan_revision_count = 0;
  return state;
}
