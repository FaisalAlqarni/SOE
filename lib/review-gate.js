/**
 * lib/review-gate.js — pure completion auditor: every completed task must
 * carry a PASSING, non-self review for each lens its tier requires.
 *
 * Pure, no fs/I/O — everything is injected (dependency-injected fakes in
 * tests, real fs-backed providers in the caller). For each task in
 * `state.tasks` with `status === 'completed'`:
 *
 *   1. tier = tierOf(task); need = requiredReviews(tier, touchesOf(task))
 *   2. for each lens in need:
 *        - !hasReport(task.id, lens)          -> violation 'no-review'
 *        - parseVerdict(readReport(...)) FAIL -> violation 'review-failed'
 *        - report.reviewer === implementerOf(task) -> violation 'self-review'
 *   3. { ok: violations.length === 0, violations }
 */
import { existsSync } from 'node:fs';
import { parseVerdict } from './review-verdict.js';
import { requiredReviews } from './review-policy.js';

/**
 * @param {{ tasks: Array<{ id: string, status: string }> }} state
 * @param {object} deps
 * @param {(tier: string, touches: object) => string[]} deps.requiredReviews
 * @param {(taskId: string, lens: string) => string} deps.readReport
 * @param {(taskId: string, lens: string) => boolean} deps.hasReport
 * @param {(task: object) => string} deps.tierOf
 * @param {(task: object) => object} deps.touchesOf
 * @param {(task: object) => string} deps.implementerOf
 * @returns {{ ok: boolean, violations: Array<{ taskId: string, lens: string, kind: string, blocking?: number }> }}
 */
export function auditCompletions(
  state,
  { requiredReviews, readReport, hasReport, tierOf, touchesOf, implementerOf },
) {
  const violations = [];
  const tasks = (state && Array.isArray(state.tasks)) ? state.tasks : [];

  for (const task of tasks) {
    if (!task || task.status !== 'completed') continue;

    const tier = tierOf(task);
    const touches = touchesOf(task);
    const need = requiredReviews(tier, touches);

    for (const lens of need) {
      if (!hasReport(task.id, lens)) {
        violations.push({ taskId: task.id, lens, kind: 'no-review' });
        continue;
      }

      const report = readReport(task.id, lens);
      const parsed = parseVerdict(report);

      if (parsed.verdict === 'FAIL') {
        violations.push({ taskId: task.id, lens, kind: 'review-failed', blocking: parsed.blocking });
        continue;
      }

      if (parsed.reviewer === implementerOf(task)) {
        violations.push({ taskId: task.id, lens, kind: 'self-review' });
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * requireTrackLenses — the TRACK-level completion gate: a track cannot be
 * marked complete unless every review lens its tier requires (per
 * lib/review-policy.js `requiredReviews`) is present in `reviews`, PASSING,
 * on-disk, and non-self-reviewed. Pure — `fileExists` is injected (default
 * `fs.existsSync`) so this is unit-testable without touching the filesystem.
 *
 * @param {'trivial'|'standard'|'full'} tier
 * @param {Array<{ lens: string, agent?: string, verdict?: string, reportText?: string, report?: string }>} reviews
 * @param {object} [opts]
 * @param {(p: string) => boolean} [opts.fileExists] - Defaults to fs.existsSync.
 * @param {boolean} [opts.touchesSql]
 * @param {boolean} [opts.touchesLogging]
 * @param {string[]|object[]} [opts.implementers] - Track-level implementer agents.
 * @param {{ agent?: string }} [opts.implementer] - Single-author (legacy) implementer.
 * @returns {{ ok: boolean, violations: Array<{ lens: string, kind: string }> }}
 */
export function requireTrackLenses(tier, reviews, opts = {}) {
  const {
    fileExists = existsSync,
    touchesSql = false,
    touchesLogging = false,
    implementers,
    implementer,
  } = opts;

  const need = requiredReviews(tier, { touchesSql, touchesLogging });
  const list = Array.isArray(reviews) ? reviews : [];

  const implAgents = Array.isArray(implementers)
    ? implementers.map((a) => (typeof a === 'string' ? a : a && a.agent)).filter(Boolean)
    : implementer && implementer.agent
      ? [implementer.agent]
      : [];

  const violations = [];

  for (const lens of need) {
    const review = list.find((r) => r && r.lens === lens);
    if (!review) {
      violations.push({ lens, kind: 'missing' });
      continue;
    }

    let verdict = review.verdict;
    if (!verdict && review.reportText) {
      verdict = parseVerdict(review.reportText).verdict;
    }
    if (verdict !== 'PASS') {
      violations.push({ lens, kind: 'failed' });
      continue;
    }

    if (!review.report || !fileExists(review.report)) {
      violations.push({ lens, kind: 'dangling' });
      continue;
    }

    if (review.agent && implAgents.includes(review.agent)) {
      violations.push({ lens, kind: 'self-review' });
    }
  }

  return { ok: violations.length === 0, violations };
}
