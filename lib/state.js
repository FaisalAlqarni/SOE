import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { gate } from './provenance.js';
import { requireTrackLenses } from './review-gate.js';
import { classify, applyClassifierHint } from './risk-matrix.js';

/**
 * lib/state.js — the SINGLE authoritative execution-state store for the
 * orchestration engine.
 *
 * Two reliability invariants this module enforces (addresses adversarial
 * findings F3 & F6):
 *
 *   F3 — no torn reads. State is written to a temp file, fsync'd, then promoted
 *   with an atomic rename(2). A crash at ANY point leaves either the full prior
 *   committed value or the full new value on disk — never a partial/torn object.
 *   writeTmp() and commitRename() are deliberately separate so the crash-split
 *   is testable in-process.
 *
 *   F6 — single writer. withWriterLock() takes an exclusive on-disk lock
 *   (O_CREAT | O_EXCL). A second writer cannot enter while it is held. A lock
 *   whose holder died is reclaimed after a TTL so the engine never deadlocks.
 *
 * readState() contract: returns `null` when no committed state.json exists.
 */

export const STATE_FILE = 'state.json';
export const TMP_FILE = 'state.json.tmp';
export const LOCK_FILE = 'state.lock';

// Default stale-lock TTL: 30 minutes. Injectable via setLockTtlMs() so tests
// can run the stale-reclaim path without waiting 30 real minutes.
const DEFAULT_LOCK_TTL_MS = 30 * 60 * 1000;
let lockTtlMs = DEFAULT_LOCK_TTL_MS;

/**
 * Override the stale-lock TTL (primarily for tests / configuration).
 * @param {number} ms - New TTL in milliseconds.
 * @returns {() => void} A restore function that resets the previous TTL.
 */
export function setLockTtlMs(ms) {
  const previous = lockTtlMs;
  lockTtlMs = ms;
  return () => { lockTtlMs = previous; };
}

const statePath = (dir) => path.join(dir, STATE_FILE);
const tmpPath = (dir) => path.join(dir, TMP_FILE);
const lockPath = (dir) => path.join(dir, LOCK_FILE);

/**
 * Write `obj` as JSON to the temp file and fsync it to durable storage.
 * Does NOT touch state.json — call commitRename() to promote it.
 *
 * @param {string} dir - State directory.
 * @param {object} obj - The full authoritative state object.
 */
