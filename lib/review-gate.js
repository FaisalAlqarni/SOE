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
import { parseVerdict } from './review-verdict.js';

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
