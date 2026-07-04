---
name: soe-codex-layer1
description: soe Layer-1 discipline index for the Codex CLI harness — points at the shared skills/ + rules/ trees and the shared .soe/ + docs/plans/ committed state. Layer-2 engine is Claude-Code-only in v1.
---

# soe for Codex CLI (Layer-1)

This directory packages **soe Layer-1** for the Codex CLI harness. It follows
the design's tiered multi-harness model (§8, resolution F15).

## What Layer-1 is (exposed here)

Layer-1 is the **discipline surface**: skills + rules + adversarial-review
guidance + a shared, committed collaboration state. It is markdown/packaging —
nothing here re-implements or ports the engine.

This directory does **not** duplicate skill or rule content. It *references*
the single shared source of truth:

- **Skills** — the shared `../skills/` tree (each `<name>/SKILL.md`).
- **Rules** — the shared `../rules/common/*.md` tree.

Load a skill by reading `../skills/<name>/SKILL.md`. Load a rule by reading
`../rules/common/<name>.md`.

## Shared committed state (identical across every harness)

Cross-harness collaboration happens through **shared committed state**, not a
runtime bridge. Every harness (Claude Code, Codex, OpenCode) reads and writes
the same two paths, relative to the repo root:

- **`.soe/`** — run/plan/orchestration state (the `.soe/**/run/` subtree is
  gitignored; the rest is committed).
- **`docs/plans/`** — design docs and implementation plans.

The user (Claude Code) runs heavy orchestration; the team (Codex/OpenCode) uses
skills + this shared state. That is the whole collaboration contract.

## Discipline skills (shared `../skills/`)

- adversarial-review
- board-of-directors
- brainstorming
- capability-discovery
- continuous-learning-v2
- dispatching-parallel-agents
- escalation-learning
- eval-business-logic
- eval-code-quality
- eval-integration
- executing-plans
- extract-patterns
- finishing-a-development-branch
- gate-classification
- intent-driven-development
- logging-best-practices
- model-orchestration
- receiving-code-review
- recursive-decision-ledger
- regex-vs-llm-structured-text
- requesting-code-review
- search-first
- security-scan
- skill-stocktake
- soe-modes
- soe-orchestrator
- soe-setup
- soe-workers
- strategic-compact
- subagent-driven-development
- systematic-debugging
- test-driven-development
- using-codex
- using-git-worktrees
- using-graphify
- using-soe
- verification-before-completion
- writing-plans
- writing-skills

## Rules (shared `../rules/common/`)

- agents
- clarify-first
- coding-style
- git-workflow
- hooks
- logging
- model-routing
- patterns
- performance
- security
- testing
- workflow-orchestration

## Layer-2 (engine) is DEFERRED for Codex

The full autonomous **orchestration engine** — the orchestrator loop, worker
fan-out, the context firewall, atomic `state.json` writes, resume, bounded
loops, and the hook-driven session lifecycle — is **coupled to Claude Code's
Task/subagent + hooks primitives** and is **Claude-Code-only in v1**.

**Codex engine adapters are deferred / best-effort and are NOT promised here.**
Do not assume the engine runs under Codex. Use the discipline skills + shared
state; escalate heavy orchestration to a Claude Code session.
