import { test } from 'node:test';
import assert from 'node:assert';

import {
  classify,
  applyClassifierHint,
  blastRadius,
  hasRiskyPathMarker,
  TIERS,
} from '../lib/risk-matrix.js';

// risk-matrix.test.js — the deterministic, rule-based risk FLOOR
// (design §4 fail-safe scrutiny, resolution F16).
//
// This is the integrity-preserving floor for ceremony right-sizing. It is
// deterministic real code — NOT an LLM. `classify` scans a diff for HIGH-RISK
// markers and returns a tier ∈ {trivial, standard, full}; any marker (or a diff
// larger than the LOC threshold) forces the floor to 'full'. `applyClassifierHint`
// lets an LLM classifier only RAISE the tier above the floor, never lower it.
// `blastRadius` is an optional graphify hook that can raise the tier from a real
// dependency-impact signal, and silently no-ops when graphify is absent.
//
// PRIMARY diff shape (documented): a structured object
//   { files: [ { path, linesChanged, content? }, ... ] }
// A unified-diff STRING is ALSO accepted and parsed into that shape.

// --------------------------------------------------------------------------
// helper builders for the PRIMARY structured shape
// --------------------------------------------------------------------------
function diffOf(...files) {
  return { files };
}
function file(path, linesChanged = 5, content = '') {
  return { path, linesChanged, content };
}

// ==========================================================================
// tier vocabulary + ordering
// ==========================================================================

test('TIERS exposes the ordered tier vocabulary trivial < standard < full', () => {
  assert.deepEqual(TIERS, ['trivial', 'standard', 'full']);
});

// ==========================================================================
// classify — trivial / standard baselines
// ==========================================================================

test('classify: docs-only tiny diff -> trivial, no markers', () => {
  const out = classify(diffOf(file('docs/readme.md', 3), file('CHANGELOG.md', 2)));
  assert.equal(out.tier, 'trivial');
  assert.deepEqual(out.markers, []);
});

test('classify: small ordinary code change -> standard, no markers', () => {
  const out = classify(diffOf(file('src/util/format.js', 20, 'export function fmt() {}')));
  assert.equal(out.tier, 'standard');
  assert.deepEqual(out.markers, []);
});

// ==========================================================================
// classify — EVERY high-risk marker category must force the 'full' floor
// ==========================================================================

test('marker: auth path forces full', () => {
  const out = classify(diffOf(file('src/auth/login.js', 4)));
  assert.equal(out.tier, 'full');
  assert.ok(out.markers.includes('auth'), `markers were ${out.markers}`);
});

test('marker: authz (permissions/rbac) content forces full', () => {
  const out = classify(diffOf(file('src/access.js', 4, 'if (!hasPermission(user)) denyAuthorization();')));
  assert.equal(out.tier, 'full');
  assert.ok(out.markers.includes('authz'), `markers were ${out.markers}`);
});

test('marker: payment path forces full', () => {
  const out = classify(diffOf(file('src/billing/payment.js', 6)));
  assert.equal(out.tier, 'full');
  assert.ok(out.markers.includes('payment'), `markers were ${out.markers}`);
});

test('marker: crypto content forces full', () => {
  const out = classify(diffOf(file('src/token.js', 6, 'const h = crypto.createHmac("sha256", key);')));
  assert.equal(out.tier, 'full');
  assert.ok(out.markers.includes('crypto'), `markers were ${out.markers}`);
});

test('marker: secrets / .env forces full', () => {
  const out = classify(diffOf(file('.env', 2, 'API_SECRET=abc')));
  assert.equal(out.tier, 'full');
  assert.ok(out.markers.includes('secrets'), `markers were ${out.markers}`);
});

test('marker: SQL / migrations path forces full', () => {
  const out = classify(diffOf(file('db/migrations/0007_add_col.sql', 10, 'ALTER TABLE users ADD COLUMN x;')));
  assert.equal(out.tier, 'full');
  assert.ok(out.markers.includes('migrations'), `markers were ${out.markers}`);
});

test('marker: destructive deletion (DROP/DELETE) content forces full', () => {
  const out = classify(diffOf(file('db/cleanup.sql', 3, 'DROP TABLE accounts;')));
  assert.equal(out.tier, 'full');
  assert.ok(out.markers.includes('deletion'), `markers were ${out.markers}`);
});

test('marker: PII content forces full', () => {
  const out = classify(diffOf(file('src/user.js', 8, 'const ssn = user.socialSecurityNumber;')));
  assert.equal(out.tier, 'full');
  assert.ok(out.markers.includes('pii'), `markers were ${out.markers}`);
});

test('marker: prod config forces full', () => {
  const out = classify(diffOf(file('config/production.yaml', 4)));
  assert.equal(out.tier, 'full');
  assert.ok(out.markers.includes('prod-config'), `markers were ${out.markers}`);
});

