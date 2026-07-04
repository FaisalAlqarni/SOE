import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Ledger parser -----------------------------------------------------------
//
// Resolution F3 (completeness): every data row in the ECC merge ledger must
// carry a disposition in {KEEP, MERGE, DROP, ADOPT}. No row may remain `TODO`
// or blank. This module both parses the ledger and enforces that gate.

const VALID = new Set(['KEEP', 'MERGE', 'DROP', 'ADOPT']);

const LEDGER = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'docs',
  'plans',
  'ecc-merge-ledger-full.md',
);

/**
 * Parse a markdown ledger into data rows.
 *
 * A data row is a pipe-delimited table line whose first cell is a skill name
 * (lowercase alnum/dash) — this deliberately excludes the header row
 * (`| skill | ...`) and the `| --- | ... |` separator, and ignores all prose
 * (so the word "TODO" appearing in a paragraph never counts as a row).
 *
 * @param {string} text markdown source
 * @returns {{ skill: string, disposition: string }[]}
 */
export function parseLedger(text) {
  const rows = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    // Split into cells and drop the empty leading/trailing artifacts.
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 3) continue;
    const skill = cells[0];
    const disposition = cells[2];
    // Skill-name gate: excludes the "---" separator row.
    if (!/^[a-z0-9][a-z0-9-]*$/.test(skill)) continue;
    // Header gate: the header's third cell is the literal "disposition".
    if (skill === 'skill' && disposition === 'disposition') continue;
    rows.push({ skill, disposition });
  }
  return rows;
}

// --- Tests -------------------------------------------------------------------

test('ledger has the full 277-skill inventory', () => {
  const rows = parseLedger(readFileSync(LEDGER, 'utf8'));
  assert.equal(rows.length, 277, `expected 277 ledger rows, found ${rows.length}`);
});

test('completeness gate: every row has a disposition in {KEEP,MERGE,DROP,ADOPT}', () => {
  const rows = parseLedger(readFileSync(LEDGER, 'utf8'));
  const undispositioned = rows.filter((r) => !VALID.has(r.disposition));
  assert.equal(
    undispositioned.length,
    0,
    `undispositioned rows (TODO/blank/invalid): ${undispositioned
      .map((r) => `${r.skill}=${r.disposition || '<blank>'}`)
      .join(', ')}`,
  );
});

test('completeness gate: no row is left as TODO', () => {
  const rows = parseLedger(readFileSync(LEDGER, 'utf8'));
  const todos = rows.filter((r) => r.disposition === 'TODO');
  assert.equal(todos.length, 0, `rows still TODO: ${todos.map((r) => r.skill).join(', ')}`);
});

test('gate FAILS (RED) when any row is undispositioned — proves the guard bites', () => {
  const dir = mkdtempSync(join(tmpdir(), 'merge-complete-'));
  try {
    const fixture = [
      '| skill | concern | disposition | rationale |',
      '| --- | --- | --- | --- |',
      '| alpha |  | DROP | ok |',
      '| beta |  | TODO | not resolved |',
      '',
    ].join('\n');
    const p = join(dir, 'ledger.md');
    writeFileSync(p, fixture);

    const rows = parseLedger(readFileSync(p, 'utf8'));
    const bad = rows.filter((r) => !VALID.has(r.disposition));
    // The TODO row must be detected as undispositioned.
    assert.equal(bad.length, 1);
    assert.equal(bad[0].skill, 'beta');
    assert.equal(bad[0].disposition, 'TODO');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('parser ignores prose, header, and separator (no false rows)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'merge-complete-'));
  try {
    const fixture = [
      '# Title',
      '',
      'A paragraph that mentions TODO in prose must never count as a row.',
      '',
      '| skill | concern | disposition | rationale |',
      '| --- | --- | --- | --- |',
      '| gamma |  | ADOPT | net-new |',
      '',
    ].join('\n');
    const p = join(dir, 'ledger.md');
    writeFileSync(p, fixture);

    const rows = parseLedger(readFileSync(p, 'utf8'));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].skill, 'gamma');
    assert.equal(rows[0].disposition, 'ADOPT');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
