import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  writeTmp,
  commitRename,
  writeState,
  readState,
  withWriterLock,
  markTaskComplete,
  setLockTtlMs,
  STATE_FILE,
  TMP_FILE,
  LOCK_FILE,
} from '../lib/state.js';
import { resumeFromDir, DONE } from '../lib/resume.js';

// state.test.js — the SINGLE authoritative execution-state store for the
// orchestration engine. It must be genuinely crash-safe (atomic rename, no torn
// reads: F3) and single-writer (exclusive lock with stale reclaim: F6).
//
// readState contract: returns `null` when no committed state.json exists.

/** Create a fresh temp working dir for a test; cleaned up automatically. */
function mkdir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'soe-state-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// --- (a) Round-trip -----------------------------------------------------------

test('(a) writeTmp + commitRename round-trips through readState', (t) => {
  const dir = mkdir(t);
  const obj = { version: 1, tasks: { 'P1.1': { status: 'pending' } } };

  writeTmp(dir, obj);
  commitRename(dir);

  assert.deepEqual(readState(dir), obj);
});

test('(a) writeState (= writeTmp + commitRename) round-trips', (t) => {
  const dir = mkdir(t);
  const obj = { hello: 'world', nested: { a: [1, 2, 3] } };

  writeState(dir, obj);

  assert.deepEqual(readState(dir), obj);
});

test('(a) readState returns null when no state exists', (t) => {
  const dir = mkdir(t);
  assert.equal(readState(dir), null);
});

// --- (b) Crash-split / no torn read (F3) --------------------------------------

test('(b) writeTmp-only never yields a torn read; readState keeps prior committed value', (t) => {
  const dir = mkdir(t);

  // Commit an initial authoritative value.
  const committed = { rev: 1, payload: 'PRIOR-COMMITTED' };
  writeState(dir, committed);
  assert.deepEqual(readState(dir), committed);

  // Simulate a crash *between* the temp write and the rename: only writeTmp ran.
  const pending = { rev: 2, payload: 'NEW-UNCOMMITTED', extra: 'x'.repeat(1000) };
  writeTmp(dir, pending);

  // The committed value must be intact — no partial/torn object.
  assert.deepEqual(readState(dir), committed, 'must still read PRIOR committed value');

  // The temp file exists but state.json is untouched.
  assert.ok(fs.existsSync(path.join(dir, TMP_FILE)), 'tmp file should exist');
  const raw = fs.readFileSync(path.join(dir, STATE_FILE), 'utf8');
  assert.deepEqual(JSON.parse(raw), committed, 'state.json bytes unchanged');

  // Recovering with commitRename promotes the pending value atomically.
  commitRename(dir);
  assert.deepEqual(readState(dir), pending);
});

// --- (c) Single-writer lock (F6) ----------------------------------------------

test('(c) a second withWriterLock while the first is held fails', async (t) => {
  const dir = mkdir(t);

  let innerAttempted = false;
  let innerFailed = false;

  await withWriterLock(dir, async () => {
    innerAttempted = true;
    // A second acquire while the lock is held must NOT succeed.
    await assert.rejects(
      () => withWriterLock(dir, async () => {
        throw new Error('SHOULD NOT RUN — lock was already held');
      }),
      /lock held|locked|EEXIST/i,
      'concurrent lock acquire must reject',
    );
    innerFailed = true;
  });

  assert.ok(innerAttempted, 'outer critical section ran');
  assert.ok(innerFailed, 'inner acquire was rejected as expected');

  // Lock is released after the outer fn resolves.
  assert.ok(!fs.existsSync(path.join(dir, LOCK_FILE)), 'lock released in finally');
});

test('(c) lock is released even when fn throws', async (t) => {
  const dir = mkdir(t);

  await assert.rejects(
    () => withWriterLock(dir, async () => {
      throw new Error('boom');
    }),
    /boom/,
  );

  // finally must have released the lock; a fresh acquire succeeds.
  assert.ok(!fs.existsSync(path.join(dir, LOCK_FILE)), 'lock released after throw');
  let ran = false;
  await withWriterLock(dir, async () => { ran = true; });
  assert.ok(ran, 'lock re-acquirable after prior fn threw');
});

// --- (d) Stale-lock reclaim ---------------------------------------------------

test('(d) a stale lock (dead holder, past TTL) is reclaimed — no deadlock', async (t) => {
  const dir = mkdir(t);

  // Make the TTL short so the test is fast, then restore.
  const restore = setLockTtlMs(50);
  t.after(restore);

  // Simulate a lock left behind by a process that died: an unlikely PID and an
  // old timestamp (older than the TTL).
  const lockPath = path.join(dir, LOCK_FILE);
  const staleMtime = Date.now() - 10_000;
  fs.writeFileSync(
    lockPath,
    JSON.stringify({ pid: 999_999_999, acquiredAt: staleMtime }),
  );
  // Also age the file mtime so mtime-based TTL checks see it as stale.
  fs.utimesSync(lockPath, new Date(staleMtime), new Date(staleMtime));

  let ran = false;
  await withWriterLock(dir, async () => { ran = true; });
  assert.ok(ran, 'stale lock was reclaimed and critical section ran');
  assert.ok(!fs.existsSync(lockPath), 'reclaimed lock released afterwards');
});

