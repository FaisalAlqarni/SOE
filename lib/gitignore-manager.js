import fs from 'node:fs';

/**
 * lib/gitignore-manager.js — writes precise ignore rules into a USER PROJECT's
 * `.gitignore` so soe's state layer commits the DURABLE parts of its memory but
 * ignores the EPHEMERAL run-state (addresses adversarial finding F4).
 *
 * Design (§3.1/§4):
 *   - IGNORE only ephemeral run-state: per-run scratch dirs, transient
 *     worker-status files. These are recreated every run and must never be
 *     committed.
 *   - Do NOT ignore the durable memory: `docs/plans/` and the durable
 *     `.soe/tracks/{id}/*.md` + `state.json` remain trackable/committable so
 *     the orchestration engine's memory survives across sessions.
 *   - The rules live inside a clearly-delimited MANAGED BLOCK so the tool can
 *     rewrite them idempotently without touching the user's own lines.
 */

export const BEGIN_MARKER = '# >>> soe managed >>>';
export const END_MARKER = '# <<< soe managed <<<';

/**
 * The default ephemeral ignore set. ONLY transient run-state — nothing under
 * `docs/plans/` and nothing that would hide durable `.soe` track state.
 */
export const DEFAULT_IGNORE_PATTERNS = Object.freeze([
  // Per-run scratch: the working area for an in-flight run, recreated each run.
  '.soe/**/run/',
  // Global scratch area.
  '.soe/scratch/',
  // Transient per-worker heartbeat/status, rewritten constantly during a run.
  '.soe/**/worker-status.json',
]);

/**
 * Human-readable header placed at the top of the managed block.
 */
const MANAGED_HEADER =
  '# Managed by soe. Ephemeral run-state only — durable memory\n' +
  '# (docs/plans/, .soe/tracks/*/state.json + *.md) stays committable.\n' +
  '# Do not edit between these markers; regenerate with soe.';

/**
 * Strip an existing soe managed block (markers inclusive) from `text`.
 * Returns the user content with any managed block removed. Tolerant of the
 * block appearing anywhere in the file; if markers are malformed/absent the
 * text is returned unchanged.
 *
 * @param {string} text
 * @returns {string} user content without the managed block
 */
function stripManagedBlock(text) {
  const begin = text.indexOf(BEGIN_MARKER);
  if (begin === -1) return text;
  const endIdx = text.indexOf(END_MARKER, begin);
  if (endIdx === -1) return text;

  const before = text.slice(0, begin);
  // Cut through the end of the END_MARKER line (consume its trailing newline).
  let after = text.slice(endIdx + END_MARKER.length);
  if (after.startsWith('\n')) after = after.slice(1);

  return before + after;
}

/**
 * Render the managed block for the given patterns (no surrounding blank lines).
 *
 * @param {string[]} patterns
 * @returns {string}
 */
function renderManagedBlock(patterns) {
  const lines = [BEGIN_MARKER, MANAGED_HEADER, ...patterns, END_MARKER];
  return lines.join('\n');
}

/**
 * Apply soe's managed `.gitignore` block at `gitignorePath`.
 *
 * Reads the file if present, removes any pre-existing managed block, preserves
 * all user content verbatim, then appends a freshly-rendered managed block.
 * Idempotent: repeated calls with the same patterns produce byte-identical
 * output (no duplicate blocks). Ensures exactly one trailing newline.
 *
 * @param {string} gitignorePath - absolute or relative path to a `.gitignore`.
 * @param {{ patterns?: string[] }} [opts]
 * @returns {{ created: boolean, patterns: string[] }}
 */
export function applyGitignore(gitignorePath, opts = {}) {
  const patterns = opts.patterns ?? DEFAULT_IGNORE_PATTERNS;

  let existing = '';
  let created = true;
  if (fs.existsSync(gitignorePath)) {
    existing = fs.readFileSync(gitignorePath, 'utf8');
    created = false;
  }

  // Remove any prior managed block, then normalize the user portion so we never
  // accumulate blank lines across repeated runs.
  let userPart = stripManagedBlock(existing);
  // Trim trailing whitespace/newlines from the user portion; we re-add exactly
  // one separating newline below.
  userPart = userPart.replace(/\s*$/, '');

  const block = renderManagedBlock(patterns);

  let output;
  if (userPart.length === 0) {
    output = block + '\n';
  } else {
    output = userPart + '\n\n' + block + '\n';
  }

  fs.writeFileSync(gitignorePath, output);
  return { created, patterns: [...patterns] };
}