test('marker: force-push content forces full', () => {
  const out = classify(diffOf(file('scripts/deploy.sh', 3, 'git push --force origin main')));
  assert.equal(out.tier, 'full');
  assert.ok(out.markers.includes('force-push'), `markers were ${out.markers}`);
});

test('marker: security-sensitive path (secrets dir) forces full', () => {
  const out = classify(diffOf(file('infra/secrets/keys.json', 2)));
  assert.equal(out.tier, 'full');
  assert.ok(out.markers.includes('secrets'), `markers were ${out.markers}`);
});

test('marker: LOC over threshold forces full even with no risky path', () => {
  const out = classify(diffOf(file('src/big.js', 250), file('src/big2.js', 120)));
  assert.equal(out.tier, 'full');
  assert.ok(out.markers.includes('loc'), `markers were ${out.markers}`);
});

test('marker: custom locThreshold is honored', () => {
  const small = classify(diffOf(file('src/x.js', 40)), { locThreshold: 100 });
  assert.equal(small.tier, 'standard');
  const big = classify(diffOf(file('src/x.js', 40)), { locThreshold: 30 });
  assert.equal(big.tier, 'full');
  assert.ok(big.markers.includes('loc'));
});

test('classify: multiple markers are all reported (deduped)', () => {
  const out = classify(
    diffOf(
      file('src/auth/session.js', 4, 'crypto.randomBytes(16)'),
      file('db/migrations/1.sql', 3, 'DROP TABLE tokens;'),
    ),
  );
  assert.equal(out.tier, 'full');
  for (const m of ['auth', 'crypto', 'migrations', 'deletion']) {
    assert.ok(out.markers.includes(m), `expected marker ${m}, got ${out.markers}`);
  }
  // no duplicates
  assert.equal(new Set(out.markers).size, out.markers.length);
});

// ==========================================================================
// classify — unified-diff STRING is also accepted
// ==========================================================================

test('classify: accepts a unified-diff string and detects path markers', () => {
  const diff = [
    'diff --git a/src/auth/login.js b/src/auth/login.js',
    '--- a/src/auth/login.js',
    '+++ b/src/auth/login.js',
    '@@ -1,2 +1,3 @@',
    '+function login() {}',
  ].join('\n');
  const out = classify(diff);
  assert.equal(out.tier, 'full');
  assert.ok(out.markers.includes('auth'));
});

test('classify: unified-diff string counts added/removed lines for the LOC floor', () => {
  const added = Array.from({ length: 40 }, (_, i) => `+line ${i}`).join('\n');
  const diff = [
    'diff --git a/src/big.js b/src/big.js',
    '--- a/src/big.js',
    '+++ b/src/big.js',
    '@@ -1,1 +1,40 @@',
    added,
  ].join('\n');
  const out = classify(diff, { locThreshold: 30 });
  assert.equal(out.tier, 'full');
  assert.ok(out.markers.includes('loc'));
});

test('classify: content markers only scan ADDED lines of a unified diff (removed DROP is not a signal)', () => {
  const diff = [
    'diff --git a/db/x.sql b/db/x.sql',
    '--- a/db/x.sql',
    '+++ b/db/x.sql',
    '@@ -1,2 +1,1 @@',
    '-DROP TABLE gone;',
    '+SELECT 1;',
  ].join('\n');
  const out = classify(diff);
  assert.ok(!out.markers.includes('deletion'), `removed line must not fire deletion, got ${out.markers}`);
});

// ==========================================================================
// classify — input guards
// ==========================================================================

test('classify: empty diff -> trivial', () => {
  assert.equal(classify(diffOf()).tier, 'trivial');
  assert.equal(classify('').tier, 'trivial');
});

test('classify: rejects a null/garbage input type', () => {
  assert.throws(() => classify(42), /diff|input|string|object/i);
  assert.throws(() => classify(null), /diff|input|string|object/i);
});

// ==========================================================================
// applyClassifierHint — may RAISE, may NEVER lower (both directions)
// ==========================================================================

test('hint CANNOT lower: full floor + trivial hint stays full', () => {
  assert.equal(applyClassifierHint('full', 'trivial'), 'full');
});

test('hint CANNOT lower: full floor + standard hint stays full', () => {
  assert.equal(applyClassifierHint('full', 'standard'), 'full');
});

test('hint CAN raise: trivial floor + full hint becomes full', () => {
  assert.equal(applyClassifierHint('trivial', 'full'), 'full');
});

test('hint CAN raise: trivial floor + standard hint becomes standard', () => {
  assert.equal(applyClassifierHint('trivial', 'standard'), 'standard');
});

test('hint CAN raise: standard floor + full hint becomes full', () => {
  assert.equal(applyClassifierHint('standard', 'full'), 'full');
});

