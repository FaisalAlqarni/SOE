// Smoke-tests every hook script referenced in hooks/hooks.json by actually
// executing it with a fixture stdin payload, and asserts it does NOT fail with
// a module-load error (the "require is not defined in ES module scope" /
// "Cannot find module" class of bug). Non-zero exit is allowed — a policy hook
// may legitimately block — but a crash on load is a real, shippable bug.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const hooksDir = fileURLToPath(new URL('../hooks/', import.meta.url));
const cfg = JSON.parse(readFileSync(path.join(hooksDir, 'hooks.json'), 'utf8'));

// Collect every referenced .js/.cjs hook script from hooks.json commands.
function collectScripts(obj, acc = new Set()) {
  if (Array.isArray(obj)) { obj.forEach((o) => collectScripts(o, acc)); return acc; }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'command' && typeof v === 'string') {
        for (const m of v.matchAll(/([\w./-]+\.(?:js|cjs))/g)) acc.add(path.basename(m[1]));
      } else collectScripts(v, acc);
    }
  }
  return acc;
}
const scripts = [...collectScripts(cfg)].filter((s) => existsSync(path.join(hooksDir, s)));

const MODULE_LOAD_ERROR = /require is not defined|Cannot find module|ERR_MODULE_NOT_FOUND|ERR_REQUIRE_ESM/;
const FIXTURE = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'echo hi' }, hook_event_name: 'PreToolUse' });

test('hooks.json references at least one existing script', () => {
  assert.ok(scripts.length >= 1, 'no hook scripts found — collector or hooks.json is wrong');
});

for (const script of scripts) {
  test(`hook loads without a module error: ${script}`, () => {
    let stderr = '';
    try {
      execFileSync('node', [path.join(hooksDir, script)], { input: FIXTURE, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      // Non-zero exit is fine (a hook may block); capture stderr to inspect the reason.
      stderr = (e.stderr || '') + (e.message || '');
    }
    assert.doesNotMatch(stderr, MODULE_LOAD_ERROR, `${script} crashed on load:\n${stderr.slice(0, 400)}`);
  });
}
