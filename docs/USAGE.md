# Using `soe`

`soe` gives you two ways to work: **ambient** (just talk to the model — the
multi-model methodology is always on) and the **Evaluate-Loop** (`/go`, the
tested orchestration engine). You can also drive the classic **discipline
pipeline** by hand. Pick the level of ceremony the task deserves.

## Install

`soe` is a Claude Code plugin. Add the `soe` marketplace and install the `soe`
plugin, then restart Claude Code so the skills, agents, and commands are
discovered. (Multi-harness note: the `.codex/` and `.opencode/` directories
expose soe's **Layer-1 discipline surface** — skills + rules + shared committed
state — to the Codex CLI and OpenCode harnesses; the Layer-2 engine is
Claude-Code-only in v1. See [`ARCHITECTURE.md`](ARCHITECTURE.md).)

## First run: `/setup`

Before using the engine in a project, scaffold its state layer:

```
/setup
```

This runs the tested `lib/setup.js` scaffolder (idempotent, resumable). It
creates:

- `.soe/config.json` — engine mode + thresholds + model defaults
- `.soe/tracks/` — per-track durable state lives here
- `.soe/setup_state.json` — for resumable setup
- a **managed block** in `.gitignore` that ignores only *ephemeral* run-state
  while keeping *durable* memory (`docs/plans/`, per-track `*.md` + `state.json`)
  committable.

## Ambient multi-model use (no pipeline)

For everyday work you don't need any command. The **session model you picked is
the orchestrator** (`soe:model-orchestration`): it self-selects a topology from
its own identity and delegates slices to tier-pinned agents —
`soe:strategist` (Fable, highest-stakes judgment), `soe:deep-reasoner` (Opus,
reasoning-heavy with fresh context), and `soe:fast-worker` (Sonnet, mechanical
work). Just describe what you want; the model routes.

## `/go` — the full Evaluate-Loop

For a real deliverable, state a goal:

```
/go Add Stripe payment integration
/go Fix the login bug where users get logged out
/go            # bare: resume the active / most-recent track
```

`/go` resolves the goal to a **track**, ensures it has a persisted `state.json`,
and hands off to `soe:soe-orchestrator`, which drives:

```
PLAN → EVALUATE_PLAN → EXECUTE → EVALUATE_EXEC → (FIX ↺ | COMPLETE)
```

The orchestrator dispatches leaf agents and worktree workers, applies their
validated returns serially, is the sole writer of `state.json`, resumes
crash-safely from committed state, and bounds its loops (max 5 fix cycles, max 3
plan revisions). It runs **autonomously** on verification gates and only
escalates genuine judgment calls (governed by the mode in `.soe/config.json` —
see `soe:soe-modes`).

## On-demand review commands

- **`/soe:critique design <file>`** / **`/soe:critique plan <file>`** — red-team
  a design or plan doc *before* executing it. Dispatches `soe:devils-advocate`
  (Opus, fresh context) using `soe:adversarial-review`, returns numbered
  findings, then offers *discuss all / some / continue*.
- **`/soe:self-audit`** — build/release-time audit of soe's **own** plugin
  config (frontmatter validity + reference integrity + an AgentShield scan).
  This is soe inspecting *itself*, distinct from `/soe:critique`.

## The discipline pipeline (by hand)

When you want the classic disciplined flow explicitly:

1. **Brainstorm** — `soe:brainstorming` explores intent and requirements.
2. **Plan** — `soe:writing-plans` turns the spec into bite-sized tasks.
3. **Execute** — `soe:subagent-driven-development` / `soe:executing-plans`
   implement the tasks (TDD via `soe:test-driven-development`).
4. **Review** — `soe:requesting-code-review` / `soe:verification-before-completion`,
   plus specialist agents (`soe:code-reviewer`, `soe:security-reviewer`,
   `soe:refactor-cleaner`, `soe:e2e-runner`, `soe:logging-reviewer`).

`/go` runs a superset of this automatically; the manual pipeline is for when you
want to stay in the driver's seat.

## Where state lives

- **Durable, committed** — `docs/plans/*` and per-track
  `.soe/tracks/{id}/*.md` + `state.json`. This is the engine's memory across
  sessions; keep it in git.
- **Ephemeral, ignored** — per-run scratch dirs and transient worker-status
  files under `.soe/`, covered by the managed `.gitignore` block. Recreated
  every run; never committed.

## Cross-plugin capability discovery

At run start, `soe:capability-discovery` builds a `role → best-provider` map
across every installed plugin. If a better specialist is installed (a Go
reviewer, a Flutter reviewer, AgentShield, `graphify` for retrieval/blast-radius
via `soe:using-graphify`, or the experimental `codex-peer` via
`soe:using-codex`), the loop prefers it; otherwise soe-core's generic reviewers
run unchanged. **soe-core never hard-depends on any pack.**
