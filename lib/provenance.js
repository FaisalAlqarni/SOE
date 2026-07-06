/**
 * lib/provenance.js — the completion gate + per-track provenance record (P2).
 *
 * This is the ACTUAL fix for the founding incident (an orchestrator that
 * self-certified a track and marked it COMPLETE with no independent review).
 * The gate is tested code that `completeTrack` (lib/state.js) calls BEFORE it
 * advances loop_state to COMPLETE — so a track cannot reach COMPLETE unless its
 * provenance proves an independent, non-author evaluator actually reviewed it and
 * left an artifact on disk. (Per-task `markTaskComplete` is intentionally ungated;
 * enforcement is track-level via `completeTrack`.)
 *
 * HONEST SCOPE (see the v5 design "Honest Limits"): a plugin CANNOT
 * cryptographically stop a malicious orchestrator that fabricates the whole
 * record — the gate and the orchestrator share a trust boundary. What this DOES
 * enforce is the real incident class: a *degraded/forgetful* orchestrator that
 * skipped the review. The gate requires (a) a distinct evaluator agent
 * (non-author), (b) a PASS verdict, and (c) an evaluator report handle that
 * actually EXISTS ON DISK — so a task marked done with no review, or "reviewed"
 * by the implementer itself, or with a dangling report handle, is REJECTED.
 *
 * PURE + INJECTABLE: `fileExists` is injected (default `fs.existsSync`) so the
 * gate is unit-testable without touching the filesystem — same pattern as
 * lib/resume.js injecting its git runner.
 *
 * A record shape (verdicts + handles only — NEVER findings prose; that would
 * pierce the F5 context firewall and bloat state.json):
 *   {
 *     implementer:  { agent, model?, commit? },       // single-author (legacy), OR
 *     implementers: [ "agent", ... ],                 // track-level: the workers that ran
 *     tests?:       { ran?, summary? },
 *     evaluator:    { agent, model?, verdict: "PASS"|"FAIL", report },  // report = on-disk handle
 *     board?:       { decision, tier },               // full-tier board gate (see completeTrack)
 *     reviews?:     [ { agent, verdict, findings_count?, report? }, ... ],
 *   }
 */

import { existsSync } from 'node:fs';

/** The only verdict that permits completion. FAIL routes to the fixer, never here. */
const PASS = 'PASS';

/**
 * Evaluate the completion invariant WITHOUT throwing. Returns `{ ok, reason }`.
 * `ok:true` ⇔ the track may be marked complete. The non-throwing sibling of
 * `gate` (used where a boolean is wanted instead of an integrity throw).
 *
 * @param {object|null|undefined} record - the provenance record.
 * @param {{ fileExists?: (p: string) => boolean }} [opts]
 * @returns {{ ok: boolean, reason?: string }}
 */
export function check(record, { fileExists = existsSync } = {}) {
  if (!record || typeof record !== 'object') {
    return { ok: false, reason: 'provenance: missing record' };
  }
  const ev = record.evaluator;
  if (!ev || typeof ev !== 'object') {
    return { ok: false, reason: 'provenance: no evaluator (task was not independently reviewed)' };
  }
  if (!ev.agent) {
    return { ok: false, reason: 'provenance: evaluator.agent missing' };
  }
  // Non-author test. Accept a single `implementer.agent` (legacy) OR an
  // `implementers` array (track-level: many workers, one independent evaluator).
  const implAgents = Array.isArray(record.implementers)
    ? record.implementers.map((a) => (typeof a === 'string' ? a : a && a.agent)).filter(Boolean)
    : record.implementer && record.implementer.agent
      ? [record.implementer.agent]
      : [];
  if (implAgents.length === 0) {
    return { ok: false, reason: 'provenance: no implementer recorded (cannot verify non-author review)' };
  }
  if (implAgents.includes(ev.agent)) {
    return {
      ok: false,
      reason: `provenance: self-review — evaluator (${ev.agent}) also implemented; review must be non-author`,
    };
  }
  if (!ev.verdict) {
    return { ok: false, reason: 'provenance: evaluator.verdict missing' };
  }
  if (ev.verdict !== PASS) {
    // The gate is only called on an intended PASS; a FAIL here is a caller error
    // (a failed task must route to the fixer, not be completed).
    return { ok: false, reason: `provenance: evaluator.verdict is "${ev.verdict}", not PASS` };
  }
  if (!ev.report || typeof ev.report !== 'string') {
    return { ok: false, reason: 'provenance: evaluator.report handle missing' };
  }
  if (!fileExists(ev.report)) {
    return {
      ok: false,
      reason: `provenance: evaluator.report handle does not exist on disk (${ev.report}) — dangling/forged`,
    };
  }
  return { ok: true };
}

/**
 * The completion GATE. Throws an Error (an integrity violation) unless the
 * record passes `check`. Called by `completeTrack` (lib/state.js) under the
 * writer lock, BEFORE it advances loop_state to COMPLETE. Throw is reserved for
 * missing/forged/non-author provenance — NOT for a legitimate FAIL verdict
 * (which the orchestrator routes to the fixer before ever attempting completion).
 *
 * @param {object} record
 * @param {{ fileExists?: (p: string) => boolean }} [opts]
 * @throws {Error} if the completion invariant is violated.
 */
export function gate(record, opts = {}) {
  const { ok, reason } = check(record, opts);
  if (!ok) throw new Error(`completeTrack gate: ${reason}`);
}

/**
 * True iff the record satisfies the completion invariant (no throw). The
 * boolean-returning sibling of `gate`, for callers that want to test a record
 * (e.g. a provenance-incomplete track that crashed between implementation and
 * evaluation must be treated as not-done and re-EVALUATED, not re-implemented).
 *
 * @param {object} record
 * @param {{ fileExists?: (p: string) => boolean }} [opts]
 * @returns {boolean}
 */
export function isComplete(record, opts = {}) {
  return check(record, opts).ok;
}

/**
 * Assemble a normalized provenance record from firewall-validated envelopes.
 * Verdicts + handles only — strips any findings prose.
 *
 * @param {{ implementer: object, implementers?: object[], evaluator: object, tests?: object, reviews?: object[] }} parts
 * @returns {object}
 */
export function build({ implementer, implementers, evaluator, tests, reviews } = {}) {
  const pick = (o, keys) =>
    o && typeof o === 'object'
      ? Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]))
      : undefined;
  const rec = {};
  if (Array.isArray(implementers)) rec.implementers = implementers.slice();
  else rec.implementer = pick(implementer, ['agent', 'model', 'commit']);
  rec.evaluator = pick(evaluator, ['agent', 'model', 'verdict', 'report', 'confidence']);
  if (tests) rec.tests = pick(tests, ['ran', 'summary']);
  if (Array.isArray(reviews)) {
    rec.reviews = reviews.map((r) => pick(r, ['agent', 'verdict', 'findings_count', 'report']));
  }
  return rec;
}
