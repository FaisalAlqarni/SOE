---
name: go-auto
description: "Autonomous entry to the soe Evaluate-Loop — a subagent derives the spec from your goal + a codebase analysis (no human brainstorm), binds it to the track, then the orchestrator plans, executes, evaluates, and drives to completion."
allowed_tools: Bash, Read, Write, Task
command: true
---

# /go-auto — Autonomous Spec Entry Point

**One of three entry commands into the soe Evaluate-Loop.** All three share the
SAME autonomous loop (`PLAN → EVALUATE_PLAN → EXECUTE → EVALUATE_EXEC →
COMPLETE`, driven by `soe:soe-orchestrator`). They differ ONLY in how the design
doc that anchors the loop is derived:

- **`/go`** — human-in-loop brainstorm first.
- **`/go-auto`** — autonomous spec generation from goal + codebase (this command).
- **`/go-all`** — dual independent derivation (human + auto) + human reconciliation.

`/go-auto` is `/go` with the interactive brainstorm replaced by an **autonomous
spec derivation**: a subagent reads the repo and produces the design doc from the
goal + codebase, with **no human in the loop** for the spec. Once that doc is
written and **bound** to the track, it dispatches `soe:soe-orchestrator` to run
the loop starting at PLAN.

## Usage

```
/go-auto <your goal>     # autonomous spec → bind design → run the loop
```

## Precondition: `/setup` has been run

Check that `.soe/` exists:

```bash
test -d .soe && test -f .soe/config.json && echo OK || echo MISSING
```

If `MISSING`, **stop** and tell the user to run `/soe:setup` first (or run it,
then continue). Do not hand-create `.soe/`.

## Your Task

You ARE the `/go-auto` entry point. When invoked, follow this process.

### 1. Goal analysis

Read the goal from `$ARGUMENTS`. If empty, tell the user `/go-auto` needs a goal
(bare-resume lives on `/go`). Parse type (feature / bugfix / refactor) and key
nouns.

### 2. Resolve / create the track

Track id = **kebab-slug of the goal**. Reuse a clearly-matching track or create
a new one, seeding the initial `state.json` through the state library. Resolve
the plugin root with a fallback for the lib import (never relative `./lib`) —
`CLAUDE_PLUGIN_ROOT` can be unset (e.g. a bare subagent) — and write only the
initial record under the writer lock:

```bash
ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d "$HOME"/.claude/plugins/cache/*/soe/*/ 2>/dev/null | sort -V | tail -1)}"
ROOT="${ROOT:-$HOME/.claude/plugins/soe}"   # manual-install fallback
SOE_ROOT="$ROOT" node -e '
  const ROOT = process.env.SOE_ROOT;
  import(`${ROOT}/lib/state.js`).then(async (S) => {
    const goal = process.argv[1];
    const id = goal.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
    const dir = `.soe/tracks/${id}`;
    await S.withWriterLock(dir, () => {
      if (S.readState(dir)) return;              // idempotent: never clobber an existing track
      S.writeState(dir, {
        track_id: id,
        goal,
        loop_state: { current_step: "PLAN", step_status: "NOT_STARTED" },
        tasks: [],
      });
    });
    console.log(JSON.stringify({ dir, state: S.readState(dir) }));
  });
' "$ARGUMENTS"
```

Capture the track `dir` and its `design_doc` field for the binding guard.

### 3. Design-doc binding guard (fixes staleness)

Same guard as `/go`: the loop reads the **bound** `design_doc`, not whatever
file is on disk.

1. **Track already has a bound `design_doc` that exists on disk** → skip
   derivation, go straight to *Dispatch the orchestrator*.
2. **A plausible design doc for this goal exists on disk but is NOT bound** →
   ASK the user *"use `<path>` or re-derive?"* (judgment gate — never silently
   adopt an unbound doc). On "use it", bind that path (step 5). On "re-derive",
   fall through.
3. **Otherwise** → run the autonomous derivation (next step).

### 4. Autonomous spec derivation (subagent, no human)

Dispatch a **subagent** to derive the design/spec from the **goal + codebase
analysis** — there is NO human brainstorm here. Instruct it explicitly:

```
Use a general-purpose subagent to autonomously derive a design/spec for this
goal — no human in the loop:

GOAL: <the goal>

Derive the spec from the goal AND a codebase analysis:
- Read the repository structure, key modules, and existing patterns/conventions.
- Read recent git history (e.g. `git log --oneline -30`, relevant diffs) to
  understand how similar changes are made here.
- Identify the affected files, the integration points, constraints, edge cases,
  and acceptance criteria the goal implies.

Write a complete design doc to docs/plans/<date>-<slug>-design.md covering:
architecture, components, data flow, error handling, testing, and explicit
acceptance criteria. No "TBD"/placeholders — make every requirement concrete.
Commit the design doc. Return ONLY the written path.
```

For UI/frontend work: if the goal references a **Figma URL**, use
`soe:using-figma` to READ design context (components, layout, tokens, variants,
flows) and ground the design doc's UI section in the actual design. It skips
silently when Figma is unavailable, unauthenticated, or no URL was given.

This runs autonomously (in the background from the user's perspective) — no
brainstorm dialogue.

### 5. Bind the design doc

When the subagent returns the written path, **BIND it** — write `design_doc` and
`spec_mode: "auto"` into `state.json` via `lib/state.js`, under the writer lock
(merge; do not clobber `tasks`/`loop_state`):

```bash
ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d "$HOME"/.claude/plugins/cache/*/soe/*/ 2>/dev/null | sort -V | tail -1)}"
ROOT="${ROOT:-$HOME/.claude/plugins/soe}"   # manual-install fallback
SOE_ROOT="$ROOT" node -e '
  const ROOT = process.env.SOE_ROOT;
  import(`${ROOT}/lib/state.js`).then(async (S) => {
    const [dir, docPath] = process.argv.slice(1);
    await S.withWriterLock(dir, () => {
      const st = S.readState(dir) || {};
      S.writeState(dir, { ...st, design_doc: docPath, spec_mode: "auto" });
    });
    console.log("bound", docPath);
  });
' "$dir" "docs/plans/<date>-<slug>-design.md"
```

The bound `design_doc` — not file presence — is what the loop reads.

### 6. Dispatch the orchestrator

```
Use the soe:soe-orchestrator agent to run the Evaluate-Loop for the track at
.soe/tracks/{id} — it reads the bound design_doc, plans, and drives to COMPLETE.
```

The orchestrator reads caps from `.soe/config.json`, resumes crash-safely, and
drives `PLAN → EVALUATE_PLAN(board) → EXECUTE → EVALUATE_EXEC → (FIX↺ |
COMPLETE)`.

## What happens end-to-end

```
User: /go-auto Add a hello world API

1. Precondition   → .soe/ exists (else: run /soe:setup)
2. Resolve track  → .soe/tracks/add-a-hello-world-api/state.json (PLAN, tasks=[])
3. Binding guard  → no bound design_doc → derive
4. Auto-derive    → subagent reads repo + git history → docs/plans/<date>-...-design.md
5. Bind           → design_doc + spec_mode:"auto" in state.json
6. Dispatch       → soe:soe-orchestrator runs the loop from PLAN → COMPLETE
```

## Related

- `/go` — human-in-loop brainstorm instead of autonomous derivation.
- `/go-all` — dual independent derivation + human reconciliation.
- `soe:soe-setup` / `/setup` — scaffold the `.soe/` state layer (run first).
- `soe:soe-orchestrator` — the Evaluate-Loop coordinator this command dispatches.
