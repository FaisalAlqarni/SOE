/**
 * lib/board-gate.js — normalize either board mode into ONE decision enum.
 *
 * COLLAPSED (default): derive the class from the LENS verdicts deterministically
 * (the collapsed board's top-level `decision` is a free-form passthrough and is
 * NOT trusted). FULL (escalation): aggregateFull already returns the enum.
 */
import { parseCollapsed, aggregateFull, LENSES } from './board-verdict.js';

/**
 * @param {object|string|Array} input - collapsed board (object/JSON) or full vote array.
 * @param {'collapsed'|'full'} [mode='collapsed']
 * @returns {'APPROVED'|'APPROVED_WITH_REVIEW'|'REJECTED'|'ESCALATE'}
 */
export function boardDecision(input, mode = 'collapsed') {
  if (mode === 'full') return aggregateFull(input);
  const board = parseCollapsed(input); // throws on malformed
  const verdicts = LENSES.map((l) => board[l].verdict);
  if (verdicts.includes('reject')) return 'REJECTED';
  if (verdicts.includes('conditions')) return 'APPROVED_WITH_REVIEW';
  return 'APPROVED';
}
