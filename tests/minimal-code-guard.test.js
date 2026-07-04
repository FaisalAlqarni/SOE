import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

// minimal-code-guard.test.js — proves the #502 mitigation: the minimal-code
// (lazy / shortest-working-diff) discipline is bounded to IMPLEMENTATION work
// and never leaks into review / security / eval / spec agents, and is never
// injected globally by the SessionStart hook so it can't reach every subagent.
//
// The assertions are PROGRAMMATIC, not brittle string matches:
//   1. Content presence — the skill actually contains its load-bearing parts,
//      so an empty-bodied-but-valid-frontmatter skill fails.
//   2. Implementation-only guard — the review/security/eval/spec file SET is
//      ENUMERATED from the filesystem (fs.readdirSync), so a future reviewer
//      agent is covered automatically. None may instruct ITSELF to be lazy.
//      Positive control: the worker-template DOES reference soe:minimal-code.
//   3. SessionStart audit — the hook + the skill it injects (using-soe) must
//      not carry a global "apply minimal-code / be lazy" directive.

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const AGENTS = join(ROOT, 'agents');
const SKILLS = join(ROOT, 'skills');
const HOOKS = join(ROOT, 'hooks');

const read = (p) => readFileSync(p, 'utf8');

// ---------------------------------------------------------------------------
// Imperative-lazy detector
// ---------------------------------------------------------------------------
// Matches a directive that tells a file to apply the minimal-code / lazy
// discipline to ITS OWN work. This is the leak we forbid in reviewers.
//
// It matches:
//   - "apply soe:minimal-code"  / "apply minimal-code" / "apply the minimal-code"
//   - "be minimal" / "be lazy" / "being lazy"
//   - "minimize your <thing>"      (minimize your review / analysis / output …)
//   - "minimal-code" appearing as an APPLIED instruction, i.e. "apply … "
//
// It deliberately does NOT match:
//   - a mere reference to the skill, e.g. "see the `soe:minimal-code` skill"
//     or "for the deletion philosophy … see soe:minimal-code" (the over-eng
//     agents cite it as their hunting target, not a self-directive).
//   - the word "reducible" / "minimal" used to DESCRIBE what the reviewer hunts.
//
// Each alternative is documented inline.
const IMPERATIVE_LAZY = new RegExp(
  [
    // "apply [the] [soe:]minimal-code" — an explicit instruction to apply it.
    'apply\\s+(?:the\\s+)?(?:soe:)?minimal[- ]code',
    // "be minimal" / "be lazy" / "being lazy" — self-directed laziness.
    'be(?:ing)?\\s+(?:minimal|lazy)\\b',
    // "minimize your <noun>" — minimize your review/analysis/output/etc.
    'minimize\\s+your\\b',
    // "apply … lazy" style: "apply the lazy discipline" to own work.
    'apply\\s+(?:the\\s+)?lazy\\b',
  ].join('|'),
  'i'
);

/** Enumerate files under `dir` matching a set of predicates (basename tests). */
function globAgents(patterns) {
  const files = readdirSync(AGENTS).filter((f) => f.endsWith('.md'));
  const out = new Set();
  for (const f of files) {
    for (const p of patterns) {
      if (p.test(f)) {
        out.add(join(AGENTS, f));
        break;
      }
    }
  }
  return [...out];
}

