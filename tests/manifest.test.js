import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
test('plugin.json is valid and branded soe/AGPL', () => {
  const p = JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url)));
  assert.equal(p.name, 'soe');
  assert.equal(p.license, 'AGPL-3.0');
  assert.match(p.version, /^\d+\.\d+\.\d+$/);
  assert.ok(p.description?.length > 10);
});
