---
name: setup
description: Scaffold the soe state layer (.soe/) in this project — config, tracks dir, and managed .gitignore rules.
allowed_tools: Bash, Read
command: true
---

# /setup — scaffold the soe state layer

`/setup` initializes the **soe orchestration bookkeeping** inside the current
user project. It is safe to re-run: idempotent and resumable.

## What it creates

Run the real, tested scaffolder (do NOT hand-create these files):

```bash
# Resolve the plugin root with a fallback — CLAUDE_PLUGIN_ROOT can be unset
# (e.g. a bare subagent). See "Resolving the plugin root".
ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d "$HOME"/.claude/plugins/cache/*/soe/*/ 2>/dev/null | sort -V | tail -1)}"
ROOT="${ROOT:-$HOME/.claude/plugins/soe}"   # manual-install fallback
node -e "import('${ROOT}/lib/setup.js').then(m => { const r = m.runSetup(process.cwd(), { model: process.env.SOE_SESSION_MODEL }); console.log(JSON.stringify(r, null, 2)); })"
```

`CLAUDE_PLUGIN_ROOT` is normally set; the two lines above fall back to the
installed plugin cache (or the manual-install path `~/.claude/plugins/soe`) when
it is unset, so the import never breaks.

This scaffolds, in the project root:

- **`.soe/config.json`** — engine mode + thresholds + model defaults:
  `{ "mode": "autonomous-guardrailed", "max_fix_cycles": 5, "max_plan_revisions": 3,
  "models": { "orchestrator": "<session model>", "reasoner": "opus", "worker": "sonnet" } }`.
  `mode` defaults to **`autonomous-guardrailed`** and selects the interaction
  mode (`soe:soe-modes`: autonomous-guardrailed / interactive / fully-agentic).
  The `models` block is documentation defaults only. **Existing `config.json` is
  preserved** — a re-run never clobbers your edits.
- **`.soe/tracks/`** — empty directory. Per-track state is created later by `/go`.
- **`.soe/setup_state.json`** — `{ "last_step": "done" }` resume marker.
- **`.gitignore`** — the managed ephemeral-ignore block, applied via the shared
  `applyGitignore` helper. Only transient run-state is ignored; durable memory
  stays committable. Your existing `.gitignore` lines are preserved verbatim.

## Where specs and plans live (docs/plans vs .soe)

- **Human design docs + plans live in `docs/plans/`** — your existing convention,
  committed, the single source of truth. They are **NOT** placed under `.soe/`.
- **`.soe/` is machine bookkeeping** (hidden): config + per-track execution state
  that *references* `docs/plans/`.

## Per-track layout (created later by /go, documented here)

Each track gets `.soe/tracks/{id}/`:

- `state.json` — AUTHORITATIVE execution state (atomic writes, orchestrator-only).
- `progress.md` — rendered FROM `state.json` (human-readable, not hand-edited).
- `decision-log.md`, `retrospective.md` — durable, committed.
- `run/` — ephemeral worker/run scratch (gitignored).

## Commit policy (durable vs ephemeral)

- **Durable → commit:** `docs/plans/*`, and per-track `.soe/tracks/{id}/*.md` +
  `state.json`. This is the engine's cross-session / cross-machine / cross-teammate
  memory.
- **Ephemeral → ignored:** `.soe/**` run scratch (the managed `.gitignore` block
  handles this). Never committed; recreated every run.

## After running

Report to the user which paths were created vs preserved (the command output's
`configCreated` / `gitignoreCreated` flags tell you), and remind them that
`docs/plans/` holds the specs while `.soe/` holds machine state.
