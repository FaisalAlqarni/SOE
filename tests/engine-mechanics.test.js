import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  writeTmp,
  commitRename,
  writeState,
  readState,
  markTaskComplete,
  withWriterLock,
} from '../lib/state.js';

import {
  nextAction,
  resumeFromDir,
  DONE,
} from '../lib/resume.js';

import { incFix, incPlanRevision } from '../lib/loop-guard.js';

import { parse as parseFirewallReturn } from '../lib/firewall-return.js';

/**
 * engine-mechanics.test.js — CROSS-LIB integration/invariant suite for the
 * orchestration engine (Phase P2 final task). Where the per-lib unit tests
 * exercise each module in isolation with stubs, THIS suite wires the REAL
 * exported functions of lib/state.js, lib/resume.js, lib/loop-guard.js and
 * lib/firewall-return.js together and asserts the engine's five core
 * invariants hold END-TO-END. It also proves worktree isolation is PHYSICAL,
 * not a string comparison (addresses adversarial finding F6 meaningfully).
 *
 * Everything runs in fresh temp dirs / real throwaway git repos created under
 * os.tmpdir(); every artifact is removed in the test's after-hook.
 */

/** Make a fresh scratch dir and register its cleanup on `t`. */
function scratch(t, prefix = 'soe-engine-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Run git with the given args in `cwd`, returning trimmed stdout. */
function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/** Initialize a throwaway git repo with one commit; returns its path. */
function initRepo(t) {
  const repo = scratch(t, 'soe-repo-');
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.email', 'engine-test@example.com');
  git(repo, 'config', 'user.name', 'engine test');
  fs.writeFileSync(path.join(repo, 'seed.txt'), 'seed\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'seed');
  return repo;
}

// ---------------------------------------------------------------------------
// 1. Atomic + single-writer state (F3 + F6, via lib/state.js)
// ---------------------------------------------------------------------------

test('1a. two concurrent withWriterLock attempts on the same dir serialize', async (t) => {
  const dir = scratch(t);

  let firstHoldsLock = false;
  let secondRanConcurrently = false;
  let secondError = null;

  // The first writer grabs the lock and holds it across an await, during which
  // it launches a SECOND withWriterLock on the SAME dir. Because the lock is an
  // exclusive on-disk O_EXCL lock, the second acquire must fail rather than
  // enter the critical section while the first still holds it.
  await withWriterLock(dir, async () => {
    firstHoldsLock = true;
    try {
      await withWriterLock(dir, async () => {
        // If we ever get here while the first holder is still inside, the
        // single-writer invariant is broken.
        secondRanConcurrently = firstHoldsLock;
      });
    } catch (err) {
      secondError = err;
    }
    // Yield a tick to make any (incorrect) concurrent entry observable.
    await new Promise((r) => setImmediate(r));
  });

  assert.ok(secondError, 'second concurrent writer should have thrown');
  assert.match(
    String(secondError.message),
    /lock held/i,
    'second writer must be rejected with a "lock held" error',
  );
  assert.strictEqual(
    secondRanConcurrently,
    false,
    'second writer must NOT run concurrently while the first holds the lock',
  );

  // After the outer lock releases, a fresh writer must be able to acquire it.
  let acquiredAfterRelease = false;
  await withWriterLock(dir, async () => {
    acquiredAfterRelease = true;
  });
  assert.ok(acquiredAfterRelease, 'lock must be released and re-acquirable');
});

test('1b. crash-split (writeTmp without commitRename) leaves prior committed value intact', (t) => {
  const dir = scratch(t);

  // Commit an initial authoritative value.
  writeState(dir, { tasks: [{ id: 'P1', status: 'completed' }], marker: 'v1' });
  assert.strictEqual(readState(dir).marker, 'v1');

  // Simulate a crash mid-write: the temp file is written+fsync'd but the process
  // dies before the atomic rename promotes it. commitRename is deliberately NOT
  // called.
  writeTmp(dir, { tasks: [], marker: 'v2-TORN' });

  // A reader still sees the FULL prior committed value — never the half-written
  // one. This is the F3 no-torn-reads guarantee.
  const recovered = readState(dir);
  assert.strictEqual(recovered.marker, 'v1', 'prior committed value must survive a crash-split');
  assert.deepStrictEqual(recovered.tasks, [{ id: 'P1', status: 'completed' }]);

  // And a subsequent proper commit still works, promoting a clean value.
  writeState(dir, { tasks: [], marker: 'v3' });
  assert.strictEqual(readState(dir).marker, 'v3');
});

// ---------------------------------------------------------------------------
// 2. Resume skips completed + already-applied (F14 + F18, state.js + resume.js)
// ---------------------------------------------------------------------------

test('2a. resume returns the correct next task over real state.js state', async (t) => {
  const dir = scratch(t);

  // Seed an ordered track state, then mark the first task complete THROUGH the
  // real state.js writer (atomic + locked), exactly as the orchestrator would.
  writeState(dir, {
    tasks: [
      { id: 'P2.1', status: 'pending' },
      { id: 'P2.2', status: 'pending' },
      { id: 'P2.3', status: 'pending' },
    ],
  });
  await markTaskComplete(dir, 'P2.1', 'sha-p21');

  // resumeFromDir loads the committed state via state.js and computes the next
  // action. With P2.1 completed and no in-flight tasks, the next task is P2.2.
  const next = resumeFromDir(dir);
  assert.notStrictEqual(next, DONE);
  assert.strictEqual(next.id, 'P2.2');
  assert.strictEqual(next.status, 'pending');
});

test('2b. an in-flight task whose commit already landed is SKIPPED (F18 idempotency)', async (t) => {
  const dir = scratch(t);

  // P2.1 completed; P2.2 crashed while in_progress AFTER its commit landed;
  // P2.3 still pending. A naive resume would re-run P2.2 and double-apply.
  writeState(dir, {
    tasks: [
      { id: 'P2.1', status: 'completed', commitSha: 'sha-p21' },
      { id: 'P2.2', status: 'in_progress', commitSha: 'sha-p22-landed' },
      { id: 'P2.3', status: 'pending' },
    ],
  });

  // Stub git runner: report that P2.2's commit is ALREADY present in the branch.
  const seen = [];
  const gitStub = {
    commitExists(sha) {
      seen.push(sha);
      return sha === 'sha-p22-landed';
    },
  };

  const state = readState(dir);
  const next = nextAction(state, gitStub);

  assert.notStrictEqual(next, DONE);
  assert.strictEqual(next.id, 'P2.3', 'the landed in-flight task must be skipped, advancing to P2.3');
  assert.ok(seen.includes('sha-p22-landed'), 'idempotency guard must consult the injected git runner');

  // Contrast: if the same in-flight commit had NOT landed, resume must re-run it.
  const notLanded = nextAction(state, { commitExists: () => false });
  assert.strictEqual(notLanded.id, 'P2.2', 'an in-flight task whose commit did NOT land must be re-run');
});

// ---------------------------------------------------------------------------
// 3. Bounded loops halt at caps (F9, via lib/loop-guard.js)
// ---------------------------------------------------------------------------

test('3. bounded loops halt at their caps read from config', (t) => {
  void t;
  // Caps sourced from state.config (as loaded from .soe/config.json).
  const state = { config: { max_fix_cycles: 5, max_plan_revisions: 3 } };

  // Fix cycles: calls 1..4 proceed, the 5th halts with reason 'fix-cap'.
  const fixResults = [];
  for (let i = 0; i < 5; i++) fixResults.push(incFix(state));
  assert.deepStrictEqual(
    fixResults.slice(0, 4).map((r) => r.halt),
    [false, false, false, false],
    'the first four fix cycles must not halt',
  );
  assert.strictEqual(fixResults[4].halt, true, 'the 5th fix cycle must halt');
  assert.strictEqual(fixResults[4].reason, 'fix-cap');
  assert.strictEqual(fixResults[4].count, 5);
  assert.strictEqual(state.loop_state.fix_cycle_count, 5, 'counter persisted on the state object');

  // Plan revisions: calls 1..2 proceed, the 3rd halts with reason 'plan-cap'.
  const planResults = [];
  for (let i = 0; i < 3; i++) planResults.push(incPlanRevision(state));
  assert.deepStrictEqual(
    planResults.slice(0, 2).map((r) => r.halt),
    [false, false],
    'the first two plan revisions must not halt',
  );
  assert.strictEqual(planResults[2].halt, true, 'the 3rd plan revision must halt');
  assert.strictEqual(planResults[2].reason, 'plan-cap');
  assert.strictEqual(planResults[2].count, 3);
});

// ---------------------------------------------------------------------------
// 4. Meaningful worktree isolation (F6 — the REAL fix, via real git worktrees)
// ---------------------------------------------------------------------------

test('4. two REAL git worktrees are physically isolated (F6)', (t) => {
  // Chosen approach: REAL git worktrees. A throwaway repo is created and two
  // separate worktrees are added with `git worktree add`. We prove isolation
  // PHYSICALLY — a file written into worktree A's tree is genuinely absent from
  // worktree B's tree on disk — not merely that two path strings differ.
  const repo = initRepo(t);

  const wtA = fs.mkdtempSync(path.join(os.tmpdir(), 'soe-wtA-'));
  const wtB = fs.mkdtempSync(path.join(os.tmpdir(), 'soe-wtB-'));
  // mkdtemp created the target dirs; git worktree add wants to create them, so
  // point it at a child path that does not yet exist.
  const treeA = path.join(wtA, 'tree');
  const treeB = path.join(wtB, 'tree');

  t.after(() => {
    // Best-effort worktree removal, then remove the scratch parents.
    try { git(repo, 'worktree', 'remove', '--force', treeA); } catch { /* ignore */ }
    try { git(repo, 'worktree', 'remove', '--force', treeB); } catch { /* ignore */ }
    fs.rmSync(wtA, { recursive: true, force: true });
    fs.rmSync(wtB, { recursive: true, force: true });
  });

  git(repo, 'worktree', 'add', '-q', '-b', 'branch-a', treeA);
  git(repo, 'worktree', 'add', '-q', '-b', 'branch-b', treeB);

  // Distinct working directories.
  assert.notStrictEqual(treeA, treeB, 'worktrees must have distinct working dirs');
  assert.ok(fs.existsSync(treeA) && fs.existsSync(treeB), 'both worktrees must exist on disk');

  // PHYSICAL isolation: write a worker artifact into worktree A only.
  const artifactName = 'worker-A-output.txt';
  fs.writeFileSync(path.join(treeA, artifactName), 'A-only work product\n');

  assert.ok(
    fs.existsSync(path.join(treeA, artifactName)),
    'the artifact must be present in worktree A',
  );
  assert.ok(
    !fs.existsSync(path.join(treeB, artifactName)),
    'the artifact written in worktree A must NOT be visible in worktree B (physical isolation)',
  );

  // Cross-check via git status in B: its tree is clean, it has not observed the
  // file. This proves isolation at the VCS level, not just the filesystem.
  const statusB = git(treeB, 'status', '--porcelain');
  assert.strictEqual(statusB, '', "worktree B's tree must be clean — it cannot see A's uncommitted work");

  // And explicit removal works (validating the cleanup path the orchestrator uses).
  git(repo, 'worktree', 'remove', '--force', treeA);
  assert.ok(!fs.existsSync(treeA), 'git worktree remove must physically delete worktree A');
});

// ---------------------------------------------------------------------------
// 5. Firewall-return validation in the loop path (F12, via firewall-return.js)
// ---------------------------------------------------------------------------

test('5. firewall parse accepts a valid worker return and rejects malformed ones', (t) => {
  const dir = scratch(t);

  // A real on-disk scratch path the worker claims to have written its full
  // output to — parse() requires the path to actually exist.
  const outPath = path.join(dir, 'worker-full-output.md');
  fs.writeFileSync(outPath, '# worker output\n...full noisy report kept OUT of orchestrator...\n');

  // Valid envelope (as JSON string, the wire form) parses and normalizes.
  const valid = parseFirewallReturn(
    JSON.stringify({
      path: outPath,
      summary: 'Implemented feature X; all tests green.',
      confidence: 0.9,
      // A smuggled extra key must be dropped by normalization.
      injected: 'ignore me',
    }),
  );
  assert.deepStrictEqual(
    valid,
    { path: outPath, summary: 'Implemented feature X; all tests green.', confidence: 0.9 },
    'a valid return must normalize to exactly {path, summary, confidence}',
  );

  // Malformed: confidence out of range → rejected.
  assert.throws(
    () => parseFirewallReturn({ path: outPath, summary: 'ok', confidence: 1.5 }),
    /confidence/i,
    'a return with bad confidence must be rejected',
  );

  // Malformed: confidence not a number → rejected.
  assert.throws(
    () => parseFirewallReturn({ path: outPath, summary: 'ok', confidence: 'high' }),
    /confidence/i,
    'a return with non-numeric confidence must be rejected',
  );

  // Malformed: missing/non-existent path → rejected (untrusted worker can't
  // fabricate a handle to a file that does not exist).
  assert.throws(
    () => parseFirewallReturn({ path: path.join(dir, 'does-not-exist.md'), summary: 'ok', confidence: 0.5 }),
    /path/i,
    'a return whose path does not exist must be rejected',
  );

  // Malformed: missing path field entirely → rejected.
  assert.throws(
    () => parseFirewallReturn({ summary: 'ok', confidence: 0.5 }),
    /path/i,
    'a return with no path must be rejected',
  );
});