test('(d) a fresh lock held by a live-looking holder is NOT reclaimed before TTL', async (t) => {
  const dir = mkdir(t);
  const restore = setLockTtlMs(60_000);
  t.after(restore);

  const lockPath = path.join(dir, LOCK_FILE);
  fs.writeFileSync(
    lockPath,
    JSON.stringify({ pid: process.pid, acquiredAt: Date.now() }),
  );

  await assert.rejects(
    () => withWriterLock(dir, async () => {}),
    /lock held|locked|EEXIST/i,
    'a fresh lock must not be reclaimed',
  );
});

// --- (e) markTaskComplete -----------------------------------------------------
//
// state.tasks is the SINGLE authoritative shape shared with lib/resume.js: an
// ORDERED array [ { id, status, commitSha?, completedAt? }, ... ] where array
// order IS execution order. markTaskComplete finds the entry by id and updates
// it in place (preserving order, leaving siblings untouched); if no entry with
// that id exists it appends a new one at the end.

test('(e) markTaskComplete updates the matching array entry in place, preserving order', async (t) => {
  const dir = mkdir(t);

  writeState(dir, {
    tasks: [
      { id: 'P2.0', status: 'completed', commitSha: 'aaa0000' },
      { id: 'P2.1', status: 'in_progress' },
      { id: 'P2.2', status: 'pending' },
    ],
  });

  await markTaskComplete(dir, 'P2.1', 'abc1234');

  const s = readState(dir);
  assert.ok(Array.isArray(s.tasks), 'state.tasks is an ordered array');

  // Order is preserved and no entries were added or removed.
  assert.deepEqual(
    s.tasks.map((tk) => tk.id),
    ['P2.0', 'P2.1', 'P2.2'],
    'array order preserved, no entries added/removed',
  );

  // The targeted entry is updated with status/commitSha/completedAt.
  const p21 = s.tasks.find((tk) => tk.id === 'P2.1');
  assert.equal(p21.status, 'completed');
  assert.equal(p21.commitSha, 'abc1234');
  assert.ok(typeof p21.completedAt === 'string' && p21.completedAt.length > 0);

  // Siblings are left untouched.
  const p20 = s.tasks.find((tk) => tk.id === 'P2.0');
  assert.deepEqual(p20, { id: 'P2.0', status: 'completed', commitSha: 'aaa0000' });
  const p22 = s.tasks.find((tk) => tk.id === 'P2.2');
  assert.deepEqual(p22, { id: 'P2.2', status: 'pending' });
});

test('(e) markTaskComplete appends a new entry at the end when the id is absent', async (t) => {
  const dir = mkdir(t);
  writeState(dir, {
    tasks: [{ id: 'P1.1', status: 'completed', commitSha: 'f00' }],
  });

  await markTaskComplete(dir, 'NEW', 'deadbee');

  const s = readState(dir);
  assert.ok(Array.isArray(s.tasks), 'state.tasks is an ordered array');
  assert.equal(s.tasks.length, 2, 'entry appended, not replaced');

  // Appended at the END, preserving prior order.
  assert.deepEqual(s.tasks.map((tk) => tk.id), ['P1.1', 'NEW']);

  const appended = s.tasks[s.tasks.length - 1];
  assert.equal(appended.id, 'NEW');
  assert.equal(appended.status, 'completed');
  assert.equal(appended.commitSha, 'deadbee');
  assert.ok(typeof appended.completedAt === 'string' && appended.completedAt.length > 0);
});

test('(e) markTaskComplete initializes tasks to [] when absent, then appends', async (t) => {
  const dir = mkdir(t);
  writeState(dir, { version: 1 }); // no tasks key at all

  await markTaskComplete(dir, 'ONLY', 'cafe');

  const s = readState(dir);
  assert.ok(Array.isArray(s.tasks), 'tasks initialized to an array');
  assert.deepEqual(s.tasks.map((tk) => tk.id), ['ONLY']);
  assert.equal(s.tasks[0].status, 'completed');
  assert.equal(s.tasks[0].commitSha, 'cafe');
});

// --- (f) Cross-module integration: state.js ↔ resume.js -----------------------
//
// Proves the shapes are compatible end-to-end. We write state with state.js
// (writeState + markTaskComplete) and read the SAME dir back through resume.js
// (resumeFromDir). If the shapes agreed only by accident this would break.

test('(f) resumeFromDir consumes state.js-written state: completing a task advances resume', async (t) => {
  const dir = mkdir(t);

  // Seed an ordered task list via state.js, exactly as the orchestrator would.
  writeState(dir, {
    tasks: [
      { id: 'P2.1', status: 'in_progress' },
      { id: 'P2.2', status: 'pending' },
      { id: 'P2.3', status: 'pending' },
    ],
  });

  // A git runner stub so no real repo/git is needed for the idempotency guard.
  const noCommits = { commitExists: () => false };

  // Before completing anything, resume points at the first not-completed task.
  assert.equal(resumeFromDir(dir, noCommits).id, 'P2.1', 'resumes at first task');

  // Mark P2.1 complete via state.js...
  await markTaskComplete(dir, 'P2.1', 'abc1234');

  // ...and resume.js, reading the SAME dir, now advances to the next pending task.
  const next = resumeFromDir(dir, noCommits);
  assert.equal(next.id, 'P2.2', 'resume advanced past the completed P2.1');

  // Complete the rest; resume then reports DONE — proving full round-trip agreement.
  await markTaskComplete(dir, 'P2.2', 'def5678');
  await markTaskComplete(dir, 'P2.3', 'ghi9012');
  assert.equal(resumeFromDir(dir, noCommits), DONE, 'all tasks completed → DONE');
});
