import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// setup.test.js — `/setup` scaffolds the soe state layer INSIDE a user project
// (design §3.1). The reliability-critical part is a real, tested helper:
//   runSetup(projectDir, { model? })
// which must:
//   (a) create .soe/config.json with the correct defaults
//       (mode autonomous-guardrailed, max_fix_cycles 5, max_plan_revisions 3),
//   (b) create the .soe/tracks/ directory (empty, per-track state added later),
//   (c) reuse the P2.3 applyGitignore so the project's .gitignore gets the
//       managed ephemeral-ignore block (NOT reinvented here),
//   (d) be IDEMPOTENT — running twice does not clobber an existing config nor
//       duplicate the managed gitignore block,
//   (e) write .soe/setup_state.json for resumable/idempotent setup.

import { runSetup } from '../lib/setup.js';
import {
  BEGIN_MARKER,
  DEFAULT_IGNORE_PATTERNS,
} from '../lib/gitignore-manager.js';

/** Fresh temp project dir per test; auto-removed. */
function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'soe-setup-'));
}

/** Count non-overlapping occurrences of `needle` in `haystack`. */
function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

// --- (a) config.json with correct defaults ------------------------------------

test('(a) creates .soe/config.json with autonomous-guardrailed defaults + caps', () => {
  const dir = tmpProject();
  try {
    runSetup(dir);

    const cfgPath = path.join(dir, '.soe', 'config.json');
    assert.ok(fs.existsSync(cfgPath), '.soe/config.json created');

    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    assert.strictEqual(cfg.mode, 'autonomous-guardrailed', 'default mode');
    assert.strictEqual(cfg.max_fix_cycles, 5, 'fix cap = 5');
    assert.strictEqual(cfg.max_plan_revisions, 3, 'plan-revision cap = 3');
    assert.strictEqual(cfg.minimal_code, true, 'minimal_code on by default');
    assert.strictEqual(
      cfg.over_engineering_lens,
      'on-demand',
      'over_engineering_lens on-demand by default (not run in pipeline)',
    );

    assert.ok(cfg.models && typeof cfg.models === 'object', 'models block present');
    // Tiers are pinned as latest FULL ids (not aliases — aliases lag).
    assert.strictEqual(cfg.models.reasoner, 'claude-opus-4-8', 'reasoner default');
    assert.strictEqual(cfg.models.worker, 'claude-sonnet-5', 'worker default');
    assert.strictEqual(cfg.models.cheap, 'claude-haiku-4-5', 'cheap default');
    assert.strictEqual(cfg.models.strategist, 'claude-fable-5', 'strategist default');
    assert.strictEqual(cfg.fable_enabled, true, 'Fable gate on by default');
    // orchestrator defaults to the session model; unset falls back sensibly.
    assert.ok(
      typeof cfg.models.orchestrator === 'string' && cfg.models.orchestrator.length > 0,
      'orchestrator model recorded',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('(a2) orchestrator model is taken from the session model when provided', () => {
  const dir = tmpProject();
  try {
    runSetup(dir, { model: 'opus-4-8' });
    const cfg = JSON.parse(
      fs.readFileSync(path.join(dir, '.soe', 'config.json'), 'utf8'),
    );
    assert.strictEqual(cfg.models.orchestrator, 'opus-4-8', 'session model recorded');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- (b) tracks/ dir ----------------------------------------------------------

test('(b) creates an empty .soe/tracks/ directory', () => {
  const dir = tmpProject();
  try {
    runSetup(dir);
    const tracks = path.join(dir, '.soe', 'tracks');
    assert.ok(fs.existsSync(tracks), '.soe/tracks/ created');
    assert.ok(fs.statSync(tracks).isDirectory(), '.soe/tracks/ is a directory');
    assert.deepStrictEqual(fs.readdirSync(tracks), [], 'tracks/ starts empty');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- (c) reuses applyGitignore ------------------------------------------------

test('(c) applies the managed gitignore block via applyGitignore', () => {
  const dir = tmpProject();
  try {
    runSetup(dir);
    const gi = path.join(dir, '.gitignore');
    assert.ok(fs.existsSync(gi), '.gitignore created');

    const out = fs.readFileSync(gi, 'utf8');
    assert.ok(out.includes(BEGIN_MARKER), 'managed block present');
    // The ephemeral run-state patterns from the shared manager are written —
    // proving runSetup reuses applyGitignore rather than reinventing the logic.
    for (const pat of DEFAULT_IGNORE_PATTERNS) {
      assert.ok(out.includes(pat), `contains managed pattern: ${pat}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('(c2) preserves pre-existing user .gitignore lines', () => {
  const dir = tmpProject();
  try {
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n*.log\n');
    runSetup(dir);
    const out = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8');
    assert.ok(out.includes('node_modules/'), 'user line preserved');
    assert.ok(out.includes('*.log'), 'user line preserved');
    assert.ok(out.includes(BEGIN_MARKER), 'managed block appended');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- (d) idempotency ----------------------------------------------------------

test('(d) is idempotent: second run does not clobber config or duplicate gitignore', () => {
  const dir = tmpProject();
  try {
    runSetup(dir);

    // Simulate a user edit to config.json — a re-run must NOT overwrite it.
    const cfgPath = path.join(dir, '.soe', 'config.json');
    const edited = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    edited.mode = 'interactive';
    edited.custom_field = 'user-owned';
    fs.writeFileSync(cfgPath, JSON.stringify(edited, null, 2));

    // Re-run setup.
    runSetup(dir);

    const after = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    assert.strictEqual(after.mode, 'interactive', 'user config edit preserved');
    assert.strictEqual(after.custom_field, 'user-owned', 'user field preserved');

    // gitignore managed block appears exactly once.
    const gi = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8');
    assert.strictEqual(count(gi, BEGIN_MARKER), 1, 'exactly one managed block');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('(d2) result reports created=false on the second run', () => {
  const dir = tmpProject();
  try {
    const first = runSetup(dir);
    assert.strictEqual(first.configCreated, true, 'config created on first run');

    const second = runSetup(dir);
    assert.strictEqual(second.configCreated, false, 'config preserved on second run');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- (e) setup_state.json -----------------------------------------------------

test('(e) writes .soe/setup_state.json with a last_step marker', () => {
  const dir = tmpProject();
  try {
    runSetup(dir);
    const ssPath = path.join(dir, '.soe', 'setup_state.json');
    assert.ok(fs.existsSync(ssPath), 'setup_state.json created');

    const ss = JSON.parse(fs.readFileSync(ssPath, 'utf8'));
    assert.ok(
      typeof ss.last_step === 'string' && ss.last_step.length > 0,
      'last_step recorded',
    );
    assert.strictEqual(ss.last_step, 'done', 'setup completed to done');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- return contract ----------------------------------------------------------

test('runSetup reports the paths it scaffolded', () => {
  const dir = tmpProject();
  try {
    const res = runSetup(dir);
    assert.ok(res.soeDir.endsWith('.soe'), 'reports .soe dir');
    assert.ok(res.configPath.endsWith(path.join('.soe', 'config.json')), 'reports config path');
    assert.ok(res.tracksDir.endsWith(path.join('.soe', 'tracks')), 'reports tracks dir');
    assert.deepStrictEqual(res.ignorePatterns, [...DEFAULT_IGNORE_PATTERNS], 'reports ignore patterns');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
