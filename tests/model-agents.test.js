import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// model-agents.test.js — assert the model-pinned orchestration agents carry a
// VALID model alias in their frontmatter.
//
// Design §4.1: subagents are pinned to model tiers via `model:` frontmatter
// using ALIASES (fable / opus / sonnet) — NEVER full IDs like `claude-fable-5`.
// This unit test can only assert that the pinned alias is valid; the actual
// runtime routing (which tier the harness dispatches to) is MANUAL / harness-
// driven and cannot be exercised here — verify it by inspecting `/model`
// behavior at runtime.

const AGENTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'agents');

// The only acceptable model aliases. Anything else (esp. a full model ID) is a
// hard failure.
const VALID_ALIASES = new Set(['fable', 'opus', 'sonnet']);

// Role → required alias pin (design §4.1).
const PINS = {
  strategist: 'fable',
  'deep-reasoner': 'opus',
  'fast-worker': 'sonnet',
};

/** Read the `model:` value from a markdown file's YAML frontmatter block. */
function modelField(agentName) {
  const text = readFileSync(join(AGENTS_DIR, `${agentName}.md`), 'utf8');
  const lines = text.split('\n');
  assert.equal(lines[0].trim(), '---', `${agentName}: file must open with frontmatter`);
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') break; // end of frontmatter
    const m = /^model:\s*(.+?)\s*$/.exec(lines[i]);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  return undefined;
}

for (const [agent, expected] of Object.entries(PINS)) {
  test(`${agent} pins model alias '${expected}'`, () => {
    const model = modelField(agent);
    assert.ok(model !== undefined, `${agent}: missing 'model:' frontmatter`);
    // Must be a valid alias — reject full IDs like `claude-fable-5`.
    assert.ok(
      VALID_ALIASES.has(model),
      `${agent}: model '${model}' is not a valid alias (must be one of ${[...VALID_ALIASES].join('/')} — no full IDs)`,
    );
    assert.equal(model, expected, `${agent}: expected pin '${expected}', got '${model}'`);
  });
}
