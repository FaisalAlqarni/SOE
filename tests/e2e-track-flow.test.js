import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runSetup } from '../lib/setup.js';
import { writeState, readState, markTaskComplete } from '../lib/state.js';
import { resumeFromDir, nextAction, DONE } from '../lib/resume.js';
import { incFix, incPlanRevision } from '../lib/loop-guard.js';
import { selectScrutiny } from '../lib/scrutiny.js';
import { parse as parseFirewallReturn } from '../lib/firewall-return.js';

/*
 * e2e-track-flow.test.js — END-TO-END DETERMINISTIC PLUMBING TEST.
 *
 * WHAT THIS PROVES: the soe engine's deterministic library plumbing composes
 * end-to-end across a realistic track lifecycle. It drives the REAL exported
 * functions of lib/setup.js, lib/state.js, lib/resume.js, lib/loop-guard.js,
 * lib/scrutiny.js and lib/firewall-return.js — no reimplementation — through the
 * sequence a real track walks: scaffold → seed track (with/without a bound
 * design doc) → progress tasks via the single source of truth → hit the bounded-
 * loop caps → route scrutiny → validate a context-firewall return. Each stage
 * feeds the next, so this asserts the libs INTEROPERATE, not just that they pass
 * in isolation (that is what the per-lib unit tests already cover).
 *
 * WHAT THIS DOES NOT PROVE (honest scope): it does NOT exercise live LLM agent
 * dispatch — the orchestrator and its subagents are prompt-driven, so the actual
 * planning/coding/review reasoning is done by agents at runtime, not by this
 * test. It also does NOT drive any browser or UI — soe is a Claude Code plugin
 * with NO user interface. Those runtime behaviours are covered by the agents
 * themselves in a live session, not by deterministic Node tests. The git branch
 * check for the idempotency case is exercised through an INJECTED stub git
 * runner, so no real repository or git process is required.
 */

let projectDir;

before(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soe-e2e-'));
});

after(() => {
  if (projectDir) fs.rmSync(projectDir, { recursive: true, force: true });
});

// --- helper mirroring the /go command's "bound design doc -> PLAN" logic -----
// The /go commands decide a track's starting step: if a design doc is already
// bound to the seed record, planning can begin immediately (PLAN); otherwise the
// command must derive a spec first (brainstorm). This helper encodes ONLY that
// branch decision so the test can assert the seed lands on the right step — the
// real spec-derivation is prompt-driven agent work, not modelled here.
function initialStep(seed) {
  return seed.design_doc ? 'PLAN' : 'SPEC';
}

// -----------------------------------------------------------------------------
// (1) SETUP SCAFFOLD — runSetup drives lib/setup.js against a temp project.
// -----------------------------------------------------------------------------
test('(1) setup scaffolds .soe/config.json + tracks dir', () => {
  const report = runSetup(projectDir);

  assert.ok(fs.existsSync(report.configPath), '.soe/config.json exists');
  assert.ok(fs.existsSync(report.tracksDir), '.soe/tracks/ exists');
  assert.equal(report.tracksDir, path.join(projectDir, '.soe', 'tracks'));

  const cfg = JSON.parse(fs.readFileSync(report.configPath, 'utf8'));
  assert.equal(cfg.mode, 'autonomous-guardrailed');
  assert.equal(cfg.max_fix_cycles, 5);
  assert.equal(cfg.max_plan_revisions, 3);
});

