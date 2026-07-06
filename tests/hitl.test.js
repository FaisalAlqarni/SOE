import { test } from 'node:test';
import assert from 'node:assert';
import { isSensitivePath, requestApproval, checkApproval, DEFAULT_DENYLIST } from '../lib/hitl.js';

test('isSensitivePath: flags .env, secrets, key material, CI/infra by default', () => {
  assert.equal(isSensitivePath('config/.env'), true);
  assert.equal(isSensitivePath('src/secrets.json'), true);
  assert.equal(isSensitivePath('deploy/id_rsa'), true);
  assert.equal(isSensitivePath('.github/workflows/ci.yml'), true);
  assert.equal(isSensitivePath('src/app.js'), false);
  assert.equal(isSensitivePath('README.md'), false);
});

test('isSensitivePath: honors a custom denylist', () => {
  assert.equal(isSensitivePath('src/app.js', ['app.js']), true);
  assert.equal(isSensitivePath('src/app.js', ['nope']), false);
});

test('requestApproval writes a pending marker and returns an id; checkApproval reads pending', () => {
  const store = {};
  const writeFile = (p, data) => { store[p] = data; };
  const readFile = (p) => { if (!(p in store)) { const e = new Error('no'); e.code = 'ENOENT'; throw e; } return store[p]; };
  const id = requestApproval('/tracks/T1', { kind: 'sensitive-path', detail: 'edits .env' }, { writeFile });
  assert.ok(typeof id === 'string' && id.length > 0);
  // the pending marker exists under the track's approvals dir
  const pendingKey = Object.keys(store).find((k) => k.includes('approvals') && k.includes(id));
  assert.ok(pendingKey, 'a pending marker file was written');
  assert.equal(checkApproval('/tracks/T1', id, { readFile }), 'pending');
});

test('checkApproval returns approve/deny when the human wrote a decision file', () => {
  const store = {};
  const writeFile = (p, data) => { store[p] = data; };
  const id = requestApproval('/tracks/T1', { kind: 'escalate', detail: 'board ESCALATE' }, { writeFile });
  // human approves: a decision file with the verdict
  const decisionKey = `/tracks/T1/approvals/${id}.decision.json`;
  store[decisionKey] = JSON.stringify({ decision: 'approve' });
  const readFile = (p) => { if (!(p in store)) { const e = new Error('no'); e.code = 'ENOENT'; throw e; } return store[p]; };
  assert.equal(checkApproval('/tracks/T1', id, { readFile }), 'approve');
  store[decisionKey] = JSON.stringify({ decision: 'deny' });
  assert.equal(checkApproval('/tracks/T1', id, { readFile }), 'deny');
});
