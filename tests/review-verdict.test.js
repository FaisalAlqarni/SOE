import { test } from 'node:test';
import assert from 'node:assert';

import { parseVerdict } from '../lib/review-verdict.js';

// review-verdict.test.js — FAIL-CLOSED parser for the machine review header:
//   LENS: <lens>
//   REVIEWER: <reviewer>
//   VERDICT: PASS|FAIL
//   BLOCKING: <n>
//
// An unreadable/missing header is NOT a pass — it FAILS closed.

function header({ lens = 'security', reviewer = 'soe:security-reviewer', verdict = 'PASS', blocking = 0 } = {}) {
  return `LENS: ${lens}\nREVIEWER: ${reviewer}\nVERDICT: ${verdict}\nBLOCKING: ${blocking}\n`;
}

test('clean PASS header parses to PASS with fields', () => {
  const out = parseVerdict(header());
  assert.equal(out.verdict, 'PASS');
  assert.equal(out.lens, 'security');
  assert.equal(out.reviewer, 'soe:security-reviewer');
  assert.equal(out.blocking, 0);
});

test('VERDICT: FAIL yields FAIL', () => {
  const out = parseVerdict(header({ verdict: 'FAIL' }));
  assert.equal(out.verdict, 'FAIL');
});

test('VERDICT: PASS but BLOCKING > 0 yields FAIL', () => {
  const out = parseVerdict(header({ verdict: 'PASS', blocking: 3 }));
  assert.equal(out.verdict, 'FAIL');
  assert.equal(out.blocking, 3);
});

test('free-text mentioning "critical" does NOT fail a clean review (no free-text scan)', () => {
  // The reviewer said VERDICT: PASS / BLOCKING: 0 — benign prose must not override it.
  assert.equal(parseVerdict(header() + '\nNo critical issues found; checked critical paths: none.\n').verdict, 'PASS');
  assert.equal(parseVerdict(header() + '\nThis is uncriticality-adjacent nonsense.\n').verdict, 'PASS');
});

test('criticality is signalled ONLY via the deliberate BLOCKING count, not prose', () => {
  // reviewer that finds a critical flaw must set BLOCKING (or VERDICT: FAIL)
  assert.equal(parseVerdict(header({ verdict: 'PASS', blocking: 2 })).verdict, 'FAIL');
  assert.equal(parseVerdict(header({ verdict: 'FAIL', blocking: 0 })).verdict, 'FAIL');
});

test('missing VERDICT line entirely yields FAIL + unparseable', () => {
  const out = parseVerdict('LENS: security\nREVIEWER: soe:security-reviewer\n');
  assert.equal(out.verdict, 'FAIL');
  assert.equal(out.reason, 'unparseable');
});

test('empty string yields FAIL + unparseable', () => {
  const out = parseVerdict('');
  assert.equal(out.verdict, 'FAIL');
  assert.equal(out.reason, 'unparseable');
});

test('BLOCKING defaults to 0 when absent', () => {
  const out = parseVerdict('LENS: code\nREVIEWER: soe:code-reviewer\nVERDICT: PASS\n');
  assert.equal(out.verdict, 'PASS');
  assert.equal(out.blocking, 0);
});

test('lens/reviewer parsed correctly for a non-security lens', () => {
  const out = parseVerdict(header({ lens: 'database', reviewer: 'soe:database-reviewer', verdict: 'PASS' }));
  assert.equal(out.lens, 'database');
  assert.equal(out.reviewer, 'soe:database-reviewer');
});