// -----------------------------------------------------------------------------
// (2) TRACK SEEDING — mirrors the /go commands writing an initial state record
//     into .soe/tracks/{id}/. Tests BOTH the design-doc-bound and no-doc paths.
// -----------------------------------------------------------------------------
test('(2a) track WITH a bound design_doc seeds at PLAN', () => {
  const tracksDir = path.join(projectDir, '.soe', 'tracks');
  const trackDir = path.join(tracksDir, 'track-with-doc');
  fs.mkdirSync(trackDir, { recursive: true });

  // Create the real design doc file the seed binds to.
  const designDoc = path.join(trackDir, 'design.md');
  fs.writeFileSync(designDoc, '# Design\nBound design doc for this track.\n');

  const seed = {
    track_id: 'track-with-doc',
    design_doc: designDoc,
    loop_state: { current_step: initialStep({ design_doc: designDoc }) },
    tasks: [],
  };
  writeState(trackDir, seed);

  const loaded = readState(trackDir);
  assert.equal(loaded.design_doc, designDoc);
  // Design already bound -> planning can start immediately.
  assert.equal(loaded.loop_state.current_step, 'PLAN');
});

test('(2b) track WITHOUT a design_doc seeds needing spec-derivation first', () => {
  const tracksDir = path.join(projectDir, '.soe', 'tracks');
  const trackDir = path.join(tracksDir, 'track-no-doc');
  fs.mkdirSync(trackDir, { recursive: true });

  const seed = {
    track_id: 'track-no-doc',
    // No design_doc bound: the real command would brainstorm a spec first. Here
    // we only assert the seed is readable and the doc is genuinely absent.
    loop_state: { current_step: initialStep({}) },
    tasks: [],
  };
  writeState(trackDir, seed);

  const loaded = readState(trackDir);
  assert.equal(loaded.design_doc, undefined, 'no design doc is bound');
  assert.notEqual(loaded.loop_state.current_step, 'PLAN');
  assert.equal(loaded.loop_state.current_step, 'SPEC');
});

// -----------------------------------------------------------------------------
// (3) TASK PROGRESSION via the SINGLE SOURCE OF TRUTH — resume.js reads the
//     ordered task list from state.js; markTaskComplete advances it under lock.
//     Includes the F18 idempotency case: an in-flight task whose commit already
//     landed (per the STUB git runner) is skipped, not re-run.
// -----------------------------------------------------------------------------
test('(3) resume advances P1 -> P2 -> P3 -> DONE via state.js', async () => {
  const trackDir = path.join(projectDir, '.soe', 'tracks', 'track-with-doc');

  // Seed an ordered pending task list into the authoritative state store.
  const state = readState(trackDir);
  state.tasks = [
    { id: 'P1', status: 'pending' },
    { id: 'P2', status: 'pending' },
    { id: 'P3', status: 'pending' },
  ];
  writeState(trackDir, state);

  // A stub git runner: no commit is present in the branch. This keeps the unit
  // path from shelling out to real git — the F18 branch check is injected.
  const noCommitsRunner = { commitExists: () => false };

  // First pending is P1.
  assert.equal(resumeFromDir(trackDir, noCommitsRunner).id, 'P1');
  await markTaskComplete(trackDir, 'P1', 'sha-p1');

  // P1 done -> resume advances to P2.
  assert.equal(resumeFromDir(trackDir, noCommitsRunner).id, 'P2');
  await markTaskComplete(trackDir, 'P2', 'sha-p2');

  // P2 done -> resume advances to P3.
  assert.equal(resumeFromDir(trackDir, noCommitsRunner).id, 'P3');
  await markTaskComplete(trackDir, 'P3', 'sha-p3');

  // All tasks completed -> DONE sentinel.
  assert.equal(resumeFromDir(trackDir, noCommitsRunner), DONE);
});

test('(3-idempotency) an in-flight task whose commit already landed is skipped', () => {
  // F18: a crash can leave a task in_progress AFTER its commit landed. Re-running
  // would double-apply, so nextAction skips it when the stub reports the commit
  // exists, and advances to the next genuinely-pending task.
  const state = {
    tasks: [
      { id: 'P1', status: 'completed', commitSha: 'sha-p1' },
      { id: 'P2', status: 'in_progress', commitSha: 'landed-sha' },
      { id: 'P3', status: 'pending' },
    ],
  };

  // Stub git runner: reports ONLY the already-landed commit as present.
  const runner = { commitExists: (sha) => sha === 'landed-sha' };

  // P2's commit already landed -> it is skipped; resume advances to P3.
  assert.equal(nextAction(state, runner).id, 'P3');

  // Sanity: with a runner that sees NO commit, P2 would be re-run (not skipped).
  const noneRunner = { commitExists: () => false };
  assert.equal(nextAction(state, noneRunner).id, 'P2');
});

