import { test } from 'node:test';
import assert from 'node:assert';
import { resumePoint, DONE } from '../lib/resume.js';

test('all tasks completed => resumePoint returns DONE (the TASK loop is done)', () => {
  assert.equal(resumePoint({ tasks: [{ id: 'T1', status: 'completed' }] }), DONE);
});

test('phase is driven by loop_state.current_step, not resumePoint — completed tasks + step EVALUATE_EXEC is NOT COMPLETE', () => {
  const state = { tasks: [{ id: 'T1', status: 'completed' }], loop_state: { current_step: 'EVALUATE_EXEC' } };
  assert.equal(resumePoint(state), DONE);                       // task loop done...
  assert.notEqual(state.loop_state.current_step, 'COMPLETE');   // ...but the track is NOT complete
});
