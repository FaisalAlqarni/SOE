---
name: go
description: "Human-in-loop entry to the soe Evaluate-Loop — brainstorm a design with you first, bind it to a track, then the orchestrator plans, executes, evaluates, and drives to completion."
allowed_tools: Bash, Read, Write, Task
command: true
---

# /go — Human-in-Loop Entry Point

**One of three entry commands into the soe Evaluate-Loop.** All three share the
SAME autonomous loop (`PLAN → EVALUATE_PLAN → EXECUTE → EVALUATE_EXEC →
COMPLETE`, driven by `soe:soe-orchestrator`). They differ ONLY in how the
design doc that anchors the loop is derived:

- **`/go`** — human-in-loop brainstorm first (this command).
- **`/go-auto`** — autonomous spec generation from goal + codebase.
- **`/go-all`** — dual independent derivation (human + auto) + human reconciliation.

`/go` owns the INTERACTIVE spec-derivation. Once a design doc is written and
**bound** to the track, it dispatches `soe:soe-orchestrator` to run the loop
starting at PLAN. Spec-derivation is owned here, in the command — it is NOT a
loop phase.

## Usage

```
/go <your goal>     # human brainstorm → bind design → run the loop
/go                 # resume the active / most-recent track
```

## Examples

```
/go Add Stripe payment integration
/go Fix the login bug where users get logged out
/go Build a dashboard with analytics
```

## Precondition: `/setup` has been run

`/go` operates over the state layer scaffolded by `soe:soe-setup` (the `/setup`
command). Before doing anything else, check that `.soe/` exists in the project
root:

```bash
test -d .soe && test -f .soe/config.json && echo OK || echo MISSING
```

If it prints `MISSING`, **stop** and tell the user to run `/soe:setup` first
(or run it for them, then continue). Do not hand-create `.soe/` — the
`soe:soe-setup` scaffolder owns that layout.

## Your Task

You ARE the `/go` entry point. When invoked, follow this process.

### 1. Goal analysis

Read the goal from `$ARGUMENTS`.

- **If `$ARGUMENTS` is empty → resume mode.** Skip to *Bare `/go`* below.
- Otherwise parse the goal: identify its type (feature / bugfix / refactor),
  rough scope, and the key nouns you will match tracks against.

### 2. Resolve / create the track

The track id is the **kebab-slug of the goal** (lowercased, non-alphanumerics
collapsed to `-`, trimmed). List existing tracks and reuse a clearly-matching
one; otherwise create a new track and seed its INITIAL `state.json` through the
engine's state library. Use `process.env.CLAUDE_PLUGIN_ROOT` for the lib import
(never a relative `./lib`), and write only the initial record under the writer
lock — the orchestrator owns every write thereafter:

```bash
node -e '
  const ROOT = process.env.CLAUDE_PLUGIN_ROOT;
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

This prints the track `dir` plus its current `state`. Capture the `dir` and the
state's `design_doc` field (may be undefined) for the binding guard below.

### 3. Design-doc binding guard (fixes staleness)

The track's `state.json` carries a **`design_doc`** field — the path the track
is BOUND to — and a **`spec_mode`** field. The loop reads the *bound* doc, not
whatever design file happens to be on disk. This guard decides whether to
brainstorm:

1. **Track already has a bound `design_doc` that exists on disk** → the design
   work is done and current. **Skip brainstorm**, go straight to *Dispatch the
   orchestrator* (PLAN). Verify existence:

   ```bash
   node -e '
     const ROOT = process.env.CLAUDE_PLUGIN_ROOT;
     import(`${ROOT}/lib/state.js`).then(async (S) => {
       const fs = await import("node:fs");
       const dir = process.argv[1];
       const st = S.readState(dir) || {};
       const bound = st.design_doc && fs.existsSync(st.design_doc);
       console.log(JSON.stringify({ design_doc: st.design_doc || null, bound: !!bound }));
     });
   ' "$dir"
   ```

2. **A plausible existing design doc for this goal is on disk but NOT bound**
   (e.g. `docs/plans/*-<slug>-design.md` exists, but `state.design_doc` is
   empty or points elsewhere) → **ASK the user**: *"I found an existing design
   at `<path>`. Use it, or re-brainstorm from scratch?"* This is a **judgment
   gate** — NEVER silently adopt an unbound doc (that is exactly the staleness
   bug). On "use it", bind that path (step 4's binding write); on "re-brainstorm",
   fall through to step 3.

3. **Otherwise** → run the human-in-loop brainstorm (next step).

### 4. Human brainstorm → write → bind

Invoke the **`soe:brainstorming`** skill — the human-present understanding gate.
It runs its collaborative dialogue under its HARD-GATE (no implementation until
you approve the design), then writes the approved design to
`docs/plans/<date>-<slug>-design.md` and commits it.

When the design doc is written, **BIND it to the track** — write `design_doc`
(the path) and `spec_mode: "human"` into `state.json` via `lib/state.js`, under
the writer lock (merge into the existing state; do not clobber `tasks` or
`loop_state`):

```bash
node -e '
  const ROOT = process.env.CLAUDE_PLUGIN_ROOT;
  import(`${ROOT}/lib/state.js`).then(async (S) => {
    const [dir, docPath] = process.argv.slice(1);
    await S.withWriterLock(dir, () => {
      const st = S.readState(dir) || {};
      S.writeState(dir, { ...st, design_doc: docPath, spec_mode: "human" });
    });
    console.log("bound", docPath);
  });
' "$dir" "docs/plans/<date>-<slug>-design.md"
```

The bound `design_doc` — not the mere presence of a file — is the single source
of truth the loop reads. This is what fixes staleness: an unbound doc on disk is
never silently used.

### 5. Dispatch the orchestrator

Hand the track to the Evaluate-Loop coordinator (it starts at PLAN; the planner
reads the bound `design_doc`):

```
Use the soe:soe-orchestrator agent to run the Evaluate-Loop for the track at
.soe/tracks/{id} — it reads the bound design_doc, plans, and drives to COMPLETE.
```

The orchestrator then reads caps from `.soe/config.json`, resumes crash-safely
via `lib/resume.js`, and drives `PLAN → EVALUATE_PLAN(board) → EXECUTE →
EVALUATE_EXEC → (FIX↺ | COMPLETE)`, reporting a concise summary at COMPLETE.

## Bare `/go` — resume the active / most-recent track

With no goal, resume the most relevant in-flight track instead of creating one:

1. Pick the active / most-recently-updated track under `.soe/tracks/` (most
   recently modified `state.json`).
2. Compute its next action via the resume library:

   ```bash
   node -e '
     const ROOT = process.env.CLAUDE_PLUGIN_ROOT;
     import(`${ROOT}/lib/resume.js`).then((R) => {
       const dir = process.argv[1];
       console.log(JSON.stringify(R.resumeFromDir(dir)));
     });
   ' .soe/tracks/{id}
   ```

   `resumeFromDir` returns the next task to run, or the `DONE` sentinel
   (`{"done":true}`) when the track is finished.
3. If a task remains → *Dispatch the orchestrator* for that track. If `DONE` and
   no other track has work, report that there is nothing to resume and suggest
   running `/go <goal>` to start something new.

## What happens end-to-end

```
User: /go Add a hello world API

1. Precondition   → .soe/ exists (else: run /soe:setup)
2. Resolve track  → .soe/tracks/add-a-hello-world-api/state.json (PLAN, tasks=[])
3. Binding guard  → no bound design_doc, none on disk → brainstorm
4. Brainstorm     → soe:brainstorming (human) → docs/plans/<date>-...-design.md
                    → BIND: design_doc + spec_mode:"human" in state.json
5. Dispatch       → soe:soe-orchestrator runs the loop from PLAN:
   PLAN → EVALUATE_PLAN → EXECUTE → EVALUATE_EXEC → PASS → COMPLETE
                                                    FAIL → FIX↺ (bounded)
6. Track COMPLETE → concise summary reported to the user
```

## Related

- `/go-auto` — autonomous spec generation instead of a human brainstorm.
- `/go-all` — dual independent derivation + human reconciliation.
- `soe:soe-setup` / `/setup` — scaffold the `.soe/` state layer (run first).
- `soe:brainstorming` — the human-in-loop understanding gate this command uses.
- `soe:soe-orchestrator` — the Evaluate-Loop coordinator this command dispatches.
