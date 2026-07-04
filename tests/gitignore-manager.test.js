import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// gitignore-manager.test.js — the tool writes a precise MANAGED BLOCK into a
// user project's .gitignore so soe's state layer commits durable memory but
// ignores ephemeral run-state (addresses adversarial finding F4).
//
// Contract (lib/gitignore-manager.js):
//   applyGitignore(gitignorePath, { patterns? })
//     - creates .gitignore if absent
//     - preserves user lines outside the managed block verbatim
//     - the managed block is delimited by exact markers and is rewritten
//       in place (idempotent, never duplicated)
//     - DEFAULT_IGNORE_PATTERNS ignore ONLY ephemeral run-state, never
//       docs/plans/ or durable .soe state.

import {
  applyGitignore,
  DEFAULT_IGNORE_PATTERNS,
  BEGIN_MARKER,
  END_MARKER,
} from '../lib/gitignore-manager.js';

/** Fresh temp dir per test; auto-removed. */
function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'soe-gi-'));
}

/** Count non-overlapping occurrences of `needle` in `haystack`. */
function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

// --- Sanity on the pattern set itself -----------------------------------------

test('DEFAULT_IGNORE_PATTERNS ignore ephemeral run-state, not durable memory', () => {
  const p = DEFAULT_IGNORE_PATTERNS;
  // ephemeral present
  assert.ok(p.includes('.soe/**/run/'), 'must ignore ephemeral run/ dirs');
  assert.ok(p.includes('.soe/scratch/'), 'must ignore scratch');
  assert.ok(
    p.includes('.soe/**/worker-status.json'),
    'must ignore transient worker-status.json',
  );
  // durable memory MUST NOT be ignored
  for (const durable of p) {
    assert.ok(
      !durable.includes('docs/plans'),
      'must NOT ignore docs/plans/',
    );
    assert.ok(
      !/state\.json/.test(durable),
      'must NOT ignore durable state.json',
    );
    assert.ok(
      !/tracks\/.*\.md/.test(durable),
      'must NOT ignore durable track markdown',
    );
  }
});

// --- (a) creates .gitignore when absent ---------------------------------------

test('(a) creates .gitignore with a managed block of ephemeral patterns', () => {
  const dir = tmpDir();
  const gi = path.join(dir, '.gitignore');
  assert.ok(!fs.existsSync(gi), 'precondition: file absent');

  applyGitignore(gi);

  assert.ok(fs.existsSync(gi), 'file created');
  const out = fs.readFileSync(gi, 'utf8');

  assert.ok(out.includes(BEGIN_MARKER), 'has begin marker');
  assert.ok(out.includes(END_MARKER), 'has end marker');
  for (const pat of DEFAULT_IGNORE_PATTERNS) {
    assert.ok(out.includes(pat), `contains pattern: ${pat}`);
  }
  // Must NOT ignore durable memory: no ignore RULE (non-comment, non-marker,
  // non-blank line) may target docs/plans/ or durable .soe state.
  const ruleLines = out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
  for (const rule of ruleLines) {
    assert.ok(!rule.includes('docs/plans'), `rule must not ignore docs/plans: ${rule}`);
    assert.ok(!/state\.json/.test(rule), `rule must not ignore durable state.json: ${rule}`);
    assert.ok(
      !/tracks\/.*\.md/.test(rule),
      `rule must not ignore durable track markdown: ${rule}`,
    );
  }

  fs.rmSync(dir, { recursive: true, force: true });
});

// --- (b) preserves pre-existing user content ----------------------------------

test('(b) preserves pre-existing user lines verbatim, only manages its block', () => {
  const dir = tmpDir();
  const gi = path.join(dir, '.gitignore');
  const userContent =
    'node_modules/\n' +
    '*.log\n' +
    '\n' +
    '# my own comment\n' +
    'dist/\n';
  fs.writeFileSync(gi, userContent);

  applyGitignore(gi);
  const out = fs.readFileSync(gi, 'utf8');

  // every original line survives verbatim
  for (const line of ['node_modules/', '*.log', '# my own comment', 'dist/']) {
    assert.ok(out.includes(line), `preserved user line: ${line}`);
  }
  // and the managed block was added
  assert.ok(out.includes(BEGIN_MARKER), 'managed block appended');
  // user content still precedes the managed block
  assert.ok(
    out.indexOf('node_modules/') < out.indexOf(BEGIN_MARKER),
    'user content precedes managed block',
  );

  fs.rmSync(dir, { recursive: true, force: true });
});

// --- (c) idempotency ----------------------------------------------------------

test('(c) running twice produces no additional changes (no duplicate block)', () => {
  const dir = tmpDir();
  const gi = path.join(dir, '.gitignore');
  fs.writeFileSync(gi, 'node_modules/\n*.log\n');

  applyGitignore(gi);
  const first = fs.readFileSync(gi, 'utf8');

  applyGitignore(gi);
  const second = fs.readFileSync(gi, 'utf8');

  assert.strictEqual(second, first, 'second run is byte-identical to first');
  assert.strictEqual(count(second, BEGIN_MARKER), 1, 'exactly one begin marker');
  assert.strictEqual(count(second, END_MARKER), 1, 'exactly one end marker');

  fs.rmSync(dir, { recursive: true, force: true });
});

// --- (d) block is delimited by exact markers and rewritten in place -----------

test('(d) managed block is located by exact markers and rewritten in place', () => {
  const dir = tmpDir();
  const gi = path.join(dir, '.gitignore');
  fs.writeFileSync(gi, 'keep-me/\n');

  // First apply with a custom pattern set.
  applyGitignore(gi, { patterns: ['.soe/**/run/', '.soe/old-pattern/'] });
  let out = fs.readFileSync(gi, 'utf8');
  assert.ok(out.includes('.soe/old-pattern/'), 'custom pattern written');

  // Re-apply with a DIFFERENT pattern set: only the managed block changes.
  applyGitignore(gi, { patterns: ['.soe/**/run/', '.soe/new-pattern/'] });
  out = fs.readFileSync(gi, 'utf8');

  assert.ok(out.includes('keep-me/'), 'user line still present');
  assert.ok(out.includes('.soe/new-pattern/'), 'new pattern present');
  assert.ok(!out.includes('.soe/old-pattern/'), 'old pattern removed from block');
  assert.strictEqual(count(out, BEGIN_MARKER), 1, 'still exactly one block');

  fs.rmSync(dir, { recursive: true, force: true });
});

// --- newline hygiene ----------------------------------------------------------

test('newline hygiene: file ends with exactly one trailing newline', () => {
  const dir = tmpDir();
  const gi = path.join(dir, '.gitignore');
  // user content WITHOUT a trailing newline
  fs.writeFileSync(gi, 'node_modules/');

  applyGitignore(gi);
  const out = fs.readFileSync(gi, 'utf8');

  assert.ok(out.endsWith('\n'), 'ends with a newline');
  assert.ok(!out.endsWith('\n\n\n'), 'no runaway trailing newlines');
  // user line not glued to the managed block
  assert.ok(
    /node_modules\/\n/.test(out),
    'user line separated from managed block by a newline',
  );

  fs.rmSync(dir, { recursive: true, force: true });
});
