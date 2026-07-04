/**
 * lib/scrutiny.js — routed, fail-safe scrutiny selection
 * (design §4 fail-safe scrutiny, resolutions F7 and F16).
 *
 * This module is the ONE sanctioned path for ceremony right-sizing. Every
 * decision about how much scrutiny a change gets — which board mode to run, how
 * thorough the review must be — is routed through `lib/risk-matrix.js`, the
 * deterministic risk FLOOR. Because right-sizing can only ever LOWER ceremony,
 * routing it through the floor is what guarantees a downscope can never bypass
 * the rule-based safety net: the floor is computed first, the (optional)
 * graphify blast-radius signal and the LLM classifier hint may only RAISE it,
 * and the final tier is therefore always >= the deterministic floor.
 *
 * It also makes downscoping AUDITABLE: every selection that is not full
 * scrutiny is logged, so the decision log can be inspected after the fact.
 *
 * ------------------------------------------------------------------------
 * DOWNSCOPE-LOGGING RULE (exactly as implemented):
 *
 *   A downscope entry is logged whenever the FINAL tier is NOT 'full' — i.e.
 *   whenever the run is NOT getting full scrutiny. Any tier below 'full'
 *   ('trivial' or 'standard') means the change is being handled with less than
 *   the maximum ceremony, so it is recorded for audit. A 'full' selection is
 *   never logged: it is the safe, non-downscoped outcome and there is nothing
 *   to audit. `logger` is called at most once per `selectScrutiny` call with a
 *   single structured record; a null/undefined logger is tolerated silently.
 * ------------------------------------------------------------------------
 *
 * This module owns routing + logging ONLY. It does NOT reimplement any risk
 * logic: `classify`, `applyClassifierHint`, and `blastRadius` are imported from
 * `./risk-matrix.js` and are the single source of truth for "how risky".
 */

import { classify, applyClassifierHint, blastRadius } from './risk-matrix.js';

/**
 * Map a resolved risk tier to a board mode + whether a thorough review is
 * required. `full` is the only tier that runs the full (multi-agent) board and
 * a thorough review; everything below it runs the cheap collapsed board.
 * @param {'trivial'|'standard'|'full'} tier
 * @returns {{ board: 'collapsed'|'full', thoroughReview: boolean }}
 */
function tierToBoard(tier) {
  if (tier === 'full') {
    return { board: 'full', thoroughReview: true };
  }
  // 'trivial' and 'standard' both collapse.
  return { board: 'collapsed', thoroughReview: false };
}

/**
 * Build the list of changed file paths from any accepted diff shape, purely for
 * the graphify blast-radius query and the audit summary. Never throws — a diff
 * that `classify` would reject is handled by `classify` itself upstream.
 * @param {object|string} diff
 * @returns {string[]}
 */
function filePathsOf(diff) {
  if (diff && typeof diff === 'object' && Array.isArray(diff.files)) {
    return diff.files
      .filter((f) => f && typeof f.path === 'string')
      .map((f) => f.path);
  }
  if (typeof diff === 'string') {
    const paths = [];
    for (const line of diff.split('\n')) {
      if (line.startsWith('+++ ')) {
        const raw = line.slice(4).trim().replace(/^b\//, '');
        if (raw && raw !== '/dev/null') paths.push(raw);
      }
    }
    return paths;
  }
  return [];
}

/**
 * A short human-readable summary of the changed files, for the audit record.
 * @param {string[]} paths
 * @returns {string}
 */
function summarize(paths) {
  if (paths.length === 0) return '(no files)';
  const head = paths.slice(0, 5).join(', ');
  const more = paths.length > 5 ? ` (+${paths.length - 5} more)` : '';
  return `${paths.length} file(s): ${head}${more}`;
}

/**
 * Select the scrutiny level for a change, routing the decision through the
 * deterministic risk matrix and logging every non-full (downscoped) outcome.
 *
 * Order of operations (raise-only after the floor):
 *   1. `classify(diff)` → the deterministic risk FLOOR + markers.
 *   2. If a `graphify` provider is given, merge its blast-radius signal via
 *      `applyClassifierHint` (raise-only) — a large/security-path reach lifts
 *      the tier to 'full'.
 *   3. Apply the LLM `classifierHint` via `applyClassifierHint` (raise-only) —
 *      it can lift the tier but NEVER lower it below the floor.
 *   4. Map tier → board: 'full' → full board + thorough review; 'trivial'/
 *      'standard' → collapsed board.
 *   5. If the final tier is NOT 'full', log one structured downscope record.
 *
 * @param {object|string} diff - Structured `{ files }` or a unified-diff string.
 * @param {'trivial'|'standard'|'full'|null|undefined} classifierHint - LLM hint (raise-only).
 * @param {((record: object) => void)|null|undefined} logger - Sink for downscope audit records.
 * @param {{ graphify?: object|null }} [opts]
 * @returns {{ tier: 'trivial'|'standard'|'full', board: 'collapsed'|'full' }}
 * @throws {Error} Propagates `classify`/`applyClassifierHint` validation errors.
 */
export function selectScrutiny(diff, classifierHint, logger, { graphify } = {}) {
  // (1) Deterministic floor — the single source of truth for "how risky".
  const { tier: floor, markers } = classify(diff);
  let tier = floor;

  // (2) Optional graphify blast-radius, merged raise-only.
  const paths = filePathsOf(diff);
  const blast = blastRadius(paths, graphify);
  if (blast && blast.raiseTo) {
    tier = applyClassifierHint(tier, blast.raiseTo);
  }

  // (3) LLM classifier hint, merged raise-only — can never lower the floor.
  tier = applyClassifierHint(tier, classifierHint);

  // (4) Tier → board mode.
  const { board, thoroughReview } = tierToBoard(tier);

  // (5) Log every non-full (downscoped) decision for audit.
  if (tier !== 'full' && typeof logger === 'function') {
    logger({
      event: 'scrutiny-downscope',
      downscope: true,
      tier,
      board,
      thoroughReview,
      floor,
      markers,
      blastRadius: blast ? blast.reason : null,
      classifierHint: classifierHint ?? null,
      summary: summarize(paths),
    });
  }

  return { tier, board };
}
