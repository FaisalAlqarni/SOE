<h1 align="center">soe</h1>

<p align="center">
  <em>Disciplined intent → plan → TDD → verify — driven autonomously by a crash-safe, human-debuggable engine that uses the best installed specialist for every job.</em>
</p>

---

**soe** fuses three things into one Claude Code plugin:

- the **Superpowers 6.1.1 discipline pipeline** (brainstorm → plan → TDD → verify),
- a **simplified, *tested* multi-agent orchestration engine** — the *Evaluate-Loop*, adapted from Conductor (parallel workers, Board of Directors, quality gates, bounded loops) with every integrity-critical decision as **real code, not prose in a prompt**,
- and the **best of Everything Claude Code** (instincts, logging, self-audit) — plus **session-model-led multi-model orchestration**, **token-efficient cross-plugin discovery**, and a **minimal-code** discipline.

> **41 skills · 22 agents · 16 commands · 13 tested `lib/` modules · ~265 passing tests.**

## What This Project Provides

**One engine, three front doors.** A single autonomous loop (`PLAN → EVALUATE_PLAN → EXECUTE → EVALUATE_EXEC → (FIX↺ | COMPLETE)`) fronted by three entry commands that differ only in how the spec is derived:

| Command | How the spec is derived |
|---|---|
| `/go <goal>` | **Human-in-the-loop brainstorm** first (aligns intent, cuts hallucination), then the loop |
| `/go-auto <goal>` | **Autonomous** spec from goal + codebase, then the loop |
| `/go-all <goal>` | Brainstorm **∥** an *independent* background auto-spec → **3-way reconciliation** (you decide) → the loop |

**Real, not fictional.** The reliability-critical machinery is tested Node code: atomic + single-writer state store, crash-safe resume with idempotency, bounded fix/plan loops, a deterministic risk matrix + fail-safe scrutiny, a context-firewall validator. Prompt-following handles the *reasoning*; code handles the *guarantees*.

**Token-frugal by design.** Lean core (language depth comes from installed plugins, not a monolith), context firewall on delegated work, collapsed-vs-full Board by stakes, and an always-on **minimal-code** discipline (write the shortest working diff — code only, never docs, never on high-stakes shortcuts).

## How It Works

You state a goal with `/go`. Instead of guessing, the agent first sits down with you and **brainstorms the intent** — teasing a design out of the conversation, showing it back in digestible chunks, and binding an approved design doc to the track. (Already brainstormed? It skips straight to planning. Want it fully autonomous? Use `/go-auto`. Want both derivations cross-checked? `/go-all`.)

Then the **Evaluate-Loop** takes over. `loop-planner` writes a phased plan + dependency DAG using the `writing-plans` discipline. The **Board of Directors** reviews the plan (a cheap single-pass 5-lens review by default; a full 5-persona vote for high-stakes changes), and a **devil's-advocate** gate red-teams it against the design. Approved, it **executes tasks as parallel workers in isolated git worktrees** — each following mandatory TDD — while the orchestrator, the *sole writer* of state, applies their validated results serially. `EVALUATE_EXEC` runs the right evaluators for what changed (code quality, integration, security, over-engineering, E2E); failures loop back through a **bounded** `FIX` (max 5). Crash mid-run? It resumes from the single source of truth and never re-runs finished work.

It escalates only genuine judgment calls or irreversible actions — and **learns from each escalation**, so routine interruptions fade over time. Everything durable (specs, plans, decisions, learned patterns) lives in `docs/plans/` + `.soe/`, committed and shareable; transient run-state is ignored.

**Prefer no ceremony?** Every piece works ambient, no `/go` needed: run `/soe:simplify` on a diff, `/soe:critique` on a design, `/soe:self-audit` on the plugin, or invoke the discipline skills directly.

## Installation

### Quick Install (Recommended)

In Claude Code:

```bash
# 1. Register the marketplace
/plugin marketplace add FaisalAlqarni/soe

# 2. Install the plugin
/plugin install soe@soe-marketplace
```

Then restart Claude Code.

### Manual Installation (Alternative)

**1. Clone:**
```bash
git clone https://github.com/FaisalAlqarni/soe
cd soe
```

**2. Symlink into the Claude Code plugins directory:**

**macOS/Linux:**
```bash
ln -s "$(pwd)" ~/.claude/plugins/soe
```

**Windows:**
```bash
mklink /D "%USERPROFILE%\.claude\plugins\soe" "C:\path\to\soe"
```

**3. Restart Claude Code.**

### First run

```bash
/setup                                  # scaffold the .soe/ state layer for this project
/go Add Stripe payment integration      # brainstorm → plan → execute → verify, autonomously
```

### Verify Installation

- Ask *"help me plan this feature"* → should trigger `soe:brainstorming`.
- Type `/soe:go` → should show the entry command.
- Run `/soe:self-audit` → should run soe's own validity + reference + security checks.

### Updating

```bash
/plugin update soe            # if installed via marketplace
# or, manual:
cd /path/to/soe && git pull
```

### Optional companions (discovered, never required)

soe auto-detects and uses these if installed, and degrades gracefully if not:

