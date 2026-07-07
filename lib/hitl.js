/**
 * lib/hitl.js — human-in-the-loop primitive: a sensitive-path predicate +
 * file-backed approval markers.
 *
 * PURE + INJECTABLE: `writeFile`/`readFile` are injected (default the real
 * `node:fs` fns) so this is unit-testable without touching disk — same
 * injection pattern as lib/provenance.js (which injects `fileExists`).
 *
 * Flow: a caller that hits a sensitive path or an ESCALATE verdict calls
 * `requestApproval` to write a pending marker under `<dir>/approvals/`, then
 * polls `checkApproval` (elsewhere, over time) until a human writes a
 * `<id>.decision.json` file with `{ decision: "approve" | "deny" }`.
 */

import fs from 'node:fs';
import { join } from 'node:path';
import { hasRiskyPathMarker } from './risk-matrix.js';

/**
 * Case-insensitive substrings marking sensitive paths by default. This covers
 * CI/infra concerns (`.github/workflows`, `terraform`, `.tfstate`) that
 * risk-matrix's markers don't model; the richer, anchored auth/authz/payment/
 * secrets/migrations/PII/prod-config/crypto markers are layered on top via
 * `hasRiskyPathMarker` (see `isSensitivePath` below) when the caller uses the
 * default deny list.
 */
export const DEFAULT_DENYLIST = Object.freeze([
  '.env',
  'secret',
  'id_rsa',
  '.pem',
  'credential',
  '.github/workflows',
  'terraform',
  '.tfstate',
]);

/**
 * True iff `path` (lowercased) contains any denyList entry (lowercased), OR —
 * when the default deny list is in effect — `path` matches one of
 * risk-matrix's stronger, anchored HIGH-RISK path markers (auth, authz,
 * payment, secrets, migrations, PII, prod-config, crypto). Pure — no fs.
 *
 * A caller-supplied custom `denyList` is honored as-is (substring match only)
 * and does not fall back to the risk-matrix markers, so existing "custom
 * denylist" semantics are unchanged.
 *
 * @param {string} path
 * @param {string[]} [denyList]
 * @returns {boolean}
 */
export function isSensitivePath(path, denyList = DEFAULT_DENYLIST) {
  const lower = String(path).toLowerCase();
  if (denyList.some((entry) => lower.includes(String(entry).toLowerCase()))) {
    return true;
  }
  if (denyList === DEFAULT_DENYLIST) {
    return hasRiskyPathMarker(path);
  }
  return false;
}

/**
 * Request human approval for a sensitive action. Writes a pending marker to
 * `<dir>/approvals/<id>.pending.json` and returns the generated id.
 *
 * The id is deterministic-ish and derived from `kind` + a sanitized slice of
 * `detail` — NO Date.now()/Math.random() (unavailable in some contexts).
 *
 * @param {string} dir - the track directory.
 * @param {{ kind: string, detail: string }} request
 * @param {{ writeFile?: (p: string, data: string) => void }} [opts]
 * @returns {string} the approval id.
 */
export function requestApproval(dir, { kind, detail }, { writeFile = fs.writeFileSync } = {}) {
  const slug = String(detail).replace(/[^a-z0-9]+/gi, '-').slice(0, 24);
  const id = `${kind}-${slug}`;
  const approvalsDir = join(dir, 'approvals');
  const usingDefault = writeFile === fs.writeFileSync;
  if (usingDefault) {
    fs.mkdirSync(approvalsDir, { recursive: true });
  }
  writeFile(join(approvalsDir, `${id}.pending.json`), JSON.stringify({ kind, detail, status: 'pending' }));
  return id;
}

/**
 * Check the status of a pending approval. Returns `'pending'` if no decision
 * file exists yet, or `'approve'`/`'deny'` once a human has written one.
 *
 * @param {string} dir - the track directory.
 * @param {string} id - the approval id from `requestApproval`.
 * @param {{ readFile?: (p: string) => string }} [opts]
 * @returns {'pending'|'approve'|'deny'}
 */
export function checkApproval(dir, id, { readFile = fs.readFileSync } = {}) {
  const decisionPath = join(dir, 'approvals', `${id}.decision.json`);
  let raw;
  try {
    raw = readFile(decisionPath);
  } catch (err) {
    if (err && err.code === 'ENOENT') return 'pending';
    throw err;
  }
  const { decision } = JSON.parse(raw);
  return decision;
}
