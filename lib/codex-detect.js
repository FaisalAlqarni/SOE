/**
 * lib/codex-detect.js — detection for the OPTIONAL `codex-peer` provider
 * (design §4.1/§6).
 *
 * Codex is an OPTIONAL, experimental "different-perspective peer": on high-stakes
 * problems soe can run Opus AND Codex on the SAME problem in parallel and merge
 * their outputs WITHOUT cross-contamination (see `soe:using-codex`). It is used
 * ONLY when actually available and is NEVER a hard dependency — when absent it is
 * SILENTLY SKIPPED and soe-core proceeds unchanged.
 *
 * Codex is considered available ONLY when BOTH facts hold:
 *   (1) the `codex` CLI binary is on PATH, AND
 *   (2) the `openai/codex-plugin-cc` plugin is installed.
 *
 * DESIGN SPLIT (unit-testability, mirrors lib/capability-scan.js):
 *   - `isCodexAvailable({ hasBinary, hasPlugin })` is a PURE boolean over the two
 *     INJECTED facts — no PATH scan, no fs, no plugin-registry read. This is the
 *     part the test drives with fixture facts so it never depends on a real
 *     codex install.
 *   - `probeCodex(env)` is a THIN, separate, best-effort real probe that gathers
 *     those two facts from the environment and feeds them to `isCodexAvailable`.
 *     It NEVER throws — any error while probing is treated as "not present" so
 *     the absent path stays a silent skip.
 */

import fs from 'node:fs';
import path from 'node:path';

/** True only for a real boolean `true` — junk/strings/1 are NOT a present fact. */
function isTrueFact(value) {
  return value === true;
}

/**
 * Pure availability check for the optional codex-peer provider.
 *
 * Available ONLY when BOTH injected facts are strictly `true`:
 *   - `hasBinary` — the `codex` CLI is on PATH
 *   - `hasPlugin` — the `openai/codex-plugin-cc` plugin is installed
 *
 * Missing / partial / non-boolean facts default to `false` (honest, never
 * optimistic). A `false` result is the caller's cue to SILENTLY SKIP codex —
 * this function does not throw.
 *
 * @param {{hasBinary?: boolean, hasPlugin?: boolean}} [facts]
 * @returns {boolean}
 */
function isCodexAvailable(facts) {
  if (!facts || typeof facts !== 'object') return false;
  return isTrueFact(facts.hasBinary) && isTrueFact(facts.hasPlugin);
}

// ---------------------------------------------------------------------------
// Thin, best-effort real probe — separate from the pure core above.
// Never throws: any failure is reported as "absent" so codex is skipped, not
// erroring. Kept injectable (env override) so callers/tests stay deterministic.
// ---------------------------------------------------------------------------

/** Is an executable named `codex` present on the given PATH? (best-effort) */
function binaryOnPath(pathEnv) {
  if (typeof pathEnv !== 'string' || !pathEnv) return false;
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      try {
        if (fs.existsSync(path.join(dir, `codex${ext}`))) return true;
      } catch {
        /* ignore — treat as not found on this dir */
      }
    }
  }
  return false;
}

/**
 * Best-effort probe of the real environment for the two codex facts, then the
 * pure `isCodexAvailable` verdict over them. NEVER throws.
 *
 * Injectable for determinism/testing:
 *   - `env.PATH` — PATH string to scan for the `codex` binary.
 *   - `env.hasPlugin` — pre-resolved boolean: is `openai/codex-plugin-cc`
 *     installed? (Plugin-registry lookup is host-specific; callers that know
 *     the answer inject it. Unknown => omit => treated as absent.)
 *   - `env.hasBinary` — optional override for the binary fact (skips PATH scan).
 *
 * @param {{PATH?: string, hasBinary?: boolean, hasPlugin?: boolean}} [env]
 * @returns {{available: boolean, hasBinary: boolean, hasPlugin: boolean}}
 */
function probeCodex(env = process.env) {
  const e = env && typeof env === 'object' ? env : {};
  let hasBinary = false;
  let hasPlugin = false;
  try {
    hasBinary = isTrueFact(e.hasBinary) ? true : binaryOnPath(e.PATH);
    hasPlugin = isTrueFact(e.hasPlugin);
  } catch {
    // Any probing error => absent => silent skip. Never surface an exception.
    hasBinary = false;
    hasPlugin = false;
  }
  return { available: isCodexAvailable({ hasBinary, hasPlugin }), hasBinary, hasPlugin };
}

export { isCodexAvailable, probeCodex };
