---
name: soe-modes
description: Use when configuring or reasoning about soe's interaction level — how much the engine asks vs. resolves autonomously. Defines the three modes (autonomous-guardrailed, interactive, fully-agentic) stored in .soe/config.json `mode`, and how the orchestrator applies each at judgment gates vs. verification gates. Reference from the orchestrator when deciding whether to ask the human or resolve-and-log.
---

# soe-modes — interaction modes (design §3.3)

soe's `mode` (in `.soe/config.json`) selects **how much the engine asks the human
vs. resolves autonomously**. It changes behavior at **judgment gates** only.
**Verification gates always run autonomously** in every mode — they check reality,
they do not ask a human.

The orchestrator reads `.soe/config.json.mode` once at STEP 0 and applies the
matching behavior at each decision point below.

## The three modes

### `autonomous-guardrailed` (DEFAULT)

Approvals are **front-loaded**: the human is consulted up front at
brainstorm / plan / review, and then the **execution loop runs unattended**.
During the loop the orchestrator:

- **Resolves ordinary judgment calls itself**, within its guardrails (the bounded
  fix/plan caps), and **does not stop to ask**.
- **Escalates to the human ONLY** on:
  - **high-impact / irreversible actions** (destructive/irreversible ops,
    security-sensitive or architecturally load-bearing decisions), or
  - **bound-exhaustion** — a loop hitting its cap (`max_fix_cycles` = 5 /
    `max_plan_revisions` = 3). (At a cap the track otherwise finishes
    `completed-with-warnings`; escalation lets the human intervene instead.)
- **Logs every autonomous decision** to `.soe/tracks/{id}/decision-log.md`
  (what was decided, why, alternatives) so the unattended run is auditable.

This is the default because it keeps human attention on the high-value
front-loaded gates while letting the loop grind autonomously and safely.

### `interactive`

**Asks at every judgment gate.** Any point where the guardrailed mode would
resolve-and-log, this mode pauses and asks the human instead. Highest oversight,
lowest autonomy. (Verification gates still run autonomously — see below.)

### `fully-agentic`

**Never asks** — not even on high-impact/irreversible actions or at
bound-exhaustion. Every judgment call is **resolved and logged** to
`.soe/tracks/{id}/decision-log.md`. Maximum autonomy; the decision-log is the
sole audit trail.

## Judgment gates vs. verification gates

The distinction is the crux of this skill:

| Gate kind | Examples | Behavior |
|---|---|---|
| **Judgment gate** — a call that *could* defer to a human | choosing a plan direction, accepting a board condition, resolving an ambiguous requirement, deciding a high-impact/irreversible action, hitting a loop cap | **Mode-dependent** (see table below) |
| **Verification gate** — a check of *reality*, not of opinion | TDD red/green, verification-before-completion, review, evaluators (`soe:eval-code-quality` / `soe:eval-integration` / `soe:eval-business-logic`) | **ALWAYS autonomous, every mode.** They verify facts; there is nothing to ask. |

Behavior at a **judgment gate** by mode:

| Mode | Ordinary judgment call | High-impact / irreversible / bound-exhaustion |
|---|---|---|
| `autonomous-guardrailed` | resolve + log | **escalate to human** |
| `interactive` | **ask human** | **ask human** |
| `fully-agentic` | resolve + log | resolve + log |

**Verification gates never appear in this table** — they run autonomously in all
three modes. Do NOT gate a TDD/eval/review check on `mode`.

## How the orchestrator applies mode

At each judgment gate the orchestrator (see `soe:soe-orchestrator`) consults the
`mode` it read at STEP 0 and:

1. Classify the gate: **verification** → run autonomously, done (mode is
   irrelevant). **judgment** → continue.
2. Classify the judgment call: **high-impact/irreversible** or
   **bound-exhaustion**? vs. ordinary.
3. Apply the mode row above: ask, escalate, or resolve-and-log.
4. When the resolution is autonomous (resolve/escalate paths that proceed),
   append the decision to `.soe/tracks/{id}/decision-log.md`.

## Red flags (stop and correct)

- Gating a **verification** check (TDD, evaluators, review,
  verification-before-completion) on `mode` — these are always autonomous.
- `autonomous-guardrailed` stopping to ask on an **ordinary** judgment call
  (it should resolve + log; it only escalates on high-impact/irreversible or
  bound-exhaustion).
- `fully-agentic` pausing to ask a human on anything.
- Resolving a judgment call autonomously **without** appending to
  `.soe/tracks/{id}/decision-log.md`.
- Reading `mode` per-gate from disk instead of the value captured at STEP 0.
