import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// model-agents.test.js — two integrity guards over agent frontmatter:
//
//  (1) MODEL PINS. Tier-pinned agents must carry the latest FULL model id
//      (e.g. claude-sonnet-5), NOT a bare alias. The `sonnet` alias resolves to
//      claude-sonnet-4-6, so aliases would silently pin an older model.
//
//  (2) FAN-OUT SPAWN TOOL. Agents that dispatch other agents MUST list `Agent`
//      in their `tools` (the Task tool was renamed to Agent in CC 2.1.63). This
//      is the regression guard for the bug where soe-orchestrator listed the
//      stale `Task` and board-meeting/loop-execution-evaluator listed no spawn
//      tool at all — so on CC >= 2.1.172 they silently could not fan out and the
//      whole multi-agent engine collapsed to a single inline agent.

const AGENTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'agents');

const VALID_MODEL_IDS = new Set([
  'claude-opus-4-8',
  'claude-sonnet-5',
  'claude-fable-5',
  'claude-haiku-4-5',
]);
const BARE_ALIASES = new Set(['opus', 'sonnet', 'haiku', 'fable']);

// Role → required full-id pin.
const PINS = {
  strategist: 'claude-fable-5',
  'deep-reasoner': 'claude-opus-4-8',
  'fast-worker': 'claude-sonnet-5',
};

// Agents that fan out to other agents — must be able to spawn.
const FAN_OUT_AGENTS = ['soe-orchestrator', 'board-meeting', 'loop-execution-evaluator'];

/** Extract the raw frontmatter block (between the first two `---` lines). */
function frontmatter(agentName) {
  const text = readFileSync(join(AGENTS_DIR, `${agentName}.md`), 'utf8');
  const lines = text.split('\n');
  assert.equal(lines[0].trim(), '---', `${agentName}: file must open with frontmatter`);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') return out;
    out.push(lines[i]);
  }
  throw new Error(`${agentName}: unterminated frontmatter`);
}

function modelField(agentName) {
  for (const line of frontmatter(agentName)) {
    const m = /^model:\s*(.+?)\s*$/.exec(line);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  return undefined;
}

function toolsField(agentName) {
  for (const line of frontmatter(agentName)) {
    const m = /^tools:\s*(.+?)\s*$/.exec(line);
    if (m) return m[1];
  }
  return undefined;
}

// (1) Required tier pins are the exact latest full ids.
for (const [agent, expected] of Object.entries(PINS)) {
  test(`${agent} pins full model id '${expected}'`, () => {
    const model = modelField(agent);
    assert.ok(model !== undefined, `${agent}: missing 'model:' frontmatter`);
    assert.equal(model, expected, `${agent}: expected '${expected}', got '${model}'`);
  });
}

// (1b) NO agent may pin a bare alias — full ids only.
test('no agent pins a bare model alias (full ids only)', () => {
  for (const file of readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md'))) {
    const name = file.replace(/\.md$/, '');
    const model = modelField(name);
    if (model === undefined) continue; // e.g. soe-orchestrator runs as session model
    assert.ok(!BARE_ALIASES.has(model), `${name}: pins bare alias '${model}' — use a full id`);
    assert.ok(VALID_MODEL_IDS.has(model), `${name}: '${model}' is not a known full model id`);
  }
});

// (2) Fan-out agents must carry the `Agent` spawn tool (and never the stale `Task`).
for (const agent of FAN_OUT_AGENTS) {
  test(`${agent} lists the 'Agent' spawn tool (not stale 'Task')`, () => {
    const tools = toolsField(agent);
    assert.ok(tools !== undefined, `${agent}: missing 'tools:' frontmatter`);
    assert.match(tools, /"Agent"/, `${agent}: must list "Agent" to fan out to subagents`);
    assert.doesNotMatch(tools, /"Task"/, `${agent}: uses stale "Task" (renamed to "Agent" in CC 2.1.63)`);
  });
}
