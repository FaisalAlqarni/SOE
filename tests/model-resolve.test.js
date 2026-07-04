import { test } from 'node:test';
import assert from 'node:assert';

import { resolveModel, DEFAULT_MODELS } from '../lib/model-resolve.js';

// model-resolve.test.js — the Fable gate is a CORE routing guarantee, so it is
// tested code, not prose. resolveModel maps a tier -> full model id, and when
// Fable is disabled the strategist tier falls back to the reasoner tier (Opus).

test('defaults: each tier resolves to its latest full id', () => {
  assert.equal(resolveModel({}, 'reasoner'), 'claude-opus-4-8');
  assert.equal(resolveModel({}, 'worker'), 'claude-sonnet-5');
  assert.equal(resolveModel({}, 'cheap'), 'claude-haiku-4-5');
  assert.equal(resolveModel({}, 'strategist'), 'claude-fable-5');
});

test('null/undefined config uses defaults', () => {
  assert.equal(resolveModel(undefined, 'worker'), 'claude-sonnet-5');
  assert.equal(resolveModel(null, 'strategist'), 'claude-fable-5');
});

test('config.models overrides a tier', () => {
  assert.equal(
    resolveModel({ models: { worker: 'claude-sonnet-4-6' } }, 'worker'),
    'claude-sonnet-4-6',
  );
});

test('Fable gate: fable_enabled:false routes strategist to the reasoner tier', () => {
  assert.equal(resolveModel({ fable_enabled: false }, 'strategist'), 'claude-opus-4-8');
});

test('Fable gate: the fallback honors a custom reasoner override', () => {
  assert.equal(
    resolveModel({ fable_enabled: false, models: { reasoner: 'claude-opus-4-7' } }, 'strategist'),
    'claude-opus-4-7',
  );
});

test('fable_enabled:true (or omitted) keeps strategist on Fable', () => {
  assert.equal(resolveModel({ fable_enabled: true }, 'strategist'), 'claude-fable-5');
  assert.equal(resolveModel({}, 'strategist'), 'claude-fable-5');
});

test('the Fable gate only affects the strategist tier', () => {
  assert.equal(resolveModel({ fable_enabled: false }, 'reasoner'), 'claude-opus-4-8');
  assert.equal(resolveModel({ fable_enabled: false }, 'worker'), 'claude-sonnet-5');
});

test('unknown tier throws (fail-safe, never silently wrong)', () => {
  assert.throws(() => resolveModel({}, 'bogus'), /unknown tier/);
});

test('DEFAULT_MODELS are all full ids, not aliases', () => {
  for (const [tier, id] of Object.entries(DEFAULT_MODELS)) {
    assert.match(id, /^claude-[a-z]+-\d/, `${tier} must be a full id, got '${id}'`);
  }
});
