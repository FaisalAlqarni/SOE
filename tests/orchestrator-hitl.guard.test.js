import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
const skill = readFileSync(new URL('../skills/soe-orchestrator/SKILL.md', import.meta.url), 'utf8');

test('orchestrator logs an advisory from->to undo record', () => {
  assert.match(skill, /before_sha/);
  assert.match(skill, /after_sha/);
  assert.match(skill, /advisory/i);
});
test('orchestrator wires the hitl approval handshake', () => {
  assert.match(skill, /requestApproval/);
  assert.match(skill, /checkApproval/);
  assert.match(skill, /isSensitivePath/);
});
test('orchestrator branches on all three interaction modes', () => {
  assert.match(skill, /autonomous-guardrailed/);
  assert.match(skill, /interactive/);
  assert.match(skill, /fully-agentic/);
});
