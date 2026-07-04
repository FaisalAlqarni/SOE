import { test } from 'node:test';
import assert from 'node:assert';

import { isCodexAvailable } from '../lib/codex-detect.js';

// codex-detect.test.js — optional `codex-peer` provider detection (design §4.1/§6).
//
// Codex is an OPTIONAL, experimental "different-perspective peer" used for
// high-stakes parallel synthesis (Opus + Codex on the same problem, merged
// without cross-contamination) — but ONLY if it is actually available. It is
// NEVER a hard dependency: when absent it is SILENTLY SKIPPED.
//
// `isCodexAvailable({ hasBinary, hasPlugin })` is a PURE boolean over INJECTED
// facts — no PATH lookup, no filesystem, no plugin registry read — so these
// tests are deterministic and do NOT depend on a real codex install.
//
// The contract is a logical AND: codex is available ONLY when BOTH
//   (1) the `codex` CLI binary is on PATH, AND
//   (2) the `openai/codex-plugin-cc` plugin is installed.
// Anything short of both → false → the caller treats it as "skip" (no throw).

// ===========================================================================
// BOTH required — available:true ONLY when binary AND plugin are present
// ===========================================================================

test('available ONLY when BOTH the codex binary AND the plugin are present', () => {
  assert.equal(
    isCodexAvailable({ hasBinary: true, hasPlugin: true }),
    true,
    'binary + plugin => available',
  );
});

test('binary present but plugin absent => NOT available', () => {
  assert.equal(isCodexAvailable({ hasBinary: true, hasPlugin: false }), false);
});

test('plugin present but binary absent => NOT available', () => {
  assert.equal(isCodexAvailable({ hasBinary: false, hasPlugin: true }), false);
});

test('neither present => NOT available', () => {
  assert.equal(isCodexAvailable({ hasBinary: false, hasPlugin: false }), false);
});

// ===========================================================================
// Honest / defensive: missing or junk facts are treated as FALSE, never true.
// A partially-known world must never be optimistically reported as available.
// ===========================================================================

test('missing facts default to NOT available (never optimistic)', () => {
  assert.equal(isCodexAvailable({}), false, 'empty facts => false');
  assert.equal(isCodexAvailable(), false, 'no argument => false');
  assert.equal(isCodexAvailable(null), false, 'null facts => false');
});

test('non-boolean truthy junk does not count as a present fact', () => {
  // Only a real boolean true means "present"; strings/1/objects are not facts.
  assert.equal(isCodexAvailable({ hasBinary: 'yes', hasPlugin: 'yes' }), false);
  assert.equal(isCodexAvailable({ hasBinary: 1, hasPlugin: 1 }), false);
});

// ===========================================================================
// Absent → silently skipped: the caller treats false as "skip" — NO throw.
// This encodes the "never a hard dependency" posture as an executable check.
// ===========================================================================

test('absent codex is SILENTLY SKIPPED — false, and callers do not throw', () => {
  const facts = { hasBinary: false, hasPlugin: false };

  // isCodexAvailable itself must not throw on the absent path.
  assert.doesNotThrow(() => isCodexAvailable(facts));

  // A representative caller: "use codex-peer only if available, else skip".
  // The skip branch must be reachable WITHOUT an exception.
  let skipped = false;
  function maybeUseCodexPeer(f) {
    if (!isCodexAvailable(f)) {
      skipped = true; // silent skip — core proceeds unchanged
      return 'skipped';
    }
    return 'used-codex-peer';
  }

  assert.equal(maybeUseCodexPeer(facts), 'skipped');
  assert.equal(skipped, true, 'absent => the silent-skip branch ran, no throw');
});

test('present codex is used by the same caller (branch symmetry)', () => {
  function maybeUseCodexPeer(f) {
    return isCodexAvailable(f) ? 'used-codex-peer' : 'skipped';
  }
  assert.equal(
    maybeUseCodexPeer({ hasBinary: true, hasPlugin: true }),
    'used-codex-peer',
  );
});
