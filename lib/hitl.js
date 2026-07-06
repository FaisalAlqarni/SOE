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

/** Case-insensitive substrings marking sensitive paths by default. */
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
 * True iff `path` (lowercased) contains any denyList entry (lowercased).
 * Pure — no fs.
 *
 * @param {string} path
 * @param {string[]} [denyList]
 * @returns {boolean}
 */
export function isSensitivePath(path, denyList = DEFAULT_DENYLIST) {
  const lower = String(path).toLowerCase();
  return denyList.some((entry) => lower.includes(String(entry).toLowerCase()));
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
