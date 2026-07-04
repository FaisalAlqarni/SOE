import { test } from 'node:test';
import assert from 'node:assert';

import { buildCapabilityMap, resolveRole } from '../lib/capability-scan.js';

// discovery-fallback.test.js — role-routing + extras-absent fallback (design §6,
// resolution F13).
//
// soe-core is SELF-SUFFICIENT: with no packs installed the capability registry is
// empty, so `resolveRole` returns null for every review role and the loop MUST
// fall back to soe-core's GENERIC reviewer for that role. When a specialist pack
// IS installed, the same routing prefers the specialist. This suite proves both:
// core never hard-depends on packs, AND specialists are preferred when present.
//
// The `pickReviewer(map, role, coreGenerics)` helper models the loop's routing
// contract (documented in skills/capability-discovery/SKILL.md): return the
// discovered specialist if the registry has one, else the soe-core generic. It
// lives here (its own thin fallback rule over the pure capability-scan core).

// The soe-core generic agents that always exist — the guaranteed fallback so the
// engine runs with the extras absent. These are real agents under agents/.
const CORE_GENERICS = {
  'code-review': 'soe:code-reviewer',
  security: 'soe:security-reviewer',
  architecture: 'soe:architect',
  database: 'soe:database-reviewer',
  logging: 'soe:logging-reviewer',
};

/**
 * Route a review role to a provider: the best installed specialist for the role
 * if the capability map has one, else soe-core's generic. Never returns
 * undefined for a known role, which is exactly what "core never hard-depends on
 * a pack" means in code.
 */
function pickReviewer(map, role, coreGenerics = CORE_GENERICS) {
  const specialist = resolveRole(map, role);
  return specialist ? specialist : coreGenerics[role];
}

// The review roles soe-core must always be able to serve on its own.
const REQUIRED_REVIEW_ROLES = ['code-review', 'security', 'architecture'];

// ===========================================================================
// (1) EMPTY / extras-absent registry → resolveRole is null → fall back to the
//     soe-core generic. This is the crux of F13: core runs with packs absent.
// ===========================================================================

test('extras absent: resolveRole is null for every required review role', () => {
  const map = buildCapabilityMap([]); // no providers installed at all
  for (const role of REQUIRED_REVIEW_ROLES) {
    assert.equal(
      resolveRole(map, role),
      null,
      `with an empty registry, resolveRole(${role}) must be null`,
    );
  }
});

test('extras absent: pickReviewer falls back to the soe-core generic', () => {
  const map = buildCapabilityMap([]); // empty registry
  for (const role of REQUIRED_REVIEW_ROLES) {
    const chosen = pickReviewer(map, role);
    assert.equal(
      chosen,
      CORE_GENERICS[role],
      `role ${role} must fall back to its soe-core generic`,
    );
    // The fallback is a real, defined soe-core agent — never undefined/null.
    assert.ok(chosen, `fallback for ${role} must be defined (core is self-sufficient)`);
  }
});

// ===========================================================================
// (2) A specialist provider IS present for the role → pickReviewer returns the
//     specialist, not the generic. Packs, when installed, are preferred.
// ===========================================================================

test('specialist present: pickReviewer returns the specialist, not the generic', () => {
  // A pack contributes an explicit code-review specialist.
  const map = buildCapabilityMap([
    { name: 'go-code-reviewer', description: 'Comprehensive Go code review', role: 'code-review', kind: 'agent' },
  ]);

  const chosen = pickReviewer(map, 'code-review');
  assert.equal(chosen.name, 'go-code-reviewer', 'installed specialist is preferred');
  assert.notEqual(chosen, CORE_GENERICS['code-review'], 'must NOT be the core generic');
  // It was routed by its explicit tag (precise routing), not guessed from prose.
  assert.equal(chosen.match, 'tag');

  // A role WITHOUT a specialist still falls back — proves preference is per-role,
  // not all-or-nothing.
  assert.equal(
    pickReviewer(map, 'security'),
    CORE_GENERICS['security'],
    'a role with no specialist still uses the soe-core generic',
  );
});

test('specialist present via keyword (untagged) is also preferred over the generic', () => {
  // An untagged provider whose prose implies the role is still routed and
  // preferred over the core generic.
  const map = buildCapabilityMap([
    { name: 'my-security-scanner', description: 'scans for security vulnerabilities', kind: 'agent' },
  ]);
  const chosen = pickReviewer(map, 'security');
  assert.equal(chosen.name, 'my-security-scanner', 'keyword-matched specialist preferred');
  assert.equal(chosen.match, 'keyword');
});
