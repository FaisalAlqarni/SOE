import { test } from 'node:test';
import assert from 'node:assert';

import {
  isIrreversible,
  shouldEscalate,
  resolveViaInstinct,
  CONFIDENCE_THRESHOLD,
} from '../lib/escalation.js';

// escalation.test.js — the safety-critical escalation valve (design §3.3,
// adversarial resolutions F5/F11).
//
// The orchestrator runs unattended in autonomous mode but MUST stop and confirm
// on high-consequence actions. This lib is the deterministic, tested gate:
//
//   isIrreversible(action)  — classifies an action as high-blast-radius /
//     irreversible (data-loss migration, prod deploy, force-push, secret
//     rotation) via keyword matching on its type/command/description.
//
//   shouldEscalate(ctx)     — decides whether a situation must go to a human:
//     irreversible action, OR bound exhaustion (fix/plan cap hit), OR a
//     judgment gate while in interactive mode.
//
//   resolveViaInstinct(ctx, instincts) — the escalation-learning shortcut: a
//     high-confidence learned instinct may auto-resolve a REVERSIBLE situation
//     the way you would, reducing interruptions. The CRITICAL SAFETY INVARIANT:
//     an IRREVERSIBLE action is NEVER auto-resolved, even by a perfectly
//     matching, maximally-confident instinct — it always escalates/confirms.
//
// The math lives in code, not in a prompt, so a broken/hallucinated instinct
// can't sneak a bogus auto-resolution past an irreversible gate.

// ===========================================================================
// isIrreversible — high-blast-radius / irreversible classifier
// ===========================================================================

test('isIrreversible: TRUE for a data-loss / destructive migration', () => {
  assert.equal(isIrreversible({ type: 'migration', description: 'drop the users table' }), true);
  assert.equal(isIrreversible({ command: 'DROP TABLE accounts;' }), true);
  assert.equal(isIrreversible({ description: 'run a data-loss migration on prod db' }), true);
});

test('isIrreversible: TRUE for a production deploy', () => {
  assert.equal(isIrreversible({ type: 'deploy', description: 'deploy to production' }), true);
  assert.equal(isIrreversible({ command: 'kubectl apply -f prod --context prod' }), true);
});

test('isIrreversible: TRUE for a force-push', () => {
  assert.equal(isIrreversible({ command: 'git push --force origin main' }), true);
  assert.equal(isIrreversible({ command: 'git push -f' }), true);
  assert.equal(isIrreversible({ description: 'force push over the remote branch' }), true);
});

test('isIrreversible: TRUE for secret rotation', () => {
  assert.equal(isIrreversible({ type: 'secret-rotation' }), true);
  assert.equal(isIrreversible({ description: 'rotate the API secret key' }), true);
  assert.equal(isIrreversible({ command: 'aws secretsmanager rotate-secret' }), true);
});

test('isIrreversible: FALSE for routine reversible actions', () => {
  assert.equal(isIrreversible({ type: 'edit', description: 'edit a file' }), false);
  assert.equal(isIrreversible({ command: 'npm test' }), false);
  assert.equal(isIrreversible({ description: 'add a helper function' }), false);
  assert.equal(isIrreversible({ command: 'git commit -m "wip"' }), false);
  assert.equal(isIrreversible({ command: 'git push origin feature-branch' }), false);
});

test('isIrreversible: is case-insensitive across all fields', () => {
  assert.equal(isIrreversible({ command: 'GIT PUSH --FORCE' }), true);
  assert.equal(isIrreversible({ description: 'Deploy To PRODUCTION' }), true);
});

test('isIrreversible: tolerates missing/empty fields and non-objects', () => {
  assert.equal(isIrreversible({}), false);
  assert.equal(isIrreversible(null), false);
  assert.equal(isIrreversible(undefined), false);
  assert.equal(isIrreversible('git push --force'), false); // must be an action object
});

// ===========================================================================
// shouldEscalate — the escalation decision
// ===========================================================================
//
// Rule (documented): escalate when ANY holds —
//   1. the action is irreversible (isIrreversible); OR
//   2. boundExhausted is true (fix cap / plan cap hit); OR
//   3. mode === 'interactive' AND the situation is a judgment gate.
// In autonomous mode a judgment gate alone does NOT escalate.

test('shouldEscalate: TRUE when the action is irreversible (even autonomous, no bound hit)', () => {
  const ctx = {
    action: { command: 'git push --force origin main' },
    mode: 'autonomous',
    boundExhausted: false,
  };
  assert.equal(shouldEscalate(ctx), true);
});

test('shouldEscalate: TRUE on bound exhaustion (fix/plan cap hit)', () => {
  const ctx = {
    action: { type: 'edit', description: 'edit a file' },
    mode: 'autonomous',
    boundExhausted: true,
  };
  assert.equal(shouldEscalate(ctx), true);
});

test('shouldEscalate: TRUE on a judgment gate in INTERACTIVE mode', () => {
  const ctx = {
    action: { type: 'edit', description: 'edit a file' },
    mode: 'interactive',
    boundExhausted: false,
    judgmentGate: true,
  };
  assert.equal(shouldEscalate(ctx), true);
});

test('shouldEscalate: FALSE on a judgment gate in AUTONOMOUS mode', () => {
  const ctx = {
    action: { type: 'edit', description: 'edit a file' },
    mode: 'autonomous',
    boundExhausted: false,
    judgmentGate: true,
  };
  assert.equal(shouldEscalate(ctx), false);
});

test('shouldEscalate: FALSE for a routine reversible action, autonomous, no bound hit, no gate', () => {
  const ctx = {
    action: { command: 'npm test' },
    mode: 'autonomous',
    boundExhausted: false,
  };
  assert.equal(shouldEscalate(ctx), false);
});

