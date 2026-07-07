import { test } from 'node:test';
import assert from 'node:assert';

import { requiredReviews } from '../lib/review-policy.js';

// review-policy.test.js — the deterministic required-reviews-per-tier policy.
// Uses the REAL risk-matrix tier vocabulary: 'trivial' | 'standard' | 'full'.

test('trivial tier requires NO reviews', () => {
  assert.deepEqual(requiredReviews('trivial'), []);
});

test('standard tier requires code review', () => {
  assert.deepEqual(requiredReviews('standard'), ['code']);
});

test('full tier requires code + security review', () => {
  assert.deepEqual(requiredReviews('full'), ['code', 'security']);
});

test('standard + touchesSql appends database review', () => {
  assert.deepEqual(requiredReviews('standard', { touchesSql: true }), ['code', 'database']);
});

test('standard + touchesLogging appends logging review', () => {
  assert.deepEqual(requiredReviews('standard', { touchesLogging: true }), ['code', 'logging']);
});

test('standard + touchesSql + touchesLogging appends both', () => {
  assert.deepEqual(
    requiredReviews('standard', { touchesSql: true, touchesLogging: true }),
    ['code', 'database', 'logging'],
  );
});

test('full + touchesSql + touchesLogging appends both after security', () => {
  assert.deepEqual(
    requiredReviews('full', { touchesSql: true, touchesLogging: true }),
    ['code', 'security', 'database', 'logging'],
  );
});

test('trivial tier does NOT append database/logging even if flags are set', () => {
  assert.deepEqual(
    requiredReviews('trivial', { touchesSql: true, touchesLogging: true }),
    [],
  );
});

test('unknown tier throws', () => {
  assert.throws(() => requiredReviews('bogus'), /unknown tier/i);
});

test('requiredReviews with no options defaults touches to false', () => {
  assert.deepEqual(requiredReviews('full'), ['code', 'security']);
});
