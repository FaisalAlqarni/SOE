---
name: board-of-directors
description: "Simulate a 5-lens expert board (architect, product, security, operations, experience) to evaluate a plan, architecture choice, or feature design. Two modes: a cheap collapsed board (default) and a full multi-agent board for high-stakes decisions. Triggers: 'board review', 'board meeting', 'get expert opinions', 'director evaluation', 'consensus review'."
---

# Board of Directors

A 5-lens expert board evaluates high-consequence proposals. Each lens brings one
domain of judgment:

| Lens | Role | Evaluates |
|------|------|-----------|
| **architect** | Chief Architect (CA) | System design, patterns, scalability, tech debt, code quality |
| **product** | Chief Product Officer (CPO) | User value, market fit, scope, prioritization, usability |
| **security** | Chief Security Officer (CSO) | Vulnerabilities, compliance, data protection, risk |
| **operations** | Chief Operations Officer (COO) | Feasibility, timeline, resources, deployment |
| **experience** | Chief Experience Officer (CXO) | UX/UI, accessibility, user journey, design consistency |

The full per-lens personas live in `directors/chief-*.md`.

## Two modes

The board runs in one of two modes. The verdict math is deterministic and lives
in tested code (`lib/board-verdict.js`) — never in the prompt.

### Collapsed board — DEFAULT (1 call)

One model call emits **all 5 lenses plus an overall decision as a single JSON
object**. This is the default because it is cheap and fast. The output MUST match
this contract, which `parseCollapsed` validates and normalizes:

```json
{
  "architect":   { "verdict": "approve", "score": 8, "concerns": [] },
  "product":     { "verdict": "approve", "score": 7, "concerns": [] },
  "security":    { "verdict": "conditions", "score": 6, "concerns": ["add rate limiting"] },
  "operations":  { "verdict": "approve", "score": 8, "concerns": [] },
  "experience":  { "verdict": "approve", "score": 9, "concerns": [] },
  "decision": "APPROVED"
}
```

- Each lens carries `verdict` ∈ `approve` | `reject` | `conditions`; `score` and
  `concerns` are optional.
- `parseCollapsed` **rejects** a malformed board (missing lens, bad verdict enum,
  not an object, missing `decision`) — a broken or hallucinated board can never
  pass a bogus verdict downstream.

### Full board — high-stakes only (5 calls)

Five **independent** persona assessments (one per director, dispatched in
parallel via the `board-meeting` agent), each casting an `approve`/`reject` vote.
`aggregateFull` tallies the votes:

| Votes (approve-reject) | Resolution |
|------------------------|------------|
| ≥ 4 approve | `APPROVED` |
| exactly 3 approve | `APPROVED_WITH_REVIEW` |
| ≥ 3 reject | `REJECTED` |
| otherwise | `ESCALATE` |

## When to escalate to the full board

The collapsed board is the default. The full board is reserved for high-stakes
decisions — collapsed-vs-full is chosen by `lib/scrutiny.js` (via the phase P3
risk matrix), NOT ad hoc: it scores the change's risk/stakes and only a `full`
tier warrants 5 independent assessments instead of one collapsed call. Low-stakes
reviews stay on the cheap collapsed path.

## Invocation

- **Collapsed (default):** ask the model for one JSON board object matching the
  contract above, then feed it to `parseCollapsed`.
- **Full (high-stakes):** dispatch the `board-meeting` agent, which runs all 5
  personas independently and aggregates with `aggregateFull`.
