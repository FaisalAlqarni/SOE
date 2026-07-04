import fs from 'node:fs';

/**
 * lib/firewall-return.js — the CONTEXT FIREWALL validator (addresses
 * adversarial finding F12).
 *
 * A delegated worker runs in its own isolated git worktree as a subagent and
 * writes its FULL output to a shared scratch path OUTSIDE the worktree. It then
 * returns to the orchestrator only a compact envelope:
 *
 *     { path, summary, confidence }
 *
 * The full output never enters the orchestrator's context window — only this
 * tiny handle does. That is the firewall: it keeps a worker's noise (and any
 * prompt-injection payload buried in its output) out of the orchestrator.
 *
 * But a worker is an UNTRUSTED subagent. Its envelope may be hallucinated: a
 * path that does not exist, a confidence that is missing / out of range / not
 * even a number, or an empty summary. The orchestrator MUST therefore validate
 * the envelope before trusting it. `parse()` is that gate.
 *
 * Convention: reject-by-throw. Any violation throws an Error with a message
 * naming the offending field ("confidence", "summary", "path", "input",
 * "JSON"), so a caller can `try/catch` and route the worker to a retry.
 *
 * On success it returns a NORMALIZED object with EXACTLY the three known keys —
 * any extra keys a worker tried to smuggle in are dropped, so nothing beyond
 * {path, summary, confidence} ever reaches the orchestrator.
 */

// A firewall summary is meant to be a 3-line handle, not a report. Allow a
// little slack, but reject a wall of text trying to tunnel context past the
// firewall.
const MAX_SUMMARY_LINES = 6;

/**
 * Validate and normalize a worker's firewall return envelope.
 *
 * @param {object|string} input - An already-parsed envelope object, OR a JSON
 *   string encoding one.
 * @returns {{ path: string, summary: string, confidence: number }} The
 *   normalized envelope containing exactly these three keys.
 * @throws {Error} If input is not an object/valid-JSON-object, or if any of
 *   path (must exist), summary (non-empty, ≤ a few lines), or confidence
 *   (number in [0,1]) is invalid.
 */
export function parse(input) {
  const envelope = coerceToObject(input);

  // --- path: must be a non-empty string that resolves on disk --------------
  if (typeof envelope.path !== 'string' || envelope.path.length === 0) {
    throw new Error('firewall return invalid: "path" must be a non-empty string');
  }
  if (!fs.existsSync(envelope.path)) {
    throw new Error(
      `firewall return invalid: "path" does not exist on disk: ${envelope.path}`,
    );
  }

  // --- summary: non-empty string of at most a few lines --------------------
  if (typeof envelope.summary !== 'string' || envelope.summary.trim().length === 0) {
    throw new Error('firewall return invalid: "summary" must be a non-empty string');
  }
  if (envelope.summary.split('\n').length > MAX_SUMMARY_LINES) {
    throw new Error(
      `firewall return invalid: "summary" exceeds ${MAX_SUMMARY_LINES} lines ` +
        '(it is a handle, not a report — write full output to the scratch path)',
    );
  }

  // --- confidence: a real number in [0, 1] ---------------------------------
  // Reject NaN and numeric STRINGS: only a genuine finite number is trusted.
  if (
    typeof envelope.confidence !== 'number' ||
    !Number.isFinite(envelope.confidence) ||
    envelope.confidence < 0 ||
    envelope.confidence > 1
  ) {
    throw new Error(
      'firewall return invalid: "confidence" must be a number in [0, 1]',
    );
  }

  // Normalize: return exactly the three known keys, dropping any extras.
  return {
    path: envelope.path,
    summary: envelope.summary,
    confidence: envelope.confidence,
  };
}

/**
 * Coerce `input` to a plain object, parsing JSON strings. Rejects null,
 * arrays, and non-object primitives, and malformed JSON strings.
 *
 * @param {object|string} input
 * @returns {object}
 */
function coerceToObject(input) {
  let value = input;

  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      throw new Error('firewall return invalid: malformed JSON string');
    }
  }

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(
      'firewall return invalid: input must be an object or a JSON object string',
    );
  }

  return value;
}
