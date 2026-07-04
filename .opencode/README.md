---
name: soe-opencode-layer1
description: soe Layer-1 discipline index for the OpenCode harness — registers the shared skills/ tree via skills.paths and points at the shared rules/ tree and the shared .soe/ + docs/plans/ committed state. Layer-2 engine is Claude-Code-only in v1.
---

# soe for OpenCode (Layer-1)

This directory packages **soe Layer-1** for the OpenCode harness, per the
design's tiered multi-harness model (§8, resolution F15).

## What Layer-1 is (exposed here)

Layer-1 is the **discipline surface**: skills + rules + adversarial-review
guidance + shared committed collaboration state. It is markdown/packaging —
nothing here re-implements or ports the engine.

This directory does **not** duplicate skill or rule content. `opencode.json`
registers the single shared source of truth:

- **Skills** — `skills.paths` points at the shared `../skills/` tree, so
  OpenCode's native `skill` tool discovers every soe skill directly.
- **Rules** — the shared `../rules/common/*.md` tree; read a rule as
  `../rules/common/<name>.md`.

## Installation

Add soe to the `plugin`/config discovery for OpenCode, or run OpenCode from a
repo that contains this `.opencode/` directory. OpenCode reads
`.opencode/opencode.json`, which registers the shared `../skills` path.

Verify with OpenCode's native skill tool:

```
use skill tool to list skills
use skill tool to load using-soe
```

## Shared committed state (identical across every harness)

Cross-harness collaboration happens through **shared committed state**, not a
runtime bridge. Every harness (Claude Code, Codex, OpenCode) reads and writes
the same two paths, relative to the repo root:

- **`.soe/`** — run/plan/orchestration state (the `.soe/**/run/` subtree is
  gitignored; the rest is committed).
- **`docs/plans/`** — design docs and implementation plans.

The user (Claude Code) runs heavy orchestration; the team (Codex/OpenCode) uses
skills + this shared state. That is the whole collaboration contract, and it is
byte-for-byte the same convention documented in `.codex/AGENTS.md`.

## Discipline skills (shared `../skills/`)

adversarial-review, board-of-directors, brainstorming, capability-discovery,
continuous-learning-v2, dispatching-parallel-agents, escalation-learning,
eval-business-logic, eval-code-quality, eval-integration, executing-plans,
extract-patterns, finishing-a-development-branch, gate-classification,
intent-driven-development, logging-best-practices, model-orchestration,
receiving-code-review, recursive-decision-ledger, regex-vs-llm-structured-text,
requesting-code-review, search-first, security-scan, skill-stocktake,
soe-modes, soe-orchestrator, soe-setup, soe-workers, strategic-compact,
subagent-driven-development, systematic-debugging, test-driven-development,
using-codex, using-git-worktrees, using-graphify, using-soe,
verification-before-completion, writing-plans, writing-skills.

## Rules (shared `../rules/common/`)

agents, clarify-first, coding-style, git-workflow, hooks, logging,
model-routing, patterns, performance, security, testing,
workflow-orchestration.

## Layer-2 (engine) is DEFERRED for OpenCode

The full autonomous **orchestration engine** — the orchestrator loop, worker
fan-out, the context firewall, atomic `state.json` writes, resume, bounded
loops, and the hook-driven session lifecycle — is **coupled to Claude Code's
Task/subagent + hooks primitives** and is **Claude-Code-only in v1**.

**OpenCode engine adapters are deferred / best-effort and are NOT promised
here.** Do not assume the engine runs under OpenCode. Use the discipline
skills + shared state; escalate heavy orchestration to a Claude Code session.