/** Enumerate the review/security/eval/spec agent+skill set from the FS. */
function reviewSet() {
  // Agents matched by name substrings — enumerated live so a future
  // *-reviewer / *-security / *-audit agent is automatically covered.
  const agents = globAgents([/review/i, /security/i, /audit/i, /^architect\.md$/, /^devils-advocate\.md$/]);

  // Skills matched by directory pattern.
  const skillDirs = readdirSync(SKILLS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const skillMatch = (name) =>
    name.startsWith('eval-') ||
    name === 'adversarial-review' ||
    name === 'board-of-directors' ||
    name === 'spec-reconciliation';
  const skills = skillDirs
    .filter(skillMatch)
    .map((name) => join(SKILLS, name, 'SKILL.md'))
    .filter(existsSync);

  return [...agents, ...skills];
}

// The two over-engineering agents legitimately CITE soe:minimal-code (it is
// their hunting target). They are excluded ONLY from the "must not mention
// minimal-code at all" expectation — they are STILL checked for the
// imperative-lazy directive below.
const OVER_ENG = /over-engineering-(reviewer|auditor)\.md$/;

// ===========================================================================
// Group 1 — Content presence (an empty/wrong skill must fail)
// ===========================================================================
test('minimal-code SKILL.md contains its load-bearing content', () => {
  const p = join(SKILLS, 'minimal-code', 'SKILL.md');
  assert.ok(existsSync(p), 'skills/minimal-code/SKILL.md must exist');
  const text = read(p);
  const lower = text.toLowerCase();

  // Body must be substantial — guards against an empty-bodied skill that has
  // only valid frontmatter.
  const body = text.replace(/^---[\s\S]*?---/, '').trim();
  assert.ok(body.length > 400, 'skill body is suspiciously short / empty');

  // (a) the 7-rung ladder.
  assert.ok(
    /ladder/i.test(text) && /stop at the first rung/i.test(text),
    'missing the ladder / "stop at the first rung"'
  );

  // (b) the guardrails.
  assert.ok(
    /when not to be lazy/i.test(text) || /never lazy/i.test(text),
    'missing the "when NOT to be lazy" / "never lazy" guardrails'
  );

  // (c) the CODE-ONLY exclusion — "never minimize" AND documentation/docs.
  assert.ok(
    /never minimize/i.test(text) && /(documentation|docs)/i.test(lower),
    'missing the code-only exclusion ("never minimize" + documentation)'
  );

  // (d) the marker convention.
  assert.ok(
    /soe:minimal-code/.test(text),
    'missing the soe:minimal-code marker convention'
  );
});

// ===========================================================================
// Group 2 — Implementation-only guard (#502), programmatic
// ===========================================================================
test('review/security/eval/spec set is enumerated from the filesystem', () => {
  const set = reviewSet();
  // Sanity: the glob must actually resolve real files, else the guard below is
  // vacuously true. We expect at least the known reviewers + eval skills.
  assert.ok(set.length >= 6, `review set too small (${set.length}) — glob broke`);
  for (const f of set) assert.ok(existsSync(f), `enumerated file missing: ${f}`);
});

test('no reviewer/security/eval/spec file instructs ITSELF to be lazy (#502)', () => {
  const offenders = [];
  for (const f of reviewSet()) {
    const text = read(f);
    if (IMPERATIVE_LAZY.test(text)) {
      offenders.push(`${basename(f)} → ${IMPERATIVE_LAZY.exec(text)[0]}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these review/security/eval/spec files carry a self-directed lazy directive (leak): ${offenders.join('; ')}`
  );
});

test('non-over-eng reviewer/eval files do not even mention minimal-code', () => {
  // Precision: the over-engineering reviewer/auditor MAY cite soe:minimal-code
  // (their hunting target). Every OTHER file in the review set must not mention
  // it at all — a reviewer citing the minimal-code discipline is a smell.
  const offenders = [];
  for (const f of reviewSet()) {
    if (OVER_ENG.test(f)) continue; // legitimate mention — excluded here only.
    if (/minimal[- ]code/i.test(read(f))) offenders.push(basename(f));
  }
  assert.deepEqual(
    offenders,
    [],
    `non-over-eng review files mention minimal-code: ${offenders.join(', ')}`
  );
});

test('over-engineering agents are checked but only CITE minimal-code, not self-apply it', () => {
  const overEng = readdirSync(AGENTS)
    .filter((f) => OVER_ENG.test(f))
    .map((f) => join(AGENTS, f));
  assert.ok(overEng.length >= 1, 'expected over-engineering agent(s) to exist');
  for (const f of overEng) {
    const text = read(f);
    // They DO cite it (positive: they hunt over-engineering).
    assert.ok(/minimal[- ]code/i.test(text), `${basename(f)} should cite minimal-code`);
    // But they must NOT be told to be lazy in their OWN analysis.
    assert.ok(
      !IMPERATIVE_LAZY.test(text),
      `${basename(f)} is told to be lazy in its own analysis (leak): ${IMPERATIVE_LAZY.exec(text)?.[0]}`
    );
  }
});

test('worker-template references soe:minimal-code (positive control)', () => {
  const p = join(SKILLS, 'soe-workers', 'worker-template.md');
  assert.ok(existsSync(p), 'worker-template.md must exist');
  const text = read(p);
  assert.ok(
    /soe:minimal-code/.test(text),
    'worker-template must reference soe:minimal-code — implementation workers apply the discipline'
  );
});

// ===========================================================================
// Group 3 — SessionStart-hook audit (the leak path the review flagged)
// ===========================================================================
test('SessionStart hook does not globally inject a lazy directive', () => {
  const candidates = [
    join(HOOKS, 'session-start.sh'),
    join(HOOKS, 'session-start.js'),
    join(SKILLS, 'using-soe', 'SKILL.md'), // the skill the .sh hook injects
  ].filter(existsSync);

  assert.ok(
    candidates.some((p) => basename(p) === 'session-start.sh'),
    'session-start.sh must exist — it is the injecting hook'
  );

  const offenders = [];
  for (const p of candidates) {
    const text = read(p);
    if (IMPERATIVE_LAZY.test(text)) {
      offenders.push(`${basename(p)} → ${IMPERATIVE_LAZY.exec(text)[0]}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `SessionStart injection path carries a global lazy directive (would reach every subagent incl. reviewers): ${offenders.join('; ')}`
  );
});

test('using-soe may LIST minimal-code but not globally command laziness', () => {
  const p = join(SKILLS, 'using-soe', 'SKILL.md');
  assert.ok(existsSync(p), 'using-soe SKILL.md must exist');
  const text = read(p);
  // Listing the skill as available is fine (no assertion forbids a bare mention);
  // what is forbidden is a global imperative to be lazy.
  assert.ok(
    !IMPERATIVE_LAZY.test(text),
    `using-soe globally commands laziness: ${IMPERATIVE_LAZY.exec(text)?.[0]}`
  );
});
