import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// dispatch-native-await.test.js — regression guard for the fast-path fix.
//
// The Evaluate-Loop's ~24-min-of-27 overhead was the orchestrator improvising a
// scheduler-hostile bash `until [ -f … ]; sleep` poll to wait for async
// subagents (2–7 min/worker vs 2.8 s for the native completion signal). The fix
// is prose in the fan-out agents/skills: dispatch async, collect the NATIVE
// return, never bash-poll. This test asserts that guidance is present so it
// can't silently regress.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Each fan-out surface must (a) tell the reader to use the native completion
// signal and (b) explicitly forbid a bash until/sleep poll.
const SURFACES = [
  'skills/soe-orchestrator/SKILL.md',
  'skills/soe-workers/SKILL.md',
  'agents/board-meeting.md',
  'agents/loop-execution-evaluator.md',
];

for (const rel of SURFACES) {
  test(`${rel} forbids the bash poll and points at the native completion signal`, () => {
    const text = readFileSync(join(ROOT, rel), 'utf8');
    // (a) native completion signal is named.
    assert.match(
      text,
      /native (completion )?(signal|return)|re-invoke/i,
      `${rel}: must direct the reader to the native async completion signal`,
    );
    // (b) the scheduler-hostile bash poll is explicitly prohibited.
    assert.match(
      text,
      /never[^.]*\bsleep\b|never[^.]*until|no bash poll|scheduler-hostile/i,
      `${rel}: must explicitly forbid a bash until/sleep poll`,
    );
  });
}
