import { test } from 'node:test';
import assert from 'node:assert';

import { selectScrutiny } from '../lib/scrutiny.js';

// scrutiny.test.js — routed fail-safe scrutiny (design §4, resolution F7/F16).
//
// lib/scrutiny.js is the ONLY sanctioned path for ceremony right-sizing. It
// routes every decision through lib/risk-matrix.js so a downscope can never
// bypass the deterministic floor, maps the resulting tier → a board mode
// ('collapsed' | 'full'), and LOGS every non-full selection so downscoping is
// always auditable.
//
// selectScrutiny(diff, classifierHint, logger, { graphify } = {})
//   -> { tier, board }   board ∈ 'collapsed' | 'full'
//
// DOWNSCOPE-LOGGING RULE (the one implemented here):
//   A downscope entry is logged whenever the FINAL tier is NOT 'full' — i.e.
//   whenever the run is not getting full scrutiny. Every such (auditable)
//   decision calls logger(record) exactly once with a structured record.
//   A 'full' selection is never logged (it is the safe outcome, nothing to
//   audit). A null/undefined logger is tolerated and never crashes.

// --------------------------------------------------------------------------
// helper builders for the PRIMARY structured diff shape
// --------------------------------------------------------------------------
function diffOf(...files) {
  return { files };
}
function file(path, linesChanged = 5, content = '') {
  return { path, linesChanged, content };
}

// ==========================================================================
// tier → board mapping + full scrutiny on markers
// ==========================================================================

test('markers -> full tier + full board (thorough review)', () => {
  const out = selectScrutiny(
    diffOf(file('src/auth/login.js', 10, 'function login(){ /* jwt */ }')),
    null,
    null,
  );
  assert.equal(out.tier, 'full');
  assert.equal(out.board, 'full');
});

test('docs-only diff -> trivial tier + collapsed board', () => {
  const out = selectScrutiny(
    diffOf(file('docs/readme.md', 3), file('CHANGELOG.md', 2)),
    null,
    null,
  );
  assert.equal(out.tier, 'trivial');
  assert.equal(out.board, 'collapsed');
});

test('ordinary small code change -> standard tier + collapsed board', () => {
  const out = selectScrutiny(
    diffOf(file('src/util/format.js', 20, 'export function fmt() {}')),
    null,
    null,
  );
  assert.equal(out.tier, 'standard');
  assert.equal(out.board, 'collapsed');
});

// ==========================================================================
// classifierHint is raise-only: it can never lower a 'full' floor
// ==========================================================================

test('a classifierHint of "trivial" cannot lower a full floor', () => {
  const out = selectScrutiny(
    diffOf(file('src/auth/login.js', 10, 'function login(){ /* jwt */ }')),
    'trivial', // LLM tries to downscope a risky change — must be refused
    null,
  );
  assert.equal(out.tier, 'full');
  assert.equal(out.board, 'full');
});

test('a classifierHint can RAISE a standard floor to full', () => {
  const logged = [];
  const out = selectScrutiny(
    diffOf(file('src/util/format.js', 20, 'export function fmt() {}')),
    'full',
    (rec) => logged.push(rec),
  );
  assert.equal(out.tier, 'full');
  assert.equal(out.board, 'full');
  // raised to full -> no downscope entry
  assert.equal(logged.length, 0);
});

// ==========================================================================
// downscope logging: every non-full selection is recorded exactly once
// ==========================================================================

test('non-full selection produces exactly one structured logger entry', () => {
  const logged = [];
  const out = selectScrutiny(
    diffOf(file('src/util/format.js', 20, 'export function fmt() {}')),
    null,
    (rec) => logged.push(rec),
  );

  assert.equal(out.tier, 'standard');
  assert.equal(logged.length, 1);

  const rec = logged[0];
  assert.equal(rec.tier, 'standard');
  assert.equal(rec.board, 'collapsed');
  assert.ok('downscope' in rec && rec.downscope === true);
  assert.ok(Array.isArray(rec.markers));
  assert.equal(typeof rec.summary, 'string');
  assert.ok(rec.summary.length > 0);
});

test('trivial (docs-only) selection is also logged as a downscope', () => {
  const logged = [];
  selectScrutiny(diffOf(file('docs/readme.md', 3)), null, (rec) => logged.push(rec));
  assert.equal(logged.length, 1);
  assert.equal(logged[0].tier, 'trivial');
  assert.equal(logged[0].board, 'collapsed');
});

test('a full selection is NOT logged (nothing to audit)', () => {
  const logged = [];
  const out = selectScrutiny(
    diffOf(file('src/auth/login.js', 10, 'function login(){ /* jwt */ }')),
    null,
    (rec) => logged.push(rec),
  );
  assert.equal(out.tier, 'full');
  assert.equal(logged.length, 0);
});

// ==========================================================================
// null / absent logger never crashes
// ==========================================================================

test('null logger on a non-full selection does not throw', () => {
  assert.doesNotThrow(() => {
    const out = selectScrutiny(diffOf(file('docs/readme.md', 3)), null, null);
    assert.equal(out.board, 'collapsed');
  });
});

test('undefined logger on a non-full selection does not throw', () => {
  assert.doesNotThrow(() => {
    selectScrutiny(diffOf(file('src/util/format.js', 20, 'x')), null, undefined);
  });
});

// ==========================================================================
// graphify blast-radius merges via risk-matrix (raise-only)
// ==========================================================================

test('graphify blast-radius on a security path raises a small diff to full', () => {
  const graphify = {
    getPrImpact: () => ({ impactedCount: 2, touchesSecurityPath: true }),
  };
  const logged = [];
  const out = selectScrutiny(
    diffOf(file('src/util/format.js', 20, 'export function fmt() {}')),
    null,
    (rec) => logged.push(rec),
    { graphify },
  );
  assert.equal(out.tier, 'full');
  assert.equal(out.board, 'full');
  assert.equal(logged.length, 0);
});

test('absent graphify is a no-op — floor stands and downscope is logged', () => {
  const logged = [];
  const out = selectScrutiny(
    diffOf(file('src/util/format.js', 20, 'x')),
    null,
    (rec) => logged.push(rec),
    {},
  );
  assert.equal(out.tier, 'standard');
  assert.equal(out.board, 'collapsed');
  assert.equal(logged.length, 1);
});

// ==========================================================================
// unified-diff STRING input is accepted (routed through risk-matrix parsing)
// ==========================================================================

test('accepts a unified-diff string and routes it through the risk matrix', () => {
  const diff = [
    'diff --git a/src/util/x.js b/src/util/x.js',
    '--- a/src/util/x.js',
    '+++ b/src/util/x.js',
    '@@ -0,0 +1,1 @@',
    '+export const x = 1;',
  ].join('\n');
  const out = selectScrutiny(diff, null, null);
  assert.equal(out.tier, 'standard');
  assert.equal(out.board, 'collapsed');
});
