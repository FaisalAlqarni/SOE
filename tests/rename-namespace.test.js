import { test } from 'node:test';
import assert from 'node:assert';
import { transform } from '../scripts/rename-namespace.mjs';

test('rewrites all known namespace prefixes to soe:', () => {
  assert.equal(transform('orchestrator-supaconductor:foo'), 'soe:foo');
  assert.equal(transform('supaconductor:bar'), 'soe:bar');
  assert.equal(transform('sp-ecc:baz'), 'soe:baz');
  assert.equal(transform('superpowers:qux'), 'soe:qux');
});

test('longest prefix wins (no partial/mangled rewrite)', () => {
  // orchestrator-supaconductor: contains supaconductor: as a substring.
  assert.equal(transform('orchestrator-supaconductor:foo'), 'soe:foo');
  assert.notEqual(transform('orchestrator-supaconductor:foo'), 'soe:-supaconductor:foo');
  assert.ok(!transform('orchestrator-supaconductor:foo').includes('supaconductor'));
});

test('leaves the bare word "superpowers" (no colon) unchanged', () => {
  assert.equal(transform('the superpowers of skills'), 'the superpowers of skills');
  assert.equal(transform('superpowers'), 'superpowers');
  assert.equal(transform('superpowersfoo'), 'superpowersfoo');
});

test('preserves surrounding and unrelated content', () => {
  const input = 'Run superpowers:init then sp-ecc:build. See the superpowers docs.';
  const expected = 'Run soe:init then soe:build. See the superpowers docs.';
  assert.equal(transform(input), expected);
});

test('rewrites multiple occurrences and mixed prefixes', () => {
  const input = 'a supaconductor:x b orchestrator-supaconductor:y c superpowers:z';
  const expected = 'a soe:x b soe:y c soe:z';
  assert.equal(transform(input), expected);
});

test('empty and prefix-free text is returned unchanged', () => {
  assert.equal(transform(''), '');
  assert.equal(transform('nothing to see here'), 'nothing to see here');
});