test('shouldEscalate: irreversible dominates even in interactive mode without a gate', () => {
  const ctx = {
    action: { type: 'deploy', description: 'deploy to production' },
    mode: 'interactive',
    boundExhausted: false,
    judgmentGate: false,
  };
  assert.equal(shouldEscalate(ctx), true);
});

// ===========================================================================
// resolveViaInstinct — escalation-learning auto-resolution
// ===========================================================================
//
// Returns a resolution ONLY when:
//   - the action is NOT irreversible, AND
//   - a matching instinct has confidence >= CONFIDENCE_THRESHOLD.
// Otherwise returns null (no auto-resolution -> caller escalates/confirms).

const EDIT = { type: 'edit', command: 'edit config file', description: 'tweak a timeout value' };
const FORCE_PUSH = { command: 'git push --force origin main', description: 'force push' };

function instinct(match, confidence, resolution = 'PROCEED') {
  return { match, resolution, confidence };
}

test('resolveViaInstinct: reversible + HIGH confidence -> auto-resolves', () => {
  const ctx = { action: EDIT };
  const res = resolveViaInstinct(ctx, [instinct('edit', 0.95, 'PROCEED')]);
  assert.ok(res, 'expected a resolution');
  assert.equal(res.resolution, 'PROCEED');
});

test('resolveViaInstinct: reversible + LOW confidence -> no auto-resolve (escalates)', () => {
  const ctx = { action: EDIT };
  const res = resolveViaInstinct(ctx, [instinct('edit', 0.10, 'PROCEED')]);
  assert.equal(res, null);
});

test('resolveViaInstinct: reversible but NO matching instinct -> no auto-resolve', () => {
  const ctx = { action: EDIT };
  const res = resolveViaInstinct(ctx, [instinct('deploy production', 0.99, 'PROCEED')]);
  assert.equal(res, null);
});

test('resolveViaInstinct: confidence exactly AT the threshold resolves (>=)', () => {
  const ctx = { action: EDIT };
  const res = resolveViaInstinct(ctx, [instinct('edit', CONFIDENCE_THRESHOLD, 'PROCEED')]);
  assert.ok(res, 'confidence == threshold must resolve');
});

test('resolveViaInstinct: picks the highest-confidence matching instinct', () => {
  const ctx = { action: EDIT };
  const res = resolveViaInstinct(ctx, [
    instinct('edit', 0.85, 'LOW'),
    instinct('edit', 0.97, 'HIGH'),
    instinct('edit', 0.90, 'MID'),
  ]);
  assert.equal(res.resolution, 'HIGH');
});

test('resolveViaInstinct: tolerates an empty / missing instinct list', () => {
  const ctx = { action: EDIT };
  assert.equal(resolveViaInstinct(ctx, []), null);
  assert.equal(resolveViaInstinct(ctx, undefined), null);
});

// --- THE CRITICAL SAFETY INVARIANT ----------------------------------------
// An IRREVERSIBLE action is NEVER auto-resolved, even by a perfectly matching,
// maximally-confident instinct. Irreversible ALWAYS escalates/confirms.

test('CRITICAL: irreversible + maximally-confident MATCHING instinct -> STILL no auto-resolve', () => {
  const ctx = { action: FORCE_PUSH };
  const res = resolveViaInstinct(ctx, [instinct('force push', 1.0, 'PROCEED')]);
  assert.equal(res, null, 'irreversible action must NEVER be auto-resolved by an instinct');
});

test('CRITICAL: irreversible always escalates even when an instinct would otherwise resolve it', () => {
  const ctx = {
    action: FORCE_PUSH,
    mode: 'autonomous',
    boundExhausted: false,
  };
  // The instinct matches with max confidence...
  assert.equal(resolveViaInstinct(ctx, [instinct('force push', 1.0, 'PROCEED')]), null);
  // ...yet the situation still escalates.
  assert.equal(shouldEscalate(ctx), true);
});

test('CRITICAL: every irreversible category resists a max-confidence instinct', () => {
  const cases = [
    { command: 'DROP TABLE users;' },
    { type: 'deploy', description: 'deploy to production' },
    { command: 'git push --force' },
    { type: 'secret-rotation', description: 'rotate the API secret' },
  ];
  for (const action of cases) {
    const res = resolveViaInstinct({ action }, [instinct('.*', 1.0, 'PROCEED')]);
    assert.equal(res, null, `irreversible action must not auto-resolve: ${JSON.stringify(action)}`);
  }
});

// --- threshold is a documented, configurable constant ----------------------

test('CONFIDENCE_THRESHOLD is a documented number in (0,1]', () => {
  assert.equal(typeof CONFIDENCE_THRESHOLD, 'number');
  assert.ok(CONFIDENCE_THRESHOLD > 0 && CONFIDENCE_THRESHOLD <= 1);
});

test('resolveViaInstinct: threshold is configurable via options', () => {
  const ctx = { action: EDIT };
  // 0.5 is below the default threshold -> would not resolve...
  assert.equal(resolveViaInstinct(ctx, [instinct('edit', 0.5, 'PROCEED')]), null);
  // ...but with a lowered threshold it does.
  const res = resolveViaInstinct(ctx, [instinct('edit', 0.5, 'PROCEED')], { threshold: 0.5 });
  assert.ok(res, 'a lowered threshold must allow resolution');
});

test('resolveViaInstinct: a lowered threshold STILL cannot resolve an irreversible action', () => {
  const ctx = { action: FORCE_PUSH };
  const res = resolveViaInstinct(ctx, [instinct('force push', 0.5, 'PROCEED')], { threshold: 0 });
  assert.equal(res, null, 'threshold=0 must not defeat the irreversible invariant');
});
