import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { selectScrutiny } from '../lib/scrutiny.js';

// dangerous-corpus.test.js — the F16 "dangerous changes ALWAYS get full
// scrutiny" guard (design §4 fail-safe scrutiny).
//
// Each fixture is a REAL unified-diff snippet touching a high-risk marker:
// auth bypass, SQL injection, payment logic, or a destructive migration. Every
// one must route — through lib/scrutiny.js -> lib/risk-matrix.js — to
// tier === 'full' AND board === 'full'. Not even an LLM classifierHint that
// tries to downscope to 'trivial' may lower it. This is the corpus that fails
// loudly the moment right-sizing could ever let a dangerous change slip through
// on a cheap collapsed review.

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, 'fixtures', 'dangerous');

function loadDiff(name) {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

const CORPUS = [
  { label: 'auth bypass', file: 'auth-bypass.diff' },
  { label: 'SQL injection', file: 'sql-injection.diff' },
  { label: 'payment logic', file: 'payment-logic.diff' },
  { label: 'destructive migration', file: 'destructive-migration.diff' },
];

for (const { label, file } of CORPUS) {
  test(`dangerous corpus: ${label} routes to full tier + full board`, () => {
    const diff = loadDiff(file);
    const out = selectScrutiny(diff, null, null);
    assert.equal(out.tier, 'full', `${label} must be tier=full`);
    assert.equal(out.board, 'full', `${label} must be board=full`);
  });

  test(`dangerous corpus: ${label} cannot be downscoped by a classifierHint`, () => {
    const diff = loadDiff(file);
    // Hostile hint: the LLM claims this dangerous change is trivial.
    const out = selectScrutiny(diff, 'trivial', null);
    assert.equal(out.tier, 'full', `${label} must resist downscope`);
    assert.equal(out.board, 'full', `${label} must resist downscope`);
  });

  test(`dangerous corpus: ${label} is never logged as a downscope`, () => {
    const diff = loadDiff(file);
    const logged = [];
    selectScrutiny(diff, null, (rec) => logged.push(rec));
    assert.equal(logged.length, 0, `${label} (full) must not be logged as a downscope`);
  });
}
