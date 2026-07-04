import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// session-start.test.js — the SessionStart hook must emit a valid JSON
// context-injection payload that bootstraps the `soe` plugin.
//
// Design §4.1: the hook simply injects the `using-soe` bootstrap skill as
// additionalContext. It does NOT do any model detection — the model tiering
// topology is self-selected by the orchestrator from `soe:model-orchestration`.

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', 'hooks', 'session-start.sh');

/** Run the hook and parse its stdout as JSON. */
function runHook() {
  const stdout = execFileSync('bash', [HOOK], { encoding: 'utf8' });
  return { raw: stdout, json: JSON.parse(stdout) };
}

test('emits valid JSON', () => {
  const { json } = runHook();
  assert.ok(json && typeof json === 'object', 'output must parse to a JSON object');
});

test('carries a SessionStart hookSpecificOutput', () => {
  const { json } = runHook();
  assert.ok(json.hookSpecificOutput, 'missing hookSpecificOutput');
  assert.equal(
    json.hookSpecificOutput.hookEventName,
    'SessionStart',
    'hookEventName must be SessionStart',
  );
});

test('additionalContext bootstraps soe', () => {
  const { json } = runHook();
  const ctx = json.hookSpecificOutput.additionalContext;
  assert.equal(typeof ctx, 'string', 'additionalContext must be a string');
  assert.ok(ctx.includes('soe'), 'additionalContext must mention soe');
  assert.ok(ctx.includes('using-soe'), 'additionalContext must reference the using-soe bootstrap skill');
});
