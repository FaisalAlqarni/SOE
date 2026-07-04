# soe

**soe** is a Claude Code plugin that pairs a **Superpowers 6.1.1 discipline
pipeline** with a **simplified, tested multi-agent orchestration engine** — the
*Evaluate-Loop* — and layers on the best of Everything Claude Code's
process/meta tooling, session-model-led **multi-model orchestration**, and
token-efficient **cross-plugin capability discovery**.

In one line: *disciplined intent → plan → TDD → verify, driven autonomously by a
crash-safe, human-debuggable engine that uses whatever the best installed
specialist for each job is.*

## What you get

- **Discipline pipeline** — `soe:brainstorming` → `soe:writing-plans` →
  `soe:test-driven-development` → `soe:verification-before-completion`, ported
  from Superpowers 6.1.1.
- **The Evaluate-Loop engine** — `/go <goal>` runs
  `PLAN → EVALUATE_PLAN → EXECUTE → EVALUATE_EXEC → (FIX↺ | COMPLETE)` over a
  durable `.soe/` state layer, with worktree workers, a context firewall, a
  sole-serial-writer state store, deterministic risk/scrutiny gating, and
  bounded loops. Every integrity-critical decision is **real, tested code**
  (249 passing tests), not prose in a prompt.
- **Multi-model orchestration** — the session model *is* the orchestrator and
  delegates to tier-pinned agents (Fable `soe:strategist`, Opus
  `soe:deep-reasoner`, Sonnet `soe:fast-worker`).
- **Cross-plugin capability discovery** — role-routing that prefers the best
  installed specialist and falls back to soe-core generics; soe-core never
  hard-depends on any pack.
- **Best-of-ECC process/meta** — instincts (`/soe:instinct-*`, `/soe:learn`,
  `/soe:evolve`, `/soe:skill-create`), logging tooling, and self-audit.

## Quickstart

```
# 1. Install the soe plugin (add the soe marketplace, install `soe`, restart Claude Code)
# 2. Scaffold the project state layer:
/setup
# 3. Drive a goal end-to-end:
/go Add Stripe payment integration
```

That's it. `/go` plans, executes, evaluates, and fixes autonomously; it escalates
only genuine judgment calls. See [`docs/USAGE.md`](docs/USAGE.md) for ambient
use, the review commands (`/soe:critique`, `/soe:self-audit`), and the manual
discipline pipeline.

## Documentation

- [`docs/USAGE.md`](docs/USAGE.md) — how to use soe day to day.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the engine, libs, gates,
  discovery, and multi-harness model (the human-debuggability reference).
- [`docs/MIGRATION.md`](docs/MIGRATION.md) — clean-break migration from `sp-ecc`.
