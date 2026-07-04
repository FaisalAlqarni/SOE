---
name: model-orchestration
description: Session-model-led multi-model tiering. Use in ANY conversation (ambient) or in the pipeline to decide which model tier does which slice of work, and to delegate to the right model-pinned agent (strategist/deep-reasoner/fast-worker). The session model you selected IS the orchestrator; it self-selects its topology from its own model identity.
---

# Model Orchestration

**The session model the user picked is the orchestrator.** You do not detect or switch the session model — you *are* it. Subagents are pinned to other tiers via `model:` **alias** frontmatter (`fable` / `opus` / `sonnet` — never full IDs). Match your own identity to a profile below and delegate accordingly.

## Tiers (aliases, never full IDs)

| Agent | Alias | For |
|---|---|---|
| `strategist` | `fable` | Hardest, longest-horizon, highest-stakes / irreversible judgment. |
| `deep-reasoner` | `opus` | Reasoning-heavy: complex debugging, architecture, algorithm design (fresh context). |
| `fast-worker` | `sonnet` | Mechanical: boilerplate, tests-to-spec, formatting, simple edits. |

## Per-slice routing — score the work, not the vibe

Rate each unit of work on three axes, then pick the tier:

- **Stakes** — how expensive is a wrong answer?
- **Reversibility** — how hard to undo? (low reversibility ⇒ raise the tier)
- **Ambiguity** — how much genuine judgment vs. mechanical follow-through?

High on all three → `strategist` (Fable). High reasoning/ambiguity, recoverable → `deep-reasoner` (Opus). Low/low/well-specified → `fast-worker` (Sonnet). When unsure, prefer the cheaper tier and escalate on signal — but **never downscope work touching auth, secrets, payments, migrations/deletions, or prod**: those always get full scrutiny regardless of size.

## Topology profiles — self-select from your own model

You know which model you are running as. Apply the matching profile:

- **On Fable** → *you* orchestrate. Delegate reasoning to `deep-reasoner` (opus), mechanical to `fast-worker` (sonnet). **No `strategist`** — you already are the top tier.
- **On Opus** → you orchestrate. Mechanical → `fast-worker` (sonnet); reasoning stays with you or a fresh-context `deep-reasoner`; call `strategist` (fable) **only** for irreversible high-stakes calls, and **only if the user has Fable**.
- **On Sonnet** → you orchestrate. Reasoning → `deep-reasoner` (opus); mechanical stays local with you.

Absent tiers (Fable, or Codex) are simply not used — soe-core never hard-depends on them. Pick a model, get the matching topology.

## Context firewall (token discipline)

Delegated agents write full output to a shared scratch path (an **absolute** path outside any worktree) and return **only** `path + 3-line summary + confidence`. Trust the summary; pull the full file only when you must. This keeps your context clean across many delegations.

## Two usage levels

- **Ambient** — no `/go`, no track, no state. In *any* conversation (ad-hoc debugging, review, enhancement) you choose to spawn the right pinned agent per this skill. This is a *convention you follow*, not an enforced router.
- **Pipeline** — opt-in `/go`. The Evaluate-Loop's own agents are already pinned to their tiers; do not duplicate the tiering here.

## Explicitly out of scope

- **No Advisor** — no API-only side model; the user is on a subscription.
- **No runtime auto-fallback** — the user picks the model via `/model`; you never silently switch the session model.
- **No deterministic Fable-spend gate** — Fable spend is user-managed. Use `strategist` on merit (stakes/reversibility/ambiguity), not a hard budget rule.