- **[graphify](https://github.com/safishamsi/graphify)** — code knowledge-graph for token-efficient retrieval **and** real dependency blast-radius in the risk matrix.
- **chrome-devtools-mcp** — browser E2E (network/console/perf/Lighthouse) for the `e2e-runner`; falls back to Playwright, skips if absent.
- **OpenAI Codex plugin** — a different-perspective peer for high-stakes parallel synthesis.
- **ECC / `soe-extras`** — language-depth packs; their specialist reviewers are preferred by role, with soe-core generics as fallback.

## The Evaluate-Loop

```
/go <goal>
  └─ (brainstorm w/ human → bound design doc) ──► the autonomous loop:

     PLAN ─► EVALUATE_PLAN ─► EXECUTE ─► EVALUATE_EXEC ─► COMPLETE
              │(Board + devil's-advocate)  (parallel workers)  │(quality gates)
              └ fail ─► revise (max 3)                          └ fail ─► FIX (max 5) ─┐
                                                                    ▲──────────────────┘
```

- **PLAN** — `loop-planner` (opus) writes the plan+DAG following `writing-plans`.
- **EVALUATE_PLAN** — collapsed Board by default; full Board + adversarial `devils-advocate` for high-stakes (selected by the deterministic risk matrix, never ad hoc).
- **EXECUTE** — workers in isolated worktrees, mandatory TDD, results validated by the context firewall and applied serially by the sole state writer.
- **EVALUATE_EXEC** — the evaluator dispatches the right lenses for what changed; over-engineering + E2E + observability checks run when relevant.
- **FIX** — bounded loop-back; at the cap it finishes `completed-with-warnings` rather than spinning.

## What's Inside

**Discipline pipeline** (Superpowers 6.1.1): `brainstorming`, `writing-plans`, `executing-plans`, `subagent-driven-development`, `test-driven-development`, `systematic-debugging`, `verification-before-completion`, `using-git-worktrees`, `finishing-a-development-branch`, `requesting/receiving-code-review`, `writing-skills`, `dispatching-parallel-agents`.

**Engine agents:** `soe-orchestrator`, `loop-planner`, `loop-executor`, `loop-execution-evaluator`, `loop-fixer`, `board-meeting`, `devils-advocate`.

**Multi-model role agents:** `strategist` (fable), `deep-reasoner` (opus), `fast-worker` (sonnet).

**Specialist agents:** `code-reviewer`, `security-reviewer`, `architect`, `tdd-guide`, `build-error-resolver`, `refactor-cleaner`, `doc-updater`, `e2e-runner`, `database-reviewer`, `logging-reviewer`, `over-engineering-reviewer` / `over-engineering-auditor`.

**Commands** (`/soe:*`):
```
/go  /go-auto  /go-all   Entry points (brainstorm / autonomous / dual cross-check)
/setup                   Scaffold the .soe/ state layer
/critique                Adversarial design/plan review (devil's advocate)
/simplify  /over-eng-audit   Minimal-code lens (diff / repo), on demand
/self-audit              soe reviews itself (validity + refs + AgentShield)
/logging                 Wide-events logging audit/refactor
/learn  /learn-eval  /evolve  /instinct-*   The continuous-learning / instinct system
/skill-create
```

**Tested `lib/` engine (13 modules):** `state` (atomic + single-writer lock), `resume` (crash-safe + idempotency), `loop-guard` (bounded loops), `risk-matrix` + `scrutiny` (deterministic fail-safe), `escalation` (irreversible-always-confirm), `board-verdict`, `firewall-return`, `capability-scan`, `codex-detect`, `gitignore-manager`, `setup`, `skills-core`.

**Hooks:** SessionStart bootstrap, PreToolUse destructive-git guard, PostToolUse formatting, learning-eval, compaction nudges.

**Rules** (`rules/common/`): always-on baselines for coding-style, model-routing, agents, testing, security, logging, performance, git-workflow, hooks, patterns, clarify-first, workflow-orchestration — compiled into the skills that need them.

## Multi-Model Orchestration

The model you pick with `/model` **is** the orchestrator; it delegates to tier-pinned subagents and self-selects a topology:

- **On Fable** → Fable orchestrates → `deep-reasoner` (opus) for reasoning, `fast-worker` (sonnet) for mechanical.
- **On Opus** → Opus orchestrates → `fast-worker` for mechanical; `strategist` (fable) only for top-stakes if available.
- **On Sonnet** → Sonnet orchestrates → `deep-reasoner` for reasoning.

Fable/Codex are optional top tiers with graceful fallback; a **context firewall** keeps the orchestrator's context lean (delegates return `path + 3-line summary + confidence`). See `skills/model-orchestration/SKILL.md`.

## Minimal-Code Discipline

Adapted from [ponytail](https://github.com/DietrichGebert/ponytail): implementation workers write the **shortest working, understood diff** (reuse → stdlib → native → minimal), with intensity scaled by risk (trivial → ultra, high-stakes → lite + guardrails). Strictly **code-only** (never minimizes docs) and **implementation-only** (never dulls reviewers/security). An advisory `over-engineering-reviewer` lens hunts reducible code; run it on demand with `/soe:simplify`.

## Philosophy

- **Integrity first, then simplicity, then tokens** — never trade correctness or safety for brevity.
- **Guarantees in code, reasoning in prompts** — the loop's invariants are tested, not asserted.
- **Human-debuggable** — plain markdown + small tested libs; a human can read and trace it.
- **Test-Driven** — RED → GREEN → REFACTOR, always.
- **Token-frugal** — lean core, context firewall, right-sized ceremony.
- **Graceful, never hard-depend** — discover and use what's installed; fall back cleanly.

## Documentation

- [`docs/USAGE.md`](docs/USAGE.md) — day-to-day use, ambient commands, the manual discipline pipeline.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the engine, the `lib/` modules, gates, discovery, multi-model, multi-harness (the human-debuggability reference).
- [`docs/MIGRATION.md`](docs/MIGRATION.md) — clean-break migration from `sp-ecc`.
