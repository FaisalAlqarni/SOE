# Model Routing

> Route each unit of work to the right model tier. soe is **session-model-led**: the model you pick with `/model` is the orchestrator; it delegates to tier-pinned subagents.

## Tiers (aliases used in agent `model:` frontmatter)

| Alias | Role agent | Use for |
|------|------|---------|
| **`sonnet`** | `fast-worker` | Mechanical work: implementation, boilerplate, tests, formatting, simple edits |
| **`opus`** | `deep-reasoner` | Reasoning-heavy: architecture, complex debugging, algorithm design, review |
| **`fable`** | `strategist` | Hardest / longest-horizon judgment (optional top tier; falls back to Opus if unavailable) |

Never pin a full model ID (e.g. `claude-fable-5`) — use the alias.

## Session-model-led topology

The orchestrator applies the profile for its own model (see `skills/model-orchestration/SKILL.md`):
- **On Fable** → Fable orchestrates; delegates reasoning to `deep-reasoner`, mechanical to `fast-worker`.
- **On Opus** → Opus orchestrates; mechanical → `fast-worker`; reasoning stays local or `deep-reasoner`; `strategist` only if Fable is available.
- **On Sonnet** → Sonnet orchestrates; reasoning → `deep-reasoner`, mechanical stays local.

Graceful by construction: absent tiers (Fable) are simply not used. No Advisor (API-only), no runtime auto-fallback, no forced spend gate — the user picks the model.

## Quick decision

1. "Do I need top-tier judgment on a hard, high-stakes call?" → **`strategist` (fable)**
2. "Do I need to THINK deeply / reason / review?" → **`deep-reasoner` (opus)**
3. "Do I need to BUILD or apply mechanically?" → **`fast-worker` (sonnet)**

## Bug escalation

- Start bugs on `sonnet`.
- Escalate to `deep-reasoner` (opus) after 3+ failed fixes, circular investigation, or scope expansion to 5+ files.
- Self-check after each attempt: Fixes tried [N] | Files touched [N] | Confidence [H/M/L].

## Context firewall (token frugality)

Delegated subagents write full output to scratch and return only `path + 3-line summary + confidence`; the orchestrator reads on demand. Keeps the orchestrator's context lean.

## Reference

Full methodology, per-slice routing, and profiles → `skills/model-orchestration/SKILL.md`.
