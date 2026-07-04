import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// git-guard.test.js — the PreToolUse git-guard hook must BLOCK destructive
// git operations and ALLOW normal ones.
//
// Contract (from hooks/block-destructive-git.js):
//   - Receives the tool call as JSON on stdin:
//       { "tool_name": "Bash", "tool_input": { "command": "<cmd>" } }
//   - Block mechanism: non-zero exit code (1). Allow: exit code 0.
//     (There is no {"decision":"block"} JSON output — the block signal is the
//      exit code plus a human-readable stderr message.)

const GUARD = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'hooks',
  'block-destructive-git.js',
);

/** Drive the guard with a Bash tool-call payload; return its exit status. */
function runGuard(command) {
  const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
  const res = spawnSync('node', [GUARD], { input: payload, encoding: 'utf8' });
  return res;
}

// --- Blocked (destructive) operations -----------------------------------------

const BLOCKED = [
  'git push --force origin main',
  'git push -f origin main',
  'git push --force-with-lease origin main',
  'git reset --hard HEAD~1',
  'git clean -f .',
  'git branch -D feature',
  'git rebase main',
];

for (const cmd of BLOCKED) {
  test(`blocks destructive: ${cmd}`, () => {
    const res = runGuard(cmd);
    assert.notEqual(res.status, 0, `expected non-zero exit (block) for: ${cmd}`);
  });
}

// --- Allowed (normal) operations ----------------------------------------------

const ALLOWED = [
  'git commit -m "add feature"',
  'git status',
  'git push origin main',
  'git add .',
  'git pull --rebase',
  'git rebase --abort',
];

for (const cmd of ALLOWED) {
  test(`allows normal: ${cmd}`, () => {
    const res = runGuard(cmd);
    assert.equal(res.status, 0, `expected exit 0 (allow) for: ${cmd}`);
  });
}

// --- Non-Bash tool calls must pass straight through ----------------------------

test('ignores non-Bash tool calls', () => {
  const payload = JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: 'x.js' },
  });
  const res = spawnSync('node', [GUARD], { input: payload, encoding: 'utf8' });
  assert.equal(res.status, 0, 'non-Bash tool calls must be allowed');
});
