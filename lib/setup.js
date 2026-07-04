import fs from 'node:fs';
import path from 'node:path';

import { applyGitignore, DEFAULT_IGNORE_PATTERNS } from './gitignore-manager.js';

/**
 * lib/setup.js — scaffolds the soe STATE LAYER inside a USER PROJECT (design
 * §3.1). This is the real, tested helper behind the `/setup` command.
 *
 * What it creates in the target project:
 *   - `.soe/config.json`   — engine mode + thresholds + model defaults.
 *   - `.soe/tracks/`       — empty dir; per-track state is added later by /go.
 *   - `.soe/setup_state.json` — `{ last_step }` for idempotent/resumable setup.
 *   - `.gitignore`         — the managed ephemeral-ignore block, applied via the
 *                            shared `applyGitignore` (NOT reinvented here).
 *
 * Durable vs ephemeral split (documented, enforced by the gitignore block):
 *   - Durable (committed):  docs/plans/*, and per-track `.soe/tracks/{id}/*.md`
 *     + `state.json`. Human specs/plans live in `docs/plans/`, NOT under `.soe`.
 *   - Ephemeral (ignored):  the `run/` scratch dirs and other transient
 *     per-run state (see gitignore-manager's DEFAULT_IGNORE_PATTERNS).
 *
 * IDEMPOTENCY: if `.soe/config.json` already exists it is PRESERVED verbatim —
 * we never clobber user edits. `applyGitignore` is itself idempotent, so the
 * managed block is rewritten in place, never duplicated.
 */

export const SOE_DIR = '.soe';
export const CONFIG_FILE = 'config.json';
export const TRACKS_DIR = 'tracks';
export const SETUP_STATE_FILE = 'setup_state.json';

/**
 * Build the default `.soe/config.json` contents. Model entries are
 * documentation defaults; `orchestrator` is the session model when known.
 *
 * @param {string} orchestratorModel - Session model id (or a sensible default).
 * @returns {object}
 */
export function defaultConfig(orchestratorModel) {
  return {
    mode: 'autonomous-guardrailed',
    max_fix_cycles: 5,
    max_plan_revisions: 3,
    minimal_code: true,
    // over_engineering_lens gates whether the advisory over-engineering
    // reviewer runs inside the /go pipeline:
    //   "on-demand"   (default) — NOT run in the pipeline; use the ambient
    //                  `/soe:simplify` command instead (token-frugal).
    //   "code-changes" — run in the pipeline on non-trivial CODE changes.
    //   "off"         — never run.
    over_engineering_lens: 'on-demand',
    models: {
      orchestrator: orchestratorModel,
      reasoner: 'opus',
      worker: 'sonnet',
    },
  };
}

/**
 * Scaffold the soe state layer inside `projectDir`. Idempotent and resumable.
 *
 * @param {string} projectDir - Absolute path to the user project root.
 * @param {{ model?: string }} [opts] - `model` is the current session model,
 *        recorded as the orchestrator default (documentation only).
 * @returns {{
 *   soeDir: string,
 *   configPath: string,
 *   tracksDir: string,
 *   configCreated: boolean,
 *   gitignoreCreated: boolean,
 *   ignorePatterns: string[],
 *   setupStatePath: string,
 * }} A report of what was scaffolded.
 */
export function runSetup(projectDir, opts = {}) {
  const orchestratorModel = opts.model || 'session-default';

  const soeDir = path.join(projectDir, SOE_DIR);
  const tracksDir = path.join(soeDir, TRACKS_DIR);
  const configPath = path.join(soeDir, CONFIG_FILE);
  const setupStatePath = path.join(soeDir, SETUP_STATE_FILE);
  const gitignorePath = path.join(projectDir, '.gitignore');

  // 1. Base layout: `.soe/` and `.soe/tracks/` (per-track state added by /go).
  fs.mkdirSync(tracksDir, { recursive: true });

  // 2. config.json — write defaults ONLY if absent, so we never clobber a
  //    user's edits on a re-run.
  let configCreated = false;
  if (!fs.existsSync(configPath)) {
    const cfg = defaultConfig(orchestratorModel);
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n');
    configCreated = true;
  }

  // 3. .gitignore — reuse the shared, idempotent manager. Ignores ONLY
  //    ephemeral run-state; durable memory stays committable.
  const gi = applyGitignore(gitignorePath, { patterns: DEFAULT_IGNORE_PATTERNS });

  // 4. setup_state.json — resumable marker; setup ran to completion.
  fs.writeFileSync(
    setupStatePath,
    JSON.stringify({ last_step: 'done' }, null, 2) + '\n',
  );

  return {
    soeDir,
    configPath,
    tracksDir,
    configCreated,
    gitignoreCreated: gi.created,
    ignorePatterns: gi.patterns,
    setupStatePath,
  };
}
