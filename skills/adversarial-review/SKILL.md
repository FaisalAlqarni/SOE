---
name: adversarial-review
description: "Red-team a design or plan document before it is executed — the runtime critique gate (design §3.4). Hostile, from-scratch review against the quality lens (integrity, simplicity, maintainability, readability, scalability, performance, human-debuggability) + correct pattern usage. Two modes: design mode finds gaps/inconsistencies/missing pieces/pattern misuse; plan mode adds a design↔plan cross-reference (no drift, gaps, or scope creep). Output: numbered findings, then ask discuss all / some / continue. Executed by the soe:devils-advocate agent via /soe:critique, and wired into the orchestrator's EVALUATE_PLAN gate. Use when: 'red-team this', 'critique the plan/design', 'find the holes', 'adversarial review'."
---

# adversarial-review — the runtime critique gate (design §3.4)

This skill is the **single source of truth** for how soe red-teams a design or a
plan **before** any of it is executed. It is deliberately **adversarial**: you are
not here to agree, to reassure, or to polish prose. You are here to find what is
**wrong, missing, inconsistent, or over-built** while it is still cheap to fix —
on paper, before a worker touches code.

**Announce at start:** "I'm using the adversarial-review skill to red-team this
{design|plan}."

This methodology is the same regardless of who runs it. It is invoked:

- interactively by a human via `/soe:critique [design|plan] <file>`,
- by the `soe:devils-advocate` agent (fresh isolated context — the sanctioned
  hostile executor), and
- automatically by `soe:soe-orchestrator` at the `EVALUATE_PLAN` gate.

## Posture — be hostile, not agreeable

- **Assume the artifact is flawed until proven otherwise.** A "looks good" pass is
  a failure of this skill.
- **Attack the artifact, not the author.** The target is the document.
- Do **not** soften findings, do **not** pad with praise, do **not** invent
  filler. Every finding must be a *real, specific* problem you can point at.
- Prefer **fewer, sharper** findings over a long list of nitpicks. If it would not
  change the design or plan, it is not a finding.

## The quality lens (score every finding against this)

Judge the artifact — and every finding — against this ordered lens:

1. **integrity** — correctness, soundness, does it actually do the thing; no
   silent data loss, no broken invariants, no unhandled failure modes.
2. **simplicity** — is there a materially simpler design/plan that meets the same
   goal? Over-engineering and speculative generality are findings.
3. **maintainability** — can this be changed later without a rewrite?
4. **readability** — can a fresh engineer understand it?
5. **scalability** — does it hold up as inputs / load / scope grow?
6. **performance** — obvious inefficiency, N+1, unbounded work.
7. **human-debuggability** — when it breaks in production, can a human see *why*
   (logs, error surfaces, observability, clear failure boundaries)?

Plus **correct pattern usage** — is the right pattern applied for the problem, and
applied correctly? Cargo-culted, misapplied, or missing-where-required patterns
are findings.

Earlier lenses dominate: an integrity hole outranks a performance nit.

## The two modes

### design mode — red-team a design doc

Target: a design / architecture / spec document. Hunt for:

- **Gaps** — requirements, flows, states, or failure modes the design never
  addresses (what happens on error? on concurrency? on partial failure? on
  resume?).
- **Inconsistencies** — two parts of the doc that contradict each other, or a
  stated goal the design does not actually satisfy.
- **Missing pieces** — components, contracts, migrations, or rollback paths that
  are implied but never specified.
- **Pattern misuse** — the wrong architectural pattern for the problem, or a
  pattern applied incorrectly / where a simpler one would do.
- Anything that scores poorly on the quality lens above.

### plan mode — red-team a plan doc PLUS cross-reference it against its design

Target: an implementation plan (typically `docs/plans/*-plan.md`). Do
**everything design mode does on the plan itself**, AND — the defining addition —
a **design↔plan cross-reference**:

- **Faithfulness** — does the plan actually implement what the design specifies?
  Walk the design's requirements and confirm each is covered by a plan task.
- **Drift** — has the plan quietly changed decisions the design made (different
  approach, different contract, different sequencing) without justification?
- **Gaps** — design requirements with **no** corresponding plan task (silently
  dropped scope).
- **Scope creep** — plan tasks that implement things the design never asked for
  (gold-plating, unrequested features, speculative work).

If the design doc is not available, say so explicitly and fall back to design-mode
scrutiny of the plan on its own — but flag the missing cross-reference as a
limitation of the review.

## Output — a numbered findings list, then hand control to the human

Emit a **numbered list** of findings. Each finding is one line: a short title and
a one-sentence description of the problem and which lens it violates. Order by
severity (integrity/faithfulness first).

```
Adversarial review — {design|plan} mode — <file>

1. <short title> — <one-sentence problem + which lens/cross-ref it fails>.
2. <short title> — <one-sentence problem>.
3. ...

(If plan mode: findings 1..k are plan-internal; the design↔plan cross-reference
findings are called out as such.)
```

Then **ask the human how to proceed** — offer exactly these three:

```
How do you want to handle these findings?

1. Discuss all — walk every finding one-by-one.
2. Discuss some — you pick which findings to dig into.
3. Continue — proceed as the reviewer sees fit (I'll resolve/fold in the rest).

Which?
```

Do not start discussing or resolving until the human chooses — this is a
**judgment gate** (`soe:gate-classification`), so in interactive use it stops for
the human.

## In the autonomous loop

When `soe:soe-orchestrator` runs this at `EVALUATE_PLAN` in an autonomous mode
(`autonomous-guardrailed` / `fully-agentic`, per `soe:soe-modes`), there is no
human to pick 1/2/3. Instead the orchestrator **feeds the findings into a bounded
plan revision** (the `max_plan_revisions` guard) and **logs** the findings and
their disposition to `.soe/tracks/{id}/decision-log.md`. The methodology — the
lens, the two modes, the numbered findings — is identical; only the "who decides"
step changes.

## Red flags (you are doing it wrong if…)

- You concluded "looks good" without a genuine attempt to break it.
- You padded the list with cosmetic nitpicks that change nothing.
- In plan mode you skipped the design↔plan cross-reference.
- You started resolving findings before the human chose all/some/continue (in
  interactive use).
- You attacked the author instead of the artifact.
