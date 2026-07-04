---
name: go-all
description: "Dual-derivation entry to the soe Evaluate-Loop — a human brainstorm and an independent auto-spec are derived concurrently, then reconciled with you into one canonical design, bound to the track, and driven to completion by the orchestrator."
allowed_tools: Bash, Read, Write, Task
command: true
---

# /go-all — Dual-Derivation + Human Reconciliation Entry Point

**One of three entry commands into the soe Evaluate-Loop.** All three share the
SAME autonomous loop (`PLAN → EVALUATE_PLAN → EXECUTE → EVALUATE_EXEC →
COMPLETE`, driven by `soe:soe-orchestrator`). They differ ONLY in how the design
doc that anchors the loop is derived:

- **`/go`** — human-in-loop brainstorm first.
- **`/go-auto`** — autonomous spec generation from goal + codebase.
- **`/go-all`** — dual independent derivation (human + auto) + human reconciliation (this command).

`/go-all` derives the spec **TWICE, independently** — once by a human brainstorm,
once by an autonomous codebase analysis — then has you **reconcile** the two into
one canonical design via a structured 3-way diff. The cross-check catches human
omissions (agent inferred from the codebase) AND agent hallucinations (human
rejects). Once the merged doc is written and **bound**, it dispatches
`soe:soe-orchestrator` to run the loop from PLAN.

## Usage

```
/go-all <your goal>     # human brainstorm + independent auto-spec → reconcile → bind → run the loop
```

## Precondition: `/setup` has been run

```bash
test -d .soe && test -f .soe/config.json && echo OK || echo MISSING
```

If `MISSING`, **stop** and tell the user to run `/soe:setup` first. Do not
hand-create `.soe/`.

## Your Task

You ARE the `/go-all` entry point. When invoked, follow this process.

### 1. Goal analysis

Read the goal from `$ARGUMENTS`. If empty, tell the user `/go-all` needs a goal.
Parse type and key nouns.

### 2. Resolve / create the track

Track id = **kebab-slug of the goal**. Reuse a clearly-matching track or create
one, seeding the initial `state.json` via the state library. Use
`process.env.CLAUDE_PLUGIN_ROOT` for the lib import; write only the initial
record under the writer lock:

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

Capture the track `dir` and its `design_doc` field.

### 3. Design-doc binding guard (fixes staleness)

Same guard as `/go`:

1. **Track already has a bound `design_doc` that exists on disk** → skip
   derivation, go straight to *Dispatch the orchestrator*.
2. **A plausible merged design doc for this goal exists on disk but is NOT
   bound** → ASK *"use `<path>` or re-derive?"* (judgment gate — never silently
   adopt an unbound doc). On "use it", bind that path (step 6). On "re-derive",
   fall through.
3. **Otherwise** → run the dual derivation (next step).

### 4. TWO INDEPENDENT derivations

Run both derivations of the SAME goal — their **independence is the whole
point** (that is what makes the cross-check meaningful):

- **A. Auto-spec — dispatch FIRST and CONCURRENTLY**, in the background, so it
  runs while you do the human brainstorm. It must derive from the **goal +
  codebase ONLY** and MUST NOT see the human's brainstorm answers:

  ```
  Use a general-purpose subagent to autonomously derive a design/spec from the
  goal + codebase ONLY. You have NO access to any human brainstorm — derive
  independently; independence is the point.

  GOAL: <the goal>

  - Read the repo structure, key modules, patterns, and recent git history.
  - Identify affected files, integration points, constraints, edge cases, and
    acceptance criteria the goal implies.
  Write a complete design doc to docs/plans/<date>-<slug>-design.auto.md
  (architecture, components, data flow, error handling, testing, acceptance
  criteria — no placeholders). Return ONLY the written path.
  ```

- **B. Human brainstorm** — invoke **`soe:brainstorming`** interactively. It runs
  its collaborative dialogue under its HARD-GATE and writes the approved design
  to `docs/plans/<date>-<slug>-design.human.md`. **Do NOT feed the auto-spec into
  this brainstorm** — keep the human derivation independent of the agent's.

Wait until **both** docs exist before reconciling.

### 5. SPEC VALIDATION with the human (reconciliation)

Invoke the **`soe:spec-reconciliation`** skill with the two independent docs
(`...-design.human.md` and `...-design.auto.md`). It presents a structured 3-way
diff bucketed into:

- **AGREED** — in both → keep.
- **AGENT-only** — the agent inferred it from the codebase; the human missed it
  → human confirms or cuts (catches human omissions).
- **HUMAN-only** — intent the agent missed → keep.
- **CONFLICT** — the two disagree → the human decides (catches hallucination).

The human resolves each bucket. The skill writes the **merged canonical design**
to `docs/plans/<date>-<slug>-design.md`.

### 6. Bind the merged design doc

**BIND** the merged canonical doc — write `design_doc` and `spec_mode: "all"`
into `state.json` via `lib/state.js`, under the writer lock (merge; do not
clobber `tasks`/`loop_state`):

```bash
node -e '
  const ROOT = process.env.CLAUDE_PLUGIN_ROOT;
  import(`${ROOT}/lib/state.js`).then(async (S) => {
    const [dir, docPath] = process.argv.slice(1);
    await S.withWriterLock(dir, () => {
      const st = S.readState(dir) || {};
      S.writeState(dir, { ...st, design_doc: docPath, spec_mode: "all" });
    });
    console.log("bound", docPath);
  });
' "$dir" "docs/plans/<date>-<slug>-design.md"
```

The bound merged `design_doc` — not file presence — is what the loop reads.

### 7. Dispatch the orchestrator

```
Use the soe:soe-orchestrator agent to run the Evaluate-Loop for the track at
.soe/tracks/{id} — it reads the bound design_doc, plans, and drives to COMPLETE.
```

The orchestrator reads caps from `.soe/config.json`, resumes crash-safely, and
drives `PLAN → EVALUATE_PLAN(board) → EXECUTE → EVALUATE_EXEC → (FIX↺ |
COMPLETE)`.

## What happens end-to-end

```
User: /go-all Add a hello world API

1. Precondition   → .soe/ exists (else: run /soe:setup)
2. Resolve track  → .soe/tracks/add-a-hello-world-api/state.json (PLAN, tasks=[])
3. Binding guard  → no bound design_doc → dual-derive
4. Derive x2      → [concurrent] auto-spec subagent → ...-design.auto.md
                    [interactive] soe:brainstorming → ...-design.human.md
                    (independent — auto never sees the human's answers)
5. Reconcile      → soe:spec-reconciliation 3-way diff (AGREED/AGENT-only/
                    HUMAN-only/CONFLICT) → human resolves → merged ...-design.md
6. Bind           → design_doc + spec_mode:"all" in state.json
7. Dispatch       → soe:soe-orchestrator runs the loop from PLAN → COMPLETE
```

## Related

- `/go` — human-in-loop brainstorm only.
- `/go-auto` — autonomous derivation only.
- `soe:spec-reconciliation` — the 3-way reconciliation methodology this uses.
- `soe:brainstorming` — the human-in-loop understanding gate this uses.
- `soe:soe-orchestrator` — the Evaluate-Loop coordinator this command dispatches.