export function writeTmp(dir, obj) {
  fs.mkdirSync(dir, { recursive: true });
  const data = JSON.stringify(obj, null, 2);
  // 'w' truncates any partial temp file left by a previous crash.
  const fd = fs.openSync(tmpPath(dir), 'w');
  try {
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Atomically promote the temp file to state.json via rename(2).
 * On the same filesystem rename is atomic, so readers see either the old or the
 * new file in full — never a partial write.
 *
 * @param {string} dir - State directory.
 */
export function commitRename(dir) {
  fs.renameSync(tmpPath(dir), statePath(dir));
  // Best-effort: fsync the directory so the rename itself is durable.
  try {
    const dfd = fs.openSync(dir, 'r');
    try {
      fs.fsyncSync(dfd);
    } finally {
      fs.closeSync(dfd);
    }
  } catch {
    // Directory fsync is unsupported on some platforms; the rename still
    // provides atomicity for readers, which is the F3 guarantee.
  }
}

/**
 * writeTmp + commitRename: durably persist `obj` as the new authoritative state.
 *
 * @param {string} dir - State directory.
 * @param {object} obj - The full authoritative state object.
 */
export function writeState(dir, obj) {
  writeTmp(dir, obj);
  commitRename(dir);
}

/**
 * Read and parse the committed state.
 *
 * @param {string} dir - State directory.
 * @returns {object|null} The parsed state, or `null` if none is committed.
 */
export function readState(dir) {
  let raw;
  try {
    raw = fs.readFileSync(statePath(dir), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  return JSON.parse(raw);
}

/**
 * Determine whether an existing lock is stale (safe to reclaim).
 * A lock is stale if its holder process is not running, OR it is older than the
 * configured TTL. Either condition alone is sufficient — the TTL is the
 * backstop for the case where a PID has been recycled by a different process.
 *
 * @param {string} dir - State directory.
 * @returns {boolean} True if the lock may be reclaimed.
 */
function isLockStale(dir) {
  const lp = lockPath(dir);
  let meta = null;
  try {
    meta = JSON.parse(fs.readFileSync(lp, 'utf8'));
  } catch {
    meta = null; // Unreadable/corrupt lock — fall through to mtime check.
  }

  // Age from the recorded acquisition time when available, else file mtime.
  let acquiredAt = meta && typeof meta.acquiredAt === 'number' ? meta.acquiredAt : null;
  if (acquiredAt === null) {
    try {
      acquiredAt = fs.statSync(lp).mtimeMs;
    } catch {
      // Lock vanished between checks — treat as reclaimable.
      return true;
    }
  }
  const agedOut = Date.now() - acquiredAt >= lockTtlMs;

  // If the recorded holder is definitively not alive, it is stale regardless of
  // age. process.kill(pid, 0) throws ESRCH when no such process exists.
  let holderDead = false;
  if (meta && typeof meta.pid === 'number') {
    try {
      process.kill(meta.pid, 0);
      holderDead = false; // Process exists (or we lack permission — treat as alive).
    } catch (err) {
      holderDead = err.code === 'ESRCH';
    }
  }

  // Only reclaim once the TTL has elapsed. This prevents a live-but-recently
  // acquired lock (fresh mtime) from being stolen, while still recovering a
  // lock whose holder died some time ago.
  return agedOut && (holderDead || meta === null || acquiredAt !== null);
}

/**
 * Acquire the exclusive writer lock, creating state.lock with O_EXCL.
 * On EEXIST, reclaims the lock only if it is stale; otherwise throws.
 *
 * @param {string} dir - State directory.
 */
function acquireLock(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const lp = lockPath(dir);
  const payload = JSON.stringify({ pid: process.pid, acquiredAt: Date.now() });

  try {
    const fd = fs.openSync(lp, 'wx'); // O_CREAT | O_EXCL — atomic create.
    try {
      fs.writeFileSync(fd, payload);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    return;
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }

  // Lock already exists. Reclaim it only if stale.
  if (isLockStale(dir)) {
    // Remove the stale lock and retry once. Use a fresh O_EXCL create so we
    // still lose the race safely if another writer reclaims it first.
    try {
      fs.unlinkSync(lp);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    const fd = fs.openSync(lp, 'wx');
    try {
      fs.writeFileSync(fd, payload);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    return;
  }

  const e = new Error(`writer lock held: ${lp} is held by another process`);
  e.code = 'ELOCKED';
  throw e;
}

/** Release the writer lock. Best-effort; a missing lock is not an error. */
function releaseLock(dir) {
  try {
    fs.unlinkSync(lockPath(dir));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

/**
 * Run `fn` while holding the exclusive writer lock. Supports async `fn` (its
 * result is awaited). The lock is ALWAYS released in a finally block, whether
 * `fn` resolves or throws.
 *
 * @param {string} dir - State directory.
 * @param {() => any | Promise<any>} fn - Critical-section function.
 * @returns {Promise<any>} Resolves to `fn`'s return value.
 */
export async function withWriterLock(dir, fn) {
  acquireLock(dir);
  try {
    return await fn();
  } finally {
    releaseLock(dir);
  }
}

/**
 * The atomic multi-field transaction primitive. Under the exclusive writer lock:
 * read the current state (or `{}` when none is committed), hand it to `mutator`
 * which mutates it IN PLACE, persist the result with an atomic write, and return
 * the new state.
 *
 * Because the read, the mutation, AND the write all happen inside ONE lock hold,
 * an orchestrator can change MANY fields — e.g. mark a task complete AND advance
 * the loop phase — in a SINGLE atomic transaction that no concurrent writer can
 * interleave with (addresses adversarial finding F5: "complete + advance" is one
 * write, not two separately-locked writes).
 *
 * @param {string} dir - State directory.
 * @param {(state: object) => any | Promise<any>} mutator - Mutates state in place.
 * @returns {Promise<object>} The new, persisted state.
 */
export async function updateState(dir, mutator) {
  return withWriterLock(dir, async () => {
    const state = readState(dir) || {};
    await mutator(state);
    writeState(dir, state);
    return state;
  });
}

/**
 * Advance the loop to `step` with `status`, PRESERVING every other field in
 * `loop_state` (fix_cycle_count, plan_revision_count, …). Implemented via
 * updateState so it is a single atomic locked write.
 *
 * @param {string} dir - State directory.
 * @param {string} step - The new loop_state.current_step (e.g. "EXECUTE").
 * @param {string} [status='NOT_STARTED'] - The new loop_state.step_status.
 * @returns {Promise<object>} The new, persisted state.
 */
export async function advanceStep(dir, step, status = 'NOT_STARTED') {
  return updateState(dir, (state) => {
    // Preserve any pre-existing loop_state fields; only overwrite the two we own.
    if (!state.loop_state || typeof state.loop_state !== 'object') {
      state.loop_state = {};
    }
    state.loop_state.current_step = step;
    state.loop_state.step_status = status;
  });
}

/**
 * Mark a task completed with its commit sha in the single authoritative record.
 * Serialized behind the writer lock and persisted with an atomic write, so two
 * concurrent completions can never interleave or torn-write the store.
 *
 * `state.tasks` is an ORDERED array — the SAME shape lib/resume.js consumes:
 *   [ { id, status, commitSha?, completedAt? }, ... ]
 * where array order IS execution order. This finds the entry whose `id` matches
 * `taskId` and updates it IN PLACE (preserving order, leaving siblings
 * untouched). If no entry with that id exists, it APPENDS a new one at the end.
 * When `state.tasks` is absent it is initialized to `[]` first.
 *
 * Implemented via updateState (the atomic-transaction primitive) so its
 * read-modify-write is one locked, atomic operation. Per-task completion is
 * UNGATED (a plain 3-arg record) — the completion invariant (lib/provenance.js
 * `gate`) is enforced only at the track level, by `completeTrack`.
 *
 * @param {string} dir - State directory.
 * @param {string} taskId - Task identifier (e.g. "P2.1").
 * @param {string} commitSha - The commit sha proving completion.
 */
export async function markTaskComplete(dir, taskId, commitSha) {
  await updateState(dir, (state) => {
    if (!Array.isArray(state.tasks)) state.tasks = [];
    const completedAt = new Date().toISOString();

    const idx = state.tasks.findIndex((t) => t && t.id === taskId);
    if (idx === -1) {
      // No such task: append a fresh completed entry at the end, preserving order.
      state.tasks.push({ id: taskId, status: 'completed', commitSha, completedAt });
    } else {
      // Update in place so array order (= execution order) is preserved.
      state.tasks[idx] = {
        ...state.tasks[idx],
        status: 'completed',
        commitSha,
        completedAt,
      };
    }
  });
}

/**
 * Best-effort git diff for a track, used as the deterministic tier FLOOR when
 * the orchestrator's `provenance.tier` is absent or understated (see
 * `completeTrack`). `dir` is the track's state directory
 * (`.soe/tracks/{id}`); the project root — where `.soe` lives, and therefore
 * where `git diff` must run — is three levels up. Never throws: any git
 * failure (not a repo, no commits yet, git missing) is swallowed and an empty
 * string is returned, which `completeTrack` treats as "no derivable floor".
 *
 * @param {string} dir - Track state directory.
 * @returns {string} A unified diff, or '' if one could not be captured.
 */
export function defaultTrackDiff(dir) {
  const projectRoot = path.resolve(dir, '../../..');
  try {
    return execSync('git diff HEAD~1..HEAD || git diff', {
      cwd: projectRoot,
      encoding: 'utf8',
    });
  } catch {
    return '';
  }
}

/**
 * The REQUIRED track-completion gate. Runs the completion invariant
 * (lib/provenance.js `gate`) UNCONDITIONALLY, then — in the SAME atomic locked
 * transaction — advances loop_state to COMPLETE and persists the provenance
 * record for audit. Throws (integrity) and leaves state untouched unless a
 * non-author evaluator left a PASS verdict + a report that exists on disk.
 *
 * This is the only GATED completion path, and the orchestrator MUST route COMPLETE
 * through it. The low-level writers (advanceStep/updateState) remain ungated
 * primitives — they must NEVER be used to set current_step='COMPLETE' directly.
 *
 * @param {string} dir - Track state directory.
 * @param {object} provenance - The track provenance record (see lib/provenance.js).
 * @param {{ fileExists?: (p: string) => boolean, getDiff?: (dir: string) => string }} [opts]
 * @returns {Promise<object>} The new, persisted state.
 */
export async function completeTrack(dir, provenance, opts = {}) {
  gate(provenance, opts); // throws BEFORE any write on missing/forged/non-author/FAIL
  // Full-tier tracks additionally require Board approval. The board decision
  // rides inside the provenance record; non-full tracks omit it and skip this.
  if (provenance.board && provenance.board.tier === 'full') {
    const d = provenance.board.decision;
    if (d !== 'APPROVED' && d !== 'APPROVED_WITH_REVIEW') {
      throw new Error(`completeTrack: full-tier board decision '${d}' does not permit completion`);
    }
  }
  // A track cannot complete unless its tier's differentiated review lenses
  // (lib/review-policy.js `requiredReviews`) actually ran — PASS, non-author,
  // on disk. `provenance.tier` is no longer allowed to simply be absent: the
  // tier is DERIVED from the actual diff (via risk-matrix.js `classify`) and
  // used as a FLOOR that `provenance.tier` may only be raised above, never
  // lowered below — an orchestrator that omits `tier`, or under-states it,
  // cannot dodge the lenses the diff's real risk requires.
  const getDiff = opts.getDiff || defaultTrackDiff;
  let diff = '';
  try {
    diff = getDiff(dir) || '';
  } catch {
    diff = ''; // best-effort: a broken diff provider must never block completion.
  }
  let derivedFloor = null;
  if (diff) {
    const classified = classify(diff);
    derivedFloor = typeof classified === 'string' ? classified : classified && classified.tier;
  }

  let effectiveTier;
  if (derivedFloor) {
    effectiveTier = applyClassifierHint(derivedFloor, provenance.tier);
  } else if (provenance.tier) {
    effectiveTier = provenance.tier;
  } else {
    throw new Error(
      'completeTrack: cannot determine tier (provenance.tier missing and diff unavailable) — classify the diff before completing',
    );
  }

  const r = requireTrackLenses(effectiveTier, provenance.reviews || [], {
    fileExists: opts.fileExists,
    implementers: provenance.implementers,
    implementer: provenance.implementer,
    touchesSql: provenance.touchesSql,
    touchesLogging: provenance.touchesLogging,
  });
  if (!r.ok) {
    throw new Error('completeTrack: required review lenses missing/failed: ' + JSON.stringify(r.violations));
  }
  return updateState(dir, (state) => {
    if (!state.loop_state || typeof state.loop_state !== 'object') state.loop_state = {};
    state.loop_state.current_step = 'COMPLETE';
    state.loop_state.step_status = 'DONE';
    state.status = 'complete';
    state.provenance = provenance;
  });
}
