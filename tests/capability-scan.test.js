import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildCapabilityMap,
  resolveRole,
  enumerateProviders,
} from '../lib/capability-scan.js';

// capability-scan.test.js — cross-plugin capability discovery (design §6).
//
// soe is a HOST orchestrator: at run start it scans whatever skills/agents any
// installed plugin provides and builds a `role → [providers]` map so routing can
// prefer the best-matching installed specialist and fall back to soe-core's
// generic when none exists (packs are purely additive; core never hard-depends
// on them).
//
// Two matching strategies, and the RANKING RULE between them is the crux of this
// suite:
//   (1) TAGGED / PRECISE — a provider carrying an explicit `role:`/`domain:` tag
//       is matched EXACTLY to that role. This is authoritative.
//   (2) UNTAGGED / BEST-EFFORT — a provider with no tag is matched by scanning
//       its name + description for role keywords ("review"→code-review,
//       "security"→security, "go"/"golang"→go, "test"/"e2e"→testing, ...).
//   RANK: a tagged/precise match always OUTRANKS a keyword-only match for the
//   same role, so a specialist that declares its role wins over one merely
//   guessed from prose.
//
// The CORE (`buildCapabilityMap`/`resolveRole`) is a PURE function of a provider
// ARRAY — no fs — so it is unit-testable in isolation. `enumerateProviders` is a
// thin, separate fs helper that reads real SKILL.md/agent frontmatter into that
// same provider array.

// ===========================================================================
// buildCapabilityMap — pure core over a provider array
// ===========================================================================

test('buildCapabilityMap returns a Map keyed by role', () => {
  const map = buildCapabilityMap([
    { name: 'go-reviewer', description: 'Reviews Go code', role: 'go' },
  ]);
  assert.ok(map instanceof Map, 'expected a Map');
  assert.ok(map.has('go'), 'go role should be present');
});

test('a role:-tagged provider is matched PRECISELY to that role', () => {
  const map = buildCapabilityMap([
    { name: 'sec-auditor', description: 'general purpose helper', role: 'security', kind: 'agent' },
  ]);
  const sec = map.get('security');
  assert.ok(Array.isArray(sec) && sec.length === 1, 'security role has one provider');
  assert.equal(sec[0].name, 'sec-auditor');
  // It was matched by its TAG, not by scanning prose (the description has no
  // security keyword at all), which proves precise tag routing.
  assert.equal(sec[0].match, 'tag');
});

test('a domain:-tagged provider is matched PRECISELY to that domain role', () => {
  const map = buildCapabilityMap([
    { name: 'flutter-reviewer', description: 'anything', domain: 'flutter', kind: 'agent' },
  ]);
  const flutter = map.get('flutter');
  assert.ok(flutter, 'flutter domain present');
  assert.equal(flutter[0].name, 'flutter-reviewer');
  assert.equal(flutter[0].match, 'tag');
});

test('an UNTAGGED provider is matched BEST-EFFORT by description/name keywords', () => {
  const map = buildCapabilityMap([
    { name: 'my-helper', description: 'Use when you want a thorough code review of a diff' },
  ]);
  const cr = map.get('code-review');
  assert.ok(cr && cr.length === 1, 'code-review role inferred from keywords');
  assert.equal(cr[0].name, 'my-helper');
  assert.equal(cr[0].match, 'keyword');
});

test('best-effort matches a domain keyword (golang) from the name', () => {
  const map = buildCapabilityMap([
    { name: 'golang-guru', description: 'writes idiomatic services' },
  ]);
  assert.ok(map.get('go'), 'go role inferred from "golang" in name');
  assert.equal(map.get('go')[0].match, 'keyword');
});

test('best-effort infers testing from "e2e" and security from "security"', () => {
  const map = buildCapabilityMap([
    { name: 'e2e-runner', description: 'runs end to end journeys' },
    { name: 'shield', description: 'scans for security vulnerabilities' },
  ]);
  assert.ok(map.get('testing'), 'testing inferred from e2e');
  assert.ok(map.get('security'), 'security inferred from keyword');
});

test('an untagged provider matching NO keyword lands in no role', () => {
  const map = buildCapabilityMap([
    { name: 'zzz', description: 'a completely unrelated widget with no role words' },
  ]);
  // It should not have been force-fit into any role bucket.
  for (const providers of map.values()) {
    assert.ok(!providers.some((p) => p.name === 'zzz'), 'zzz must not be routed anywhere');
  }
});

// --- RANKING: tagged/precise OUTRANKS keyword-only for the same role --------

