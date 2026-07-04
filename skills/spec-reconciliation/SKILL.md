---
name: spec-reconciliation
description: "Use when you have TWO independently-derived design docs (a human brainstorm + an autonomous codebase-derived spec) for the same goal and need to reconcile them into one canonical design. Presents a 3-way diff (AGREED / AGENT-only / HUMAN-only / CONFLICT) the human resolves, then writes the merged design. Cross-checks catch human omissions and agent hallucinations."
---

# Spec Reconciliation — 3-Way Cross-Check of Two Independent Designs

> Gate type: **judgment** (human-present — the human resolves every non-AGREED
> bucket). See `soe:gate-classification`.

You are given TWO design docs for the SAME goal, derived **independently**:

- **HUMAN** — from a human brainstorm (`soe:brainstorming`): the human's intent,
  priorities, and product judgment.
- **AGENT** — from an autonomous codebase analysis: requirements the agent
  inferred from the repo's structure, patterns, git history, and constraints.

Your job: produce a structured 3-way diff, let the human resolve it, and write
ONE **merged canonical design doc**. This is a validation gate for `/go-all`.

## Why independence is non-negotiable

The cross-check only has value **because the two inputs never saw each other**.
If the agent had read the human's answers, it would just echo them — no
independent signal, no omissions caught, no hallucinations exposed. Before
reconciling, confirm the two docs were derived independently (the auto-spec must
NOT have been fed the brainstorm). If they were not independent, say so and treat
the result as a single reviewed spec, not a cross-check.

Two things the cross-check buys you:

- **Human omissions caught** — the agent, reading the actual codebase, surfaces
  requirements/edge-cases/integration points the human forgot (the **AGENT-only**
  bucket).
- **Agent hallucinations caught** — where the agent invented or misread
  something, the human's intent contradicts it (the **CONFLICT** bucket), and the
  human overrules.

## Process

### 1. Read both docs

Read the HUMAN doc (`...-design.human.md`) and the AGENT doc
(`...-design.auto.md`) in full. Decompose each into atomic **requirement units**
— one claim/requirement/decision per unit (architecture choices, components,
data flow, error handling, edge cases, acceptance criteria, constraints).

### 2. Bucket every unit into the 3-way diff

Match units across the two docs by what they assert (not by wording). Assign
each to exactly one bucket:

- **AGREED** — both docs assert the same thing (possibly worded differently).
  → **Keep.** No human decision needed; carry it into the merge verbatim (pick
  the clearer wording).

- **AGENT-only** — present in AGENT, absent from HUMAN. The agent inferred it
  from the codebase and the human didn't mention it. → **Human confirms or cuts.**
  This is the omission-catcher: it is often a real requirement the human forgot,
  but it can also be codebase noise. Default to surfacing it as a *recommended
  keep* with the agent's rationale, but the human decides.

- **HUMAN-only** — present in HUMAN, absent from AGENT. Intent/priority the agent
  missed (product judgment the codebase can't reveal). → **Keep** (human intent
  is authoritative). Only drop if the human themselves retracts it.

- **CONFLICT** — both address the same point but **disagree** (different
  approach, contradictory constraint, incompatible acceptance criterion). → **The
  human decides.** This is the hallucination-catcher: where the agent misread the
  codebase or invented a constraint, the human overrules. Present BOTH positions
  with their rationale so the human chooses on the merits.

### 3. Present the diff to the human, one bucket at a time

Present the buckets in this order — AGREED (summary only, for awareness), then
the three that need decisions: **AGENT-only**, **HUMAN-only**, **CONFLICT**. For
each item that needs a decision, show:

```
[BUCKET] <requirement unit>
  HUMAN says: <…or "(not mentioned)">
  AGENT says: <…or "(not mentioned)">
  Recommendation: <keep / cut / which side of the conflict> — <one-line why>
  Your call?
```

Walk the human through them. Prefer batching by bucket; do NOT auto-resolve
AGENT-only or CONFLICT items — those are exactly where the cross-check earns its
keep. HUMAN-only defaults to keep unless the human retracts.

### 4. Write the merged canonical design doc

Assemble the resolved units into ONE coherent design doc at
`docs/plans/<date>-<slug>-design.md` (the canonical path the track binds to).
Cover the standard sections: architecture, components, data flow, error
handling, testing, and explicit acceptance criteria. Requirements:

- Every AGREED + kept AGENT-only + kept HUMAN-only + resolved CONFLICT unit is
  represented; nothing dropped silently.
- No placeholders / "TBD" — every requirement concrete.
- Internally consistent — resolved conflicts don't reintroduce the losing side.
- Record a short **Reconciliation Notes** section: what each bucket contained and
  how the human resolved the AGENT-only / CONFLICT items (an audit trail of the
  cross-check). Commit the merged doc.

Return the canonical merged path to the caller (`/go-all` binds it with
`spec_mode: "all"`).

## Output

- `docs/plans/<date>-<slug>-design.md` — the merged canonical design (committed).
- The path, returned to the caller for binding.

## Key principles

- **Independence first** — verify the two inputs never saw each other; without it
  the cross-check is theater.
- **Human decides the ambiguous buckets** — AGENT-only and CONFLICT are never
  auto-resolved.
- **Nothing dropped silently** — every unit is either merged in or explicitly cut
  by the human, and the cut is noted.
- **Human intent is authoritative** — HUMAN-only stays unless retracted; the
  human wins every CONFLICT.
