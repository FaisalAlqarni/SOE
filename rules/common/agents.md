# Agent Orchestration

> soe ships an orchestration engine plus specialist agents. The engine coordinates; you rarely dispatch engine agents by hand.

## Engine agents (dispatched by the Evaluate-Loop, not by you)

| Agent | Role |
|-------|------|
| `soe-orchestrator` | The Evaluate-Loop coordinator (session model); sole writer of `.soe/tracks/{id}/state.json` |
| `loop-planner` | PLAN phase — writes the plan+DAG following the `soe:writing-plans` discipline |
| `loop-executor` / worker template | EXECUTE — implementation workers in isolated worktrees |
| `loop-execution-evaluator` | EVALUATE_EXEC — selects + dispatches the right evaluators/reviewers by what changed |
| `loop-fixer` | Bounded FIX loop (max 5 cycles) |
| `board-meeting` | Full Board of Directors (5 personas) for high-stakes plans |
| `devils-advocate` | Adversarial review (design/plan modes) |

## Model-tier role agents (multi-model, see `model-routing.md`)

| Agent | Pin | Use |
|-------|-----|-----|
| `strategist` | fable | Top-tier judgment (high-stakes) |
| `deep-reasoner` | opus | Reasoning/debug/architecture |
| `fast-worker` | sonnet | Mechanical implementation |

## Specialist agents (dispatched by the evaluator, or `@`-invoked ad hoc)

| Agent | Use |
|-------|-----|
| `code-reviewer` | Code review (after writing code) |
| `security-reviewer` | Security analysis (before commits) |
| `architect` | System/architectural design |
| `tdd-guide` | Test-first guidance |
| `build-error-resolver` | Fix build errors |
| `refactor-cleaner` | Dead-code cleanup |
| `doc-updater` | Documentation sync |
| `e2e-runner` | E2E testing (browser via chrome-devtools-mcp if present, else Playwright; skips if absent) |
| `database-reviewer` | Schema/query review |
| `logging-reviewer` | Wide-events logging review |
| `over-engineering-reviewer` / `over-engineering-auditor` | Advisory over-engineering lens (diff / repo) — code only |

Language-specific reviewers (Go, Python, etc.) are discovered from installed plugins (e.g. ECC) by role — soe-core falls back to the generic reviewer when a specialist isn't installed.

## Parallel execution

Use parallel Task execution for independent operations; the engine runs workers in parallel worktrees and applies results serially. Dispatch subagents liberally to keep the main context lean — offload research/exploration, not just implementation. One focused task per subagent.

## Guard

The **minimal-code** discipline applies to *implementation* workers only — never to review/security/audit/spec agents (they stay thorough) and never to documentation (code only).
