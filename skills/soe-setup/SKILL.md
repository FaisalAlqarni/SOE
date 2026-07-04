---
name: soe-setup
description: Use when initializing soe in a project or when asked about the .soe/ layout, config, or the durable-vs-ephemeral commit policy. Explains what /setup scaffolds and how state is committed vs ignored.
---

# soe-setup — the project state layer

## Overview

soe keeps its orchestration bookkeeping in a per-project `.soe/` directory,
scaffolded by the `/setup` command (backed by the real, tested `lib/setup.js`
helper). This skill describes that layout, when/how setup runs, and the
durable-vs-ephemeral commit policy that keeps cross-session memory shareable
without git noise.

## When setup runs

Run `/setup` **once per project**, before the first `/go`. It is **idempotent and
resumable**: re-running never clobbers an existing `.soe/config.json` (your edits
are preserved) and never duplicates the managed `.gitignore` block.
`.soe/setup_state.json` (`{ "last_step": ... }`) records progress so an
interrupted setup can resume.

Internally `/setup` calls `runSetup(projectDir, { model })`, which reuses the
shared `applyGitignore` helper for `.gitignore` — the gitignore logic is NOT
reinvented per command.

## The `.soe/` layout

```
docs/plans/                 human design docs + plans (committed, single source of truth)
.soe/                       machine orchestration bookkeeping (hidden)
├── config.json             mode + thresholds + model defaults
├── setup_state.json        { last_step } resume marker
└── tracks/{id}/            per-track state (created later by /go)
    ├── state.json          AUTHORITATIVE execution state (atomic writes, orchestrator-only)
    ├── progress.md         rendered FROM state.json (human-readable, not hand-edited)
    ├── decision-log.md     durable decision record (committed)
    ├── retrospective.md    durable retrospective (committed)
    └── run/                ephemeral worker/run scratch (gitignored)
```

**Human specs and plans live in `docs/plans/`, NOT under `.soe/`.** `.soe/` only
holds machine state that *references* those plans.

### config.json defaults

```json
{
  "mode": "autonomous-guardrailed",
  "max_fix_cycles": 5,
  "max_plan_revisions": 3,
  "models": { "orchestrator": "<session model>", "reasoner": "opus", "worker": "sonnet" }
}
```

The `models` block is documentation defaults only. `mode` selects the interaction
model (autonomous-guardrailed / interactive / fully-agentic); the caps bound the
fix loop (5) and plan-revision loop (3).

## Durable vs ephemeral commit policy

This is the core rule the managed `.gitignore` block enforces:

- **Durable → committed.** `docs/plans/*` and per-track `.soe/tracks/{id}/*.md`
  (`decision-log.md`, `retrospective.md`, `progress.md`) + `state.json`. This is
  the engine's memory: it survives across sessions, machines, and teammates.
- **Ephemeral → ignored.** Per-run scratch under `.soe/` `run/` directories and
  transient worker-status files. These are recreated every run and must never be
  committed. The managed block in `.gitignore` (see gitignore-manager) targets
  ONLY this ephemeral state — it never hides durable memory.

Commit the durable files so soe's orchestration memory is shareable; let git
ignore the ephemeral run-state so history stays clean.
