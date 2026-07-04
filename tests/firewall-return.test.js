import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// firewall-return.test.js — the CONTEXT FIREWALL validator (addresses
// adversarial finding F12).
//
// Delegated workers run in isolated worktrees and return ONLY a compact
// handle to the orchestrator: { path, summary, confidence }. The full worker
// output never enters the orchestrator's context — only this tiny envelope.
// Because a worker is an untrusted subagent, the orchestrator MUST validate
// that envelope before trusting it: a hallucinated path, a missing/degenerate
// confidence, or an empty summary must be REJECTED, not silently accepted.
//
// Contract (lib/firewall-return.js):
//   parse(input) -> { path, summary, confidence }
//     - input may be an already-parsed object OR a JSON string.
//     - path MUST resolve on disk (exist).
//     - summary MUST be a non-empty string of at most a few lines.
//     - confidence MUST be a number in [0, 1].
//     - returns a NORMALIZED { path, summary, confidence } on success.
//     - THROWS on any violation (reject-by-throw is the chosen convention).

import { parse } from '../lib/firewall-return.js';

/** Fresh temp dir per test; auto-removed. */
function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'soe-fw-'));
}

/** Create a real scratch file and return its absolute path. */
function scratchFile(dir, name = 'output.md', body = 'full worker output\n') {
  const p = path.join(dir, name);
  fs.writeFileSync(p, body);
  return p;
}

// --- Happy path ---------------------------------------------------------------

test('accepts a valid object return with an existing path and normalizes it', () => {
  const dir = tmpDir();
  const p = scratchFile(dir);

  const out = parse({
    path: p,
    summary: 'Implemented parse().\nAdded 6 reject cases.\nAll green.',
    confidence: 0.9,
  });

  assert.strictEqual(typeof out, 'object', 'returns an object');
  assert.strictEqual(out.path, p, 'path preserved');
  assert.strictEqual(out.confidence, 0.9, 'confidence preserved');
  assert.ok(
    typeof out.summary === 'string' && out.summary.length > 0,
    'summary is a non-empty string',
  );
  // Normalized shape: EXACTLY these three keys, nothing leaks through.
  assert.deepStrictEqual(
    Object.keys(out).sort(),
    ['confidence', 'path', 'summary'],
    'normalized to exactly {path, summary, confidence}',
  );

  fs.rmSync(dir, { recursive: true, force: true });
});

test('accepts a valid JSON STRING return', () => {
  const dir = tmpDir();
  const p = scratchFile(dir);

  const out = parse(
    JSON.stringify({ path: p, summary: 'ok', confidence: 0 }),
  );

  assert.strictEqual(out.path, p);
  assert.strictEqual(out.summary, 'ok');
  assert.strictEqual(out.confidence, 0, 'confidence at the [0,1] lower bound is valid');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('accepts confidence at both inclusive bounds 0 and 1', () => {
  const dir = tmpDir();
  const p = scratchFile(dir);

  assert.doesNotThrow(() => parse({ path: p, summary: 's', confidence: 0 }));
  assert.doesNotThrow(() => parse({ path: p, summary: 's', confidence: 1 }));

  fs.rmSync(dir, { recursive: true, force: true });
});

// --- Rejections (reject-by-throw) --------------------------------------------

test('REJECTS missing confidence', () => {
  const dir = tmpDir();
  const p = scratchFile(dir);
  assert.throws(() => parse({ path: p, summary: 's' }), /confidence/i);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('REJECTS confidence out of [0,1]', () => {
  const dir = tmpDir();
  const p = scratchFile(dir);
  assert.throws(() => parse({ path: p, summary: 's', confidence: 1.5 }), /confidence/i);
  assert.throws(() => parse({ path: p, summary: 's', confidence: -0.1 }), /confidence/i);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('REJECTS non-numeric confidence (including NaN and numeric strings)', () => {
  const dir = tmpDir();
  const p = scratchFile(dir);
  assert.throws(() => parse({ path: p, summary: 's', confidence: 'high' }), /confidence/i);
  assert.throws(() => parse({ path: p, summary: 's', confidence: '0.9' }), /confidence/i);
  assert.throws(() => parse({ path: p, summary: 's', confidence: NaN }), /confidence/i);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('REJECTS a non-existent path (hallucinated handle)', () => {
  const dir = tmpDir();
  const missing = path.join(dir, 'does-not-exist.md');
  assert.throws(
    () => parse({ path: missing, summary: 's', confidence: 0.5 }),
    /path/i,
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test('REJECTS empty or missing summary', () => {
  const dir = tmpDir();
  const p = scratchFile(dir);
  assert.throws(() => parse({ path: p, summary: '', confidence: 0.5 }), /summary/i);
  assert.throws(() => parse({ path: p, summary: '   ', confidence: 0.5 }), /summary/i);
  assert.throws(() => parse({ path: p, confidence: 0.5 }), /summary/i);
  assert.throws(() => parse({ path: p, summary: 42, confidence: 0.5 }), /summary/i);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('REJECTS a missing path field', () => {
  const dir = tmpDir();
  scratchFile(dir);
  assert.throws(() => parse({ summary: 's', confidence: 0.5 }), /path/i);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('REJECTS non-object input (null, number, array)', () => {
  assert.throws(() => parse(null), /input|object/i);
  assert.throws(() => parse(42), /input|object/i);
  assert.throws(() => parse([1, 2, 3]), /input|object/i);
});

test('REJECTS a malformed JSON string', () => {
  assert.throws(() => parse('{ not valid json '), /json/i);
});

test('REJECTS an over-long (many-line) summary', () => {
  const dir = tmpDir();
  const p = scratchFile(dir);
  const wall = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
  assert.throws(() => parse({ path: p, summary: wall, confidence: 0.5 }), /summary/i);
  fs.rmSync(dir, { recursive: true, force: true });
});
