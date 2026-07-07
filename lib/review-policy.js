/**
 * lib/review-policy.js — the deterministic required-reviews-per-tier policy.
 *
 * Pure, no fs/I/O. Uses the REAL risk-matrix tier vocabulary (lib/risk-matrix.js
 * `TIERS`): 'trivial' | 'standard' | 'full'. The base review lens set widens
 * with tier, and 'database'/'logging' lenses are appended at standard+ when the
 * change touches SQL or logging respectively (never at trivial).
 */

/** Base required-review lenses per tier, before conditional appends. */
const BASE_REVIEWS = Object.freeze({
  trivial: Object.freeze([]),
  standard: Object.freeze(['code']),
  full: Object.freeze(['code', 'security']),
});

/**
 * Compute the required review lenses for a given risk tier.
 *
 * @param {'trivial'|'standard'|'full'} tier
 * @param {{ touchesSql?: boolean, touchesLogging?: boolean }} [opts]
 * @returns {string[]} Required review lenses, in stable order.
 * @throws {Error} If `tier` is not a known tier.
 */
export function requiredReviews(tier, { touchesSql = false, touchesLogging = false } = {}) {
  if (!Object.prototype.hasOwnProperty.call(BASE_REVIEWS, tier)) {
    throw new Error(`requiredReviews: unknown tier '${tier}'`);
  }

  const reviews = [...BASE_REVIEWS[tier]];

  if (tier !== 'trivial') {
    if (touchesSql) reviews.push('database');
    if (touchesLogging) reviews.push('logging');
  }

  return reviews;
}
