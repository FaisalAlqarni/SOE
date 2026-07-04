/**
 * lib/model-resolve.js — resolve a model TIER to a concrete model ID, honoring
 * the Fable gate. Pure, fs-free, unit-testable; the caller owns config loading.
 *
 * WHY THIS EXISTS (and why it is deliberately small):
 *   On Claude Code >= 2.1.172 subagents nest and honor their own `model:`
 *   frontmatter, so NORMAL tiering rides the agents' full-ID pins directly and
 *   needs no code. The ONE tier that must be resolved at dispatch time is the
 *   `strategist` (Fable): the user can turn Fable off via config, in which case
 *   the strategist tier must fall back to the reasoner tier (Opus). The
 *   orchestrator passes this resolved id as the per-invocation `model` on the
 *   strategist dispatch (per-invocation model outranks frontmatter).
 *
 * AVAILABILITY vs CONFIG (two distinct gates — do not conflate):
 *   - CONFIG gate (this module): `fable_enabled:false` → strategist → reasoner.
 *   - AVAILABILITY gate (capability discovery / model-orchestration): if the
 *     user is not on a Fable plan the orchestrator simply does not invoke the
 *     strategist at all. This module does not detect availability; it only
 *     resolves the id GIVEN the config.
 */

/** Tier → latest full model id. Full ids (not aliases) pin exact versions. */
export const DEFAULT_MODELS = {
  reasoner: 'claude-opus-4-8',
  worker: 'claude-sonnet-5',
  cheap: 'claude-haiku-4-5',
  strategist: 'claude-fable-5',
};

/**
 * Resolve a tier to a model id.
 * @param {{ models?: Record<string,string>, fable_enabled?: boolean }|null|undefined} config
 * @param {string} tier - one of reasoner | worker | cheap | strategist (or a config-defined tier)
 * @returns {string} the resolved full model id
 * @throws if the tier is unknown (fail-safe: never silently pick a wrong model)
 */
export function resolveModel(config, tier) {
  const models = { ...DEFAULT_MODELS, ...(config && config.models) };
  if (!(tier in models)) {
    throw new Error(`resolveModel: unknown tier '${tier}'`);
  }
  // Fable gate: strategist falls back to the reasoner tier when Fable is off.
  // Default is ON (fable_enabled omitted or true).
  const fableEnabled = !config || config.fable_enabled !== false;
  if (tier === 'strategist' && !fableEnabled) {
    return models.reasoner;
  }
  return models[tier];
}
