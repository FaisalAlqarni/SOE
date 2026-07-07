/**
 * lib/review-verdict.js — FAIL-CLOSED parser for the machine review header.
 *
 * A review report carries a machine-readable header:
 *   LENS: <lens>
 *   REVIEWER: <reviewer>
 *   VERDICT: PASS|FAIL
 *   BLOCKING: <n>
 *
 * Pure, no fs/I/O. The verdict is 'FAIL' if ANY of the following holds:
 *   - the header says VERDICT: FAIL
 *   - BLOCKING > 0   (the reviewer's DELIBERATE machine count of blocking findings)
 * If no VERDICT: line is found at all, the report is unparseable — and an
 * unreadable review is NOT a pass, so it FAILS closed with reason 'unparseable'.
 *
 * NOTE: we deliberately do NOT scan the free-text body for words like
 * "CRITICAL" — a clean report that says "no critical issues found" would be
 * force-failed. Criticality is signalled ONLY via the machine `BLOCKING:` count,
 * which the reviewer sets on purpose.
 */

const LENS_RE = /^LENS:\s*(.+)$/im;
const REVIEWER_RE = /^REVIEWER:\s*(.+)$/im;
const VERDICT_RE = /^VERDICT:\s*(PASS|FAIL)\b/im;
const BLOCKING_RE = /^BLOCKING:\s*(\d+)/im;

/**
 * Parse a review report's machine header into a normalized verdict.
 *
 * @param {string} text - The full review report text.
 * @returns {{ lens?: string, reviewer?: string, verdict: 'PASS'|'FAIL', blocking: number, reason?: string }}
 */
export function parseVerdict(text) {
  const str = typeof text === 'string' ? text : '';

  const verdictMatch = VERDICT_RE.exec(str);
  if (!verdictMatch) {
    // No VERDICT: line at all — unreadable review is NOT a pass.
    return { verdict: 'FAIL', blocking: 0, reason: 'unparseable' };
  }

  const lensMatch = LENS_RE.exec(str);
  const reviewerMatch = REVIEWER_RE.exec(str);
  const blockingMatch = BLOCKING_RE.exec(str);

  const blocking = blockingMatch ? Number(blockingMatch[1]) : 0;
  const headerSaysFail = verdictMatch[1].toUpperCase() === 'FAIL';

  const verdict = headerSaysFail || blocking > 0 ? 'FAIL' : 'PASS';

  const out = { verdict, blocking };
  if (lensMatch) out.lens = lensMatch[1].trim();
  if (reviewerMatch) out.reviewer = reviewerMatch[1].trim();

  return out;
}
