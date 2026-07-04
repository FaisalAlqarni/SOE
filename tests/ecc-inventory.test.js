import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inventory } from '../scripts/ecc-inventory.mjs';

// --- Temp-fixture helpers ----------------------------------------------------

/**
 * Build a small fixture skills dir:
 *   <root>/alpha/SKILL.md          (skill)
 *   <root>/beta/SKILL.md           (skill)
 *   <root>/gamma/SKILL.md          (skill)
 *   <root>/not-a-skill/README.md   (no SKILL.md — excluded)
 *   <root>/delta/.claude/skills/mirror/SKILL.md  (nested mirror — excluded)
 * Returns the root dir.
 */
function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'ecc-inv-'));

  const writeSkill = (dir, fm) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), fm);
  };

  writeSkill(
    join(root, 'alpha'),
    '---\nname: alpha\ndescription: Alpha skill\nconcern: testing\n---\n# Alpha\n',
  );
  writeSkill(
    join(root, 'beta'),
    '---\nname: beta\ndescription: Beta skill\n---\n# Beta\n',
  );
  // gamma: no frontmatter name — falls back to directory name.
  writeSkill(join(root, 'gamma'), '# Gamma has no frontmatter\n');

  // A directory without a SKILL.md — must not be counted.
  mkdirSync(join(root, 'not-a-skill'), { recursive: true });
  writeFileSync(join(root, 'not-a-skill', 'README.md'), 'just docs\n');

  // A nested harness mirror — must NOT be counted because it is not a
  // *direct* subdir SKILL.md of the given root.
  writeSkill(
    join(root, 'delta', '.claude', 'skills', 'mirror'),
    '---\nname: mirror\ndescription: harness mirror copy\n---\n# Mirror\n',
  );
  // Note: `delta` itself has no direct SKILL.md, so delta is also excluded.

  return root;
}

// --- Tests -------------------------------------------------------------------

test('returns one entry per direct subdir bearing a SKILL.md', () => {
  const root = makeFixture();
  try {
    const entries = inventory(root);
    const names = entries.map((e) => e.name).sort();
    assert.deepEqual(names, ['alpha', 'beta', 'gamma']);
    assert.equal(entries.length, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('excludes dirs without SKILL.md and nested harness mirrors', () => {
  const root = makeFixture();
  try {
    const entries = inventory(root);
    const names = entries.map((e) => e.name);
    // not-a-skill has no SKILL.md.
    assert.ok(!names.includes('not-a-skill'));
    // the nested .claude/skills/mirror copy must not leak in.
    assert.ok(!names.includes('mirror'));
    // delta has no *direct* SKILL.md, only a nested one — excluded.
    assert.ok(!names.includes('delta'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('parses name, description, and concern from frontmatter', () => {
  const root = makeFixture();
  try {
    const entries = inventory(root);
    const byName = Object.fromEntries(entries.map((e) => [e.name, e]));

    assert.equal(byName.alpha.description, 'Alpha skill');
    assert.equal(byName.alpha.concern, 'testing');

    assert.equal(byName.beta.description, 'Beta skill');
    assert.equal(byName.beta.concern, undefined);

    // gamma has no frontmatter — name falls back to the directory name.
    assert.equal(byName.gamma.name, 'gamma');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('inventory count matches an independent direct-subdir SKILL.md recount', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  const root = makeFixture();
  try {
    const expected = readdirSync(root).filter((n) => {
      const d = join(root, n);
      return statSync(d).isDirectory() && existsSync(join(d, 'SKILL.md'));
    }).length;
    assert.equal(inventory(root).length, expected);
    assert.equal(expected, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