// -----------------------------------------------------------------------------
// (4) BOUNDED LOOP — loop-guard.js enforces the fix-cycle and plan-revision caps
//     (from config: 5 / 3). It must halt AT the cap so the Evaluate-Loop cannot
//     spin forever.
// -----------------------------------------------------------------------------
test('(4) fix cycles halt at cap (5) and plan revisions at cap (3)', () => {
  const state = { config: { max_fix_cycles: 5, max_plan_revisions: 3 } };

  // Calls 1..4 must not halt; the 5th call halts with reason 'fix-cap'.
  let fix;
  for (let i = 1; i <= 5; i++) fix = incFix(state);
  assert.deepEqual(fix, { halt: true, reason: 'fix-cap', count: 5 });

  // Independent counter: calls 1..2 do not halt; the 3rd halts with 'plan-cap'.
  let plan;
  for (let i = 1; i <= 3; i++) plan = incPlanRevision(state);
  assert.deepEqual(plan, { halt: true, reason: 'plan-cap', count: 3 });
});

// -----------------------------------------------------------------------------
// (5) FAIL-SAFE SCRUTINY — scrutiny.js routes through the deterministic risk
//     floor: a dangerous diff (auth/migration) gets full scrutiny; a docs-only
//     diff collapses.
// -----------------------------------------------------------------------------
test('(5) dangerous diff -> full; docs-only diff -> collapsed', () => {
  const dangerous = {
    files: [
      { path: 'src/auth/login.js', linesChanged: 12, content: 'function login(){ /* jwt */ }' },
      { path: 'db/migrations/003_add_users.sql', linesChanged: 8, content: 'ALTER TABLE users;' },
    ],
  };
  const dangerousOut = selectScrutiny(dangerous, null, null);
  assert.equal(dangerousOut.tier, 'full');
  assert.equal(dangerousOut.board, 'full');

  const docsOnly = {
    files: [
      { path: 'docs/readme.md', linesChanged: 3 },
      { path: 'CHANGELOG.md', linesChanged: 2 },
    ],
  };
  const docsOut = selectScrutiny(docsOnly, null, null);
  assert.notEqual(docsOut.tier, 'full');
  assert.equal(docsOut.board, 'collapsed');
});

// -----------------------------------------------------------------------------
// (6) CONTEXT FIREWALL — firewall-return.js validates an untrusted worker's
//     {path, summary, confidence} envelope. A valid one (with a real file)
//     passes; malformed ones are rejected by throw.
// -----------------------------------------------------------------------------
test('(6) firewall parse accepts a valid envelope, rejects malformed ones', () => {
  // Real scratch file the envelope path resolves to.
  const scratch = path.join(projectDir, 'worker-output.txt');
  fs.writeFileSync(scratch, 'full worker output kept OUT of the orchestrator context');

  const valid = parseFirewallReturn({
    path: scratch,
    summary: 'Implemented P3; tests green.',
    confidence: 0.9,
    // Extra key a worker tried to smuggle in — must be dropped by normalization.
    smuggled: 'should not survive',
  });
  assert.deepEqual(valid, {
    path: scratch,
    summary: 'Implemented P3; tests green.',
    confidence: 0.9,
  });

  // Bad confidence (out of [0,1]) is rejected.
  assert.throws(
    () => parseFirewallReturn({ path: scratch, summary: 'x', confidence: 5 }),
    /confidence/,
  );

  // Missing path is rejected.
  assert.throws(
    () => parseFirewallReturn({ summary: 'x', confidence: 0.5 }),
    /path/,
  );
});
