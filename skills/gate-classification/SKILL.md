---
name: gate-classification
description: Use when reasoning about which pipeline gates may run unattended and which need a human. Classifies every gate as verification (checks reality — always autonomous) or judgment (needs a human call — front-loaded or escalated per soe:soe-modes). Reference from the orchestrator and any skill that decides whether to ask the human or resolve-and-log.
---

# gate-classification — verification vs. judgment gates (design §3.3)

Every gate in the soe pipeline is one of two kinds. Knowing which kind a gate is
tells you **whether it can run unattended**. This is what lets soe run the
execution loop autonomously **without losing discipline**: the disciplined checks
(TDD, review, evaluators, verification-before-completion) never depend on a human
being present, and only the genuinely-human calls are gated on the human.

**The rule of thumb:** ask *"who is being asked for evidence?"* If the gate asks
the **agent** for evidence (tests, a diff, a review verdict), it is a
**verification** gate. If it asks the **human** for a judgment (a direction, an
approval, an ambiguity resolution), it is a **judgment** gate.

## Verification gates — check reality (ALWAYS autonomous)

A verification gate checks a **fact**, not an opinion. It runs a test, inspects a
diff, or renders a reviewer verdict against explicit criteria. There is nothing to
ask a human, so these run autonomously **in every mode** — they ask the AGENT for
evidence, never the human.

Members:

- **TDD red/green** — `soe:test-driven-development` (watch the test fail, then pass).
- **Verification before completion** — `soe:verification-before-completion`
  (run the commands, confirm the output, before any success claim).
- **Code review** — `soe:requesting-code-review` and `soe:receiving-code-review`
  (dispatch a reviewer; evaluate the verdict on technical merit).
- **The evaluators** — `soe:eval-code-quality`, `soe:eval-integration`,
  `soe:eval-business-logic` (score the work product against criteria).

If a "gate" is one of these, do **not** gate it on `mode`. It runs.

## Judgment gates — need human judgment (front-load or escalate)

A judgment gate is a point where the engine *could* defer to a human: there is a
real choice with no ground-truth to check. These are handled per `soe:soe-modes` —
**front-loaded** into interactive setup where possible, and otherwise **escalated
or resolved-and-logged** according to the active mode.

Members:

- **Brainstorming** — `soe:brainstorming` (explore intent and shape the design;
  needs the human's goals and approval).
- **Spec / plan approval** — `soe:writing-plans` (choosing and approving a plan
  direction).
- **Adversarial review** — the board's accept/reject conditions
  (`soe:board-of-directors`): accepting or overriding a board condition is a call,
  not a fact.
- **Genuine ambiguity (clarify-first)** — `soe:intent-driven-development`
  (when a requirement is genuinely ambiguous, clarify with the human before
  proceeding rather than silently guessing).

## How this interacts with soe:soe-modes

`soe:soe-modes` selects **how much the engine asks the human**, and it changes
behavior **at judgment gates only**:

- **Verification gates** run autonomously in all three modes
  (`autonomous-guardrailed`, `interactive`, `fully-agentic`). Mode is irrelevant
  to them — they verify facts.
- **Judgment gates** are mode-dependent. They are front-loaded into interactive
  setup (brainstorm / plan / review) so the execution loop can then run unattended;
  where a judgment call still arises mid-loop it is asked, escalated, or
  resolved-and-logged per the active mode.

The orchestrator (`soe:soe-orchestrator`) applies this by classifying each gate
**with this skill first** — verification → run; judgment → hand to `soe:soe-modes`.

## Red flags (stop and correct)

- Gating a **verification** gate (TDD, review, evaluators,
  verification-before-completion) on `mode`, or pausing it for a human.
- Treating a **judgment** gate (brainstorm, plan approval, board condition,
  genuine ambiguity) as if it were a fact the agent can just verify — silently
  guessing instead of front-loading or escalating.
- Classifying a gate ad-hoc instead of by the "who is asked for evidence?" test.
