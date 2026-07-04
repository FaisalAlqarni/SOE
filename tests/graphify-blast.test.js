import { test } from 'node:test';
import assert from 'node:assert';

import {
  classify,
  applyClassifierHint,
  blastRadius,
} from '../lib/risk-matrix.js';

// graphify-blast.test.js — F12 (design §6.1).
//
// Exercises lib/risk-matrix.js's OPTIONAL graphify blast-radius hook with a
// graphify-SHAPED mock (the `getPrImpact(files) -> { impactedCount,
// impactedFiles?, touchesSecurityPath? }` duck-typed contract that the real
// `using-graphify` provider adapts graphify's MCP `get_pr_impact` into).
//
// Two required assertions:
//   (1) MOCK graphify with a LARGE or security-touching impact -> blastRadius
//       returns a raise-to-full signal, AND merging it via applyClassifierHint
//       raises a would-be-`trivial` classification to `full`.
//   (2) graphify ABSENT (null) -> blastRadius returns null (no-op) and the
//       classification falls back to path/marker rules WITHOUT throwing.
//
// blastRadius already exists from P3.5 and its contract already matches this
// graphify shape, so NO change to lib/risk-matrix.js was needed for this test.

// A tiny, non-risky, docs-only diff — classify() alone would call this `trivial`.
// The graph's blast-radius is what must raise it to `full`.
const trivialDiff = { files: [{ path: 'docs/readme.md', linesChanged: 2, content: '' }] };
const changedPaths = ['docs/readme.md'];

// A graphify-shaped provider: exposes get_pr_impact as the getPrImpact method
// blastRadius calls, returning impact data.
function mockGraphify(impact) {
  return { getPrImpact: () => impact };
}

// ==========================================================================
// (1) MOCK graphify: LARGE / security-touching impact -> raise-to-full,
//     and merging raises a would-be-`trivial` classification to `full`.
// ==========================================================================

test('mock graphify LARGE impact -> blastRadius raises to full, lifts trivial -> full', () => {
  // Sanity: without the graph, this diff is trivial.
  const floor = classify(trivialDiff).tier;
  assert.equal(floor, 'trivial', 'precondition: diff is trivial by path/marker rules');

  // A large dependency reach (impacted files far above the default threshold).
  const graphify = mockGraphify({
    impactedCount: 300,
    impactedFiles: [],
    touchesSecurityPath: false,
  });

  const signal = blastRadius(changedPaths, graphify);
  assert.ok(signal, 'a large blast-radius must produce a raise signal');
  assert.equal(signal.raiseTo, 'full');
  assert.ok(/impact|blast|large/i.test(signal.reason), `reason was: ${signal.reason}`);

  // Merging the signal via applyClassifierHint raises trivial -> full.
  const merged = applyClassifierHint(floor, signal.raiseTo);
  assert.equal(merged, 'full', 'blast-radius signal must lift trivial to full');
});

test('mock graphify SECURITY-touching impact -> raises to full even when small', () => {
  const floor = classify(trivialDiff).tier;
  assert.equal(floor, 'trivial');

  // Small reach, but it touches a security-sensitive path in the graph.
  const graphify = mockGraphify({
    impactedCount: 2,
    impactedFiles: ['src/auth/session.js'],
    touchesSecurityPath: true,
  });

  const signal = blastRadius(changedPaths, graphify);
  assert.ok(signal, 'a security-touching blast-radius must produce a raise signal');
  assert.equal(signal.raiseTo, 'full');
  assert.ok(/security/i.test(signal.reason), `reason was: ${signal.reason}`);

  assert.equal(applyClassifierHint(floor, signal.raiseTo), 'full');
});

// ==========================================================================
// (2) graphify ABSENT (null): blastRadius is a no-op (null) and classification
//     falls back to path/marker rules WITHOUT throwing.
// ==========================================================================

test('graphify ABSENT (null) -> blastRadius no-op (null), classify falls back without throwing', () => {
  let floor;
  assert.doesNotThrow(() => {
    floor = classify(trivialDiff).tier;
  }, 'classification must not throw when graphify is absent');

  // No graph => blastRadius is a silent no-op.
  const signal = blastRadius(changedPaths, null);
  assert.equal(signal, null, 'absent graphify must be a no-op (null)');

  // With no raise signal, the tier stays exactly at the path/marker floor.
  const merged = signal ? applyClassifierHint(floor, signal.raiseTo) : floor;
  assert.equal(merged, floor);
  assert.equal(merged, 'trivial', 'fallback keeps the deterministic path/marker tier');
});

test('graphify ABSENT with a risky diff -> path/marker rules still fire (full), no throw', () => {
  // Even absent the graph, the deterministic floor must still catch risky paths.
  const riskyDiff = { files: [{ path: 'src/auth/login.js', linesChanged: 4, content: '' }] };

  let out;
  assert.doesNotThrow(() => {
    out = classify(riskyDiff);
  });
  assert.equal(out.tier, 'full');
  assert.ok(out.markers.includes('auth'));

  // graphify absent => no blast-radius contribution, floor is unchanged.
  assert.equal(blastRadius(['src/auth/login.js'], null), null);
});