test('hint no-op: standard floor + standard hint stays standard', () => {
  assert.equal(applyClassifierHint('standard', 'standard'), 'standard');
});

test('hint: absent/undefined hint keeps the floor', () => {
  assert.equal(applyClassifierHint('standard', undefined), 'standard');
  assert.equal(applyClassifierHint('full', null), 'full');
});

test('hint: invalid tier values are rejected', () => {
  assert.throws(() => applyClassifierHint('bogus', 'full'), /tier|floor|invalid/i);
  assert.throws(() => applyClassifierHint('full', 'bogus'), /tier|hint|invalid/i);
});

test('hint property: result is always >= floor for every combination', () => {
  for (const floor of TIERS) {
    for (const hint of TIERS) {
      const r = applyClassifierHint(floor, hint);
      assert.ok(
        TIERS.indexOf(r) >= TIERS.indexOf(floor),
        `hint(${floor},${hint})=${r} must never be below the floor`,
      );
    }
  }
});

// ==========================================================================
// blastRadius — optional graphify hook: raises with a real impact signal,
// silent no-op when graphify absent (does NOT throw)
// ==========================================================================

const someFiles = ['src/util/format.js'];

test('blastRadius: absent graphify (undefined) is a no-op, returns null, does not throw', () => {
  assert.doesNotThrow(() => blastRadius(someFiles, undefined));
  assert.equal(blastRadius(someFiles, undefined), null);
});

test('blastRadius: null graphify is a no-op, returns null', () => {
  assert.equal(blastRadius(someFiles, null), null);
});

test('blastRadius: large impact raises to full', () => {
  const graphify = {
    getPrImpact: () => ({ impactedCount: 999, impactedFiles: [], touchesSecurityPath: false }),
  };
  const sig = blastRadius(someFiles, graphify);
  assert.ok(sig, 'a signal object must be returned');
  assert.equal(sig.raiseTo, 'full');
  assert.ok(/impact|blast|large/i.test(sig.reason));
});

test('blastRadius: security-path-touching impact raises to full even if small', () => {
  const graphify = {
    getPrImpact: () => ({ impactedCount: 2, impactedFiles: ['src/auth/x.js'], touchesSecurityPath: true }),
  };
  const sig = blastRadius(someFiles, graphify);
  assert.equal(sig.raiseTo, 'full');
  assert.ok(/security/i.test(sig.reason));
});

test('blastRadius: small, non-security impact returns no raise signal (null)', () => {
  const graphify = {
    getPrImpact: () => ({ impactedCount: 1, impactedFiles: ['src/other.js'], touchesSecurityPath: false }),
  };
  assert.equal(blastRadius(someFiles, graphify), null);
});

test('blastRadius: a throwing/broken graphify provider fails safe (no throw, null)', () => {
  const graphify = { getPrImpact: () => { throw new Error('mcp down'); } };
  assert.doesNotThrow(() => blastRadius(someFiles, graphify));
  assert.equal(blastRadius(someFiles, graphify), null);
});

test('blastRadius: honors a custom impactThreshold option', () => {
  const graphify = {
    getPrImpact: () => ({ impactedCount: 10, impactedFiles: [], touchesSecurityPath: false }),
  };
  assert.equal(blastRadius(someFiles, graphify, { impactThreshold: 100 }), null);
  assert.equal(blastRadius(someFiles, graphify, { impactThreshold: 5 }).raiseTo, 'full');
});

// ==========================================================================
// hasRiskyPathMarker — path-only predicate (no content) reused by lib/hitl.js
// ==========================================================================

test('hasRiskyPathMarker: matches auth/authz/payment/secrets/migrations/pii/prod-config/crypto paths', () => {
  assert.equal(hasRiskyPathMarker('app/controllers/auth/sessions_controller.rb'), true);
  assert.equal(hasRiskyPathMarker('app/services/payment/charge.rb'), true);
  assert.equal(hasRiskyPathMarker('db/migrate/20260101_add_users.rb'), true);
  assert.equal(hasRiskyPathMarker('src/permissions/rbac.js'), true);
  assert.equal(hasRiskyPathMarker('infra/secrets/keys.json'), true);
  assert.equal(hasRiskyPathMarker('config/production.yaml'), true);
  assert.equal(hasRiskyPathMarker('src/crypto/cipher.js'), true);
});

test('hasRiskyPathMarker: content-only markers (deletion, force-push) never match on path alone', () => {
  assert.equal(hasRiskyPathMarker('scripts/deploy-force-push.sh'), false);
});

test('hasRiskyPathMarker: ordinary paths return false', () => {
  assert.equal(hasRiskyPathMarker('src/app.js'), false);
  assert.equal(hasRiskyPathMarker('README.md'), false);
});
