import { test } from 'node:test';
import assert from 'node:assert';

import { resolveViaInstinct, shouldEscalate } from '../lib/escalation.js';

// escalation-flow.test.js — the escalation-learning DRIVER / integration test
// (design §3.3, adversarial resolution F11).
//
// escalation.test.js already unit-tests each lib/escalation.js primitive in
// isolation. THIS test simulates the orchestrator's actual decision path — the
// pre-check-then-escalate flow the soe-orchestrator + soe:escalation-learning
// skills describe — and proves the safety invariant holds in the INTEGRATION
// path, not merely in the unit:
//
//   Before escalating, the orchestrator calls resolveViaInstinct(ctx, instincts).
//     - a resolution  -> auto-resolve (no interruption); log "would have escalated"
//     - null          -> fall through to shouldEscalate(ctx) and, if true, escalate
//
// The load-bearing claim (F11): an IRREVERSIBLE action + a maximally-confident
// matching instinct STILL routes to confirm — resolveViaInstinct returns null AND
// shouldEscalate returns true — so learning can never wave an irreversible action
// through. The reversible case is the positive counterpart: a routine action +
// high-confidence instinct auto-resolves, modeling "fewer escalations over time".

/**
 * Faithful model of the orchestrator's escalation point (see soe-orchestrator
 * "Interaction modes / escalation" + soe:escalation-learning). Pre-check the
 * learned instincts; on a resolution, auto-resolve and record a
 * "would have escalated" decision-log entry; otherwise fall back to the
 * escalation decision.
 *
 * @returns {{ outcome: 'auto-resolved'|'escalated'|'proceeded',
 *             resolution: object|null, log: string[] }}
 */
function decisionPath(ctx, instincts) {
  const log = [];

  const resolution = resolveViaInstinct(ctx, instincts);
  if (resolution) {
    // Learned the human's judgment for this REVERSIBLE class — resolve it
    // ourselves and log instead of interrupting.
    log.push(
      `would have escalated: auto-resolved via instinct ` +
        `(confidence=${resolution.confidence}) -> ${resolution.resolution}`,
    );
    return { outcome: 'auto-resolved', resolution, log };
  }

  // No auto-resolution — fall through to the real escalation decision.
  if (shouldEscalate(ctx)) {
    return { outcome: 'escalated', resolution: null, log };
  }
  return { outcome: 'proceeded', resolution: null, log };
}

const REVERSIBLE = {
  type: 'edit',
  command: 'edit config file',
  description: 'bump a retry timeout',
};
const IRREVERSIBLE = {
  command: 'git push --force origin main',
  description: 'force push over the remote branch',
};

function instinct(match, confidence, resolution = 'PROCEED') {
  return { match, resolution, confidence };
}

// ===========================================================================
// THE INVARIANT, IN THE FLOW (F11): irreversible + max-confidence instinct
// still routes to CONFIRM.
// ===========================================================================

test('flow: IRREVERSIBLE action + high-confidence matching instinct STILL escalates', () => {
  const ctx = {
    action: IRREVERSIBLE,
    mode: 'autonomous-guardrailed',
    boundExhausted: false,
    judgmentGate: true,
  };
  // A perfect, maximally-confident instinct that WOULD resolve a reversible
  // action of this description...
  const instincts = [instinct('force push', 1.0, 'PROCEED')];

  // ...yet in the integration path the pre-check refuses it (returns null)...
  assert.equal(
    resolveViaInstinct(ctx, instincts),
    null,
    'irreversible must not be auto-resolved by the pre-check',
  );
  // ...and the escalation decision fires...
  assert.equal(
    shouldEscalate(ctx),
    true,
    'irreversible must escalate',
  );
  // ...so the driven flow routes to CONFIRM, never auto-resolve.
  const result = decisionPath(ctx, instincts);
  assert.equal(
    result.outcome,
    'escalated',
    'irreversible action must route to confirm even with a max-confidence instinct',
  );
  assert.equal(result.resolution, null);
  assert.deepEqual(result.log, [], 'no "would have escalated" auto-resolution logged');
});

test('flow: irreversible resists auto-resolution even at threshold 0 (invariant, not a threshold)', () => {
  const ctx = {
    action: IRREVERSIBLE,
    mode: 'autonomous-guardrailed',
    boundExhausted: false,
    judgmentGate: true,
  };
  // Lowering the threshold to 0 cannot defeat the irreversible gate — the
  // pre-check still returns null and the flow still escalates.
  assert.equal(
    resolveViaInstinct(ctx, [instinct('force push', 0.5, 'PROCEED')], { threshold: 0 }),
    null,
  );
  assert.equal(decisionPath(ctx, [instinct('force push', 0.5, 'PROCEED')]).outcome, 'escalated');
});

// ===========================================================================
// THE POSITIVE CASE: routine reversible action + high-confidence instinct
// auto-resolves (reduced escalation over time).
// ===========================================================================

test('flow: routine REVERSIBLE action + high-confidence instinct AUTO-RESOLVES (no escalation)', () => {
  const ctx = {
    action: REVERSIBLE,
    mode: 'autonomous-guardrailed',
    boundExhausted: false,
    judgmentGate: true, // in interactive mode this would escalate; learning absorbs it
  };
  const instincts = [instinct('edit config', 0.95, 'PROCEED')];

  const result = decisionPath(ctx, instincts);
  assert.equal(
    result.outcome,
    'auto-resolved',
    'a learned high-confidence reversible match should not interrupt the human',
  );
  assert.ok(result.resolution, 'expected a resolution');
  assert.equal(result.resolution.resolution, 'PROCEED');
  // And it is auditable: a "would have escalated" line was logged.
  assert.equal(result.log.length, 1);
  assert.match(result.log[0], /would have escalated/);
});

test('flow: reversible action with only a LOW-confidence instinct still escalates', () => {
  const ctx = {
    action: REVERSIBLE,
    mode: 'interactive',
    boundExhausted: false,
    judgmentGate: true,
  };
  // Below threshold -> no auto-resolution -> normal escalation path.
  const result = decisionPath(ctx, [instinct('edit config', 0.2, 'PROCEED')]);
  assert.equal(result.outcome, 'escalated');
  assert.deepEqual(result.log, []);
});