test('a tagged provider OUTRANKS a keyword-only provider for the same role', () => {
  const map = buildCapabilityMap([
    // keyword-only candidate for security
    { name: 'loose-scanner', description: 'does a security sweep' },
    // authoritative tagged candidate for security
    { name: 'tagged-auditor', description: 'no role words here', role: 'security' },
  ]);
  const sec = map.get('security');
  assert.equal(sec.length, 2, 'both candidates present for security');
  // The tagged one must be ranked first (best provider).
  assert.equal(sec[0].name, 'tagged-auditor', 'tagged provider ranks first');
  assert.equal(sec[0].match, 'tag');
  assert.equal(sec[1].name, 'loose-scanner');
  assert.equal(sec[1].match, 'keyword');
});

// ===========================================================================
// resolveRole — best provider for a role, or null
// ===========================================================================

test('resolveRole returns the highest-ranked (tagged) provider', () => {
  const map = buildCapabilityMap([
    { name: 'loose', description: 'a code review helper' },
    { name: 'precise', description: 'x', role: 'code-review' },
  ]);
  const best = resolveRole(map, 'code-review');
  assert.equal(best.name, 'precise', 'tagged provider wins resolveRole');
});

test('resolveRole returns null for an unknown role', () => {
  const map = buildCapabilityMap([
    { name: 'go-reviewer', description: 'reviews go', role: 'go' },
  ]);
  assert.equal(resolveRole(map, 'nonexistent-role'), null);
});

test('resolveRole returns null when the map has no providers at all', () => {
  const map = buildCapabilityMap([]);
  assert.equal(resolveRole(map, 'security'), null);
});

test('buildCapabilityMap tolerates a non-array input by returning an empty map', () => {
  const map = buildCapabilityMap(null);
  assert.ok(map instanceof Map);
  assert.equal(map.size, 0);
});

// ===========================================================================
// enumerateProviders — thin fs helper over skills/*/SKILL.md + agents/*.md
// ===========================================================================

function mkPlugin() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'soe-cap-'));
  fs.mkdirSync(path.join(root, 'skills', 'go-review'), { recursive: true });
  fs.mkdirSync(path.join(root, 'agents'), { recursive: true });

  fs.writeFileSync(
    path.join(root, 'skills', 'go-review', 'SKILL.md'),
    [
      '---',
      'name: go-review',
      'description: Comprehensive Go code review',
      'domain: go',
      '---',
      '# body',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(root, 'agents', 'security-reviewer.md'),
    [
      '---',
      'name: security-reviewer',
      'description: Audits changes for vulnerabilities',
      'role: security',
      '---',
      '# body',
    ].join('\n'),
  );

  // An untagged agent — only name/description, no role/domain.
  fs.writeFileSync(
    path.join(root, 'agents', 'plain.md'),
    ['---', 'name: plain', 'description: runs end to end tests', '---', '# body'].join('\n'),
  );

  return root;
}

test('enumerateProviders reads SKILL.md + agents/*.md frontmatter into a provider array', () => {
  const root = mkPlugin();
  try {
    const providers = enumerateProviders([root]);
    const byName = Object.fromEntries(providers.map((p) => [p.name, p]));

    // skill picked up with kind + domain tag
    assert.ok(byName['go-review'], 'skill enumerated');
    assert.equal(byName['go-review'].kind, 'skill');
    assert.equal(byName['go-review'].domain, 'go');

    // tagged agent picked up with role
    assert.ok(byName['security-reviewer'], 'agent enumerated');
    assert.equal(byName['security-reviewer'].kind, 'agent');
    assert.equal(byName['security-reviewer'].role, 'security');

    // untagged agent has no role/domain
    assert.ok(byName['plain'], 'untagged agent enumerated');
    assert.ok(!byName['plain'].role && !byName['plain'].domain, 'no tags on plain');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('enumerateProviders output feeds buildCapabilityMap end-to-end', () => {
  const root = mkPlugin();
  try {
    const map = buildCapabilityMap(enumerateProviders([root]));
    // tagged skill/agent routed precisely
    assert.equal(resolveRole(map, 'go').name, 'go-review');
    assert.equal(resolveRole(map, 'security').name, 'security-reviewer');
    // untagged agent best-effort routed to testing via "end to end"
    assert.equal(resolveRole(map, 'testing').name, 'plain');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('enumerateProviders returns [] for missing / non-existent dirs', () => {
  assert.deepEqual(enumerateProviders(['/no/such/dir/soe-xyz']), []);
  assert.deepEqual(enumerateProviders([]), []);
  assert.deepEqual(enumerateProviders(null), []);
});
