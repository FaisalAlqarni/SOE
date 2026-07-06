import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
const skill = readFileSync(new URL('../skills/soe-orchestrator/SKILL.md', import.meta.url), 'utf8');
const card = readFileSync(new URL('../agents/soe-orchestrator.md', import.meta.url), 'utf8');

test('orchestrator routes COMPLETE through completeTrack', () => {
  assert.match(skill, /completeTrack\(stateDir, provenance\)/);
});
test('orchestrator does NOT advance to COMPLETE via advanceStep', () => {
  assert.doesNotMatch(skill, /advanceStep\([^)]*['"]COMPLETE['"]/);
});
test('orchestrator does NOT set current_step = COMPLETE by hand (ungated bypass removed)', () => {
  assert.doesNotMatch(skill, /current_step['"\s]*[:=]\s*['"]COMPLETE['"]/);
});
test('agent card routes COMPLETE through completeTrack (no ungated bypass)', () => {
  assert.match(card, /completeTrack/);
});
test('agent card does NOT hand-write status to complete under the lock', () => {
  // an instruction like "mark status: complete under the lock" is the bypass; a
  // prohibition mentioning it is fine. Assert the imperative bypass phrasing is gone.
  assert.doesNotMatch(card, /mark\s+status:\s*complete\s+under the lock/i);
});
