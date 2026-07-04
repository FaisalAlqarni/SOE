/**
 * lib/board-verdict.js — the Board-of-Directors verdict engine
 * (addresses adversarial finding F18-board).
 *
 * The board evaluates high-consequence proposals through 5 expert lenses
 * (architect, product, security, operations, experience). It runs in one of two
 * modes, and this module is the deterministic, tested judge for each — the
 * verdict math lives in real code, NOT in a prompt:
 *
 *   COLLAPSED board (the DEFAULT, cheap path): a SINGLE model call emits all 5
 *     lenses plus an overall decision as one JSON object. `parseCollapsed`
 *     validates that JSON against a strict contract and normalizes it. A board
 *     output that is malformed — missing a lens, carrying a bogus verdict enum,
 *     or not even an object — is REJECTED (throws), so a broken or hallucinated
 *     board result can never silently pass a bogus verdict to the orchestrator.
 *
 *   FULL board (high-stakes ESCALATION path only): 5 INDEPENDENT persona
 *     assessments each cast an approve/reject vote. `aggregateFull` applies the
 *     fixed board rule over the vote array and returns the resolution enum.
 *
 * This module is PURE (no fs, no I/O) so it is unit-testable in isolation; the
 * caller owns dispatch and persistence.
 */

/** The 5 board lenses, in canonical order. */
export const LENSES = Object.freeze([
  'architect',
  'product',
  'security',
  'operations',
  'experience',
]);

/** The only verdict values a lens may carry. */
const LENS_VERDICTS = new Set(['approve', 'reject', 'conditions']);

/** The only per-director votes the full board accepts. */
const FULL_VOTES = new Set(['approve', 'reject']);

/**
 * Validate + normalize a COLLAPSED-board result.
 *
 * Accepts either a plain object or a JSON string. Enforces the contract:
 *   - the input parses to a plain object;
 *   - every one of the 5 LENSES is present and is itself an object;
 *   - each lens carries `verdict` ∈ {approve, reject, conditions};
 *   - `score` and `concerns` are optional and passed through when present;
 *   - a top-level overall `decision` is present.
 * Anything else THROWS.
 *
 * @param {object|string} input - The collapsed board (object or JSON string).
 * @returns {{ [lens: string]: { verdict: string, score?: number, concerns?: any }, decision: any }}
 *   A normalized verdict object.
 * @throws {Error} If the input violates the contract.
 */
export function parseCollapsed(input) {
  let board = input;

  if (typeof board === 'string') {
    try {
      board = JSON.parse(board);
    } catch (err) {
      throw new Error(`parseCollapsed: input is not valid JSON: ${err.message}`);
    }
  }

  if (board === null || typeof board !== 'object' || Array.isArray(board)) {
    throw new Error('parseCollapsed: input must be an object or a JSON object string');
  }

  const out = {};

  for (const lens of LENSES) {
    const entry = board[lens];
    if (entry === undefined || entry === null) {
      throw new Error(`parseCollapsed: missing lens '${lens}'`);
    }
    if (typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`parseCollapsed: lens '${lens}' must be an object`);
    }
    if (!LENS_VERDICTS.has(entry.verdict)) {
      throw new Error(
        `parseCollapsed: lens '${lens}' has invalid verdict '${entry.verdict}' ` +
          `(must be one of ${[...LENS_VERDICTS].join('/')})`,
      );
    }

    const norm = { verdict: entry.verdict };
    if (entry.score !== undefined) norm.score = entry.score;
    if (entry.concerns !== undefined) norm.concerns = entry.concerns;
    out[lens] = norm;
  }

  if (board.decision === undefined || board.decision === null) {
    throw new Error("parseCollapsed: missing overall 'decision'");
  }
  out.decision = board.decision;

  return out;
}

/**
 * Aggregate a FULL-board vote array into the board resolution enum.
 *
 * Each element is either a bare string ('approve'|'reject') or an object with a
 * `verdict` of the same. The rule (halt semantics for the escalation path):
 *   - >= 4 approve       -> 'APPROVED'
 *   - exactly 3 approve  -> 'APPROVED_WITH_REVIEW'
 *   - >= 3 reject        -> 'REJECTED'
 *   - otherwise          -> 'ESCALATE'
 *
 * @param {Array<string|{verdict: string}>} voteList - Per-director votes.
 * @returns {'APPROVED'|'APPROVED_WITH_REVIEW'|'REJECTED'|'ESCALATE'}
 * @throws {Error} If the input is not an array or a vote is invalid.
 */
export function aggregateFull(voteList) {
  if (!Array.isArray(voteList)) {
    throw new Error('aggregateFull: votes must be an array');
  }

  let approve = 0;
  let reject = 0;

  for (const raw of voteList) {
    const v = typeof raw === 'string' ? raw : raw && raw.verdict;
    if (!FULL_VOTES.has(v)) {
      throw new Error(
        `aggregateFull: invalid vote '${v}' (must be one of ${[...FULL_VOTES].join('/')})`,
      );
    }
    if (v === 'approve') approve++;
    else reject++;
  }

  if (approve >= 4) return 'APPROVED';
  if (approve === 3) return 'APPROVED_WITH_REVIEW';
  if (reject >= 3) return 'REJECTED';
  return 'ESCALATE';
}
