---
name: escalation-learning
description: "Use when soe repeatedly escalates the same routine judgment call and you want the engine to learn the user's judgment and stop interrupting over time — WITHOUT ever auto-resolving irreversible actions. Defines the capture → instinct → pre-check → log loop: on each escalation-resolution, record {situation, decision, reasoning, principle} as a confidence-scored instinct (via soe:continuous-learning-v2); before escalating, the orchestrator pre-checks instincts via lib/escalation.js resolveViaInstinct and auto-resolves high-confidence REVERSIBLE matches, logging a 'would have escalated' note instead of interrupting. Reference from the orchestrator at the escalation point."
---

# escalation-learning — learn the user's judgment, escalate less over time (design §3.3, resolution F11)

soe runs unattended in `autonomous-guardrailed` mode, but it escalates to the human
on judgment calls it cannot safely resolve. Many of those escalations are
**routine**: the same class of situation, resolved the same way, every time. The
escalation-learning loop observes how the human resolves each escalation and, over
time, learns to resolve the routine ones itself — so the human is interrupted less
and less.

There is exactly one thing this loop must NEVER do:

> **Irreversible / high-blast-radius actions ALWAYS confirm.** No amount of learning,
> no matter how confident, ever auto-resolves an irreversible action (data-loss
> migration, prod deploy, force-push, secret rotation). This is not a convention —
> it is enforced deterministically in `lib/escalation.js` (`resolveViaInstinct`
> checks `isIrreversible` FIRST and returns `null` unconditionally for it, even for
> a perfectly matching 1.0-confidence instinct at threshold 0). See the driver test
> `tests/escalation-flow.test.js`.

**Announce at start:** "I'm using the escalation-learning skill to pre-check learned
instincts before escalating."

---

## The loop

```
   escalation ──resolved by human──▶ CAPTURE {situation, decision, reasoning, principle}
       ▲                                        │
       │                                        ▼
       │                            INSTINCT (confidence-scored)
       │                          via soe:continuous-learning-v2
       │                                        │
   (fall back to human)                         ▼
       │                            PRE-CHECK before escalating
       └──────── no match ───── resolveViaInstinct(ctx, instincts)
                                         │ high-confidence REVERSIBLE match
                                         ▼
                            AUTO-RESOLVE + LOG "would have escalated"
                            to .soe/tracks/{id}/decision-log.md
```

### 1. Capture — on escalation-resolution

Whenever an escalation is resolved (by the human, or — in `fully-agentic` mode — by
the engine), capture the outcome as a structured record:

- **situation** — what the engine was about to do (the action / context that
  triggered the escalation).
- **decision** — what was decided (proceed, block, alternative).
- **reasoning** — why.
- **principle** — the generalizable rule to apply next time (this becomes the
  instinct's `trigger`/`action`).

Hand this record to the instinct system, **`soe:continuous-learning-v2`**, which
writes it as an **atomic, confidence-scored instinct** (start conservative; the
instinct's confidence rises as it is confirmed and falls when corrected). The
instinct's `match`/`pattern`/`situation` field is what `lib/escalation.js` later
matches an incoming action against.

### 2. Pre-check — before escalating

Before the orchestrator escalates a judgment call, it FIRST asks the learned
instincts whether this exact class of situation has already been resolved:

```js
import { resolveViaInstinct, shouldEscalate } from '../../lib/escalation.js';

const resolution = resolveViaInstinct({ action }, instincts);
if (resolution) {
  // High-confidence REVERSIBLE match — auto-resolve as the human would have.
  applyResolution(resolution);           // proceed the way we learned
  logWouldHaveEscalated(action, resolution); // see step 3
} else if (shouldEscalate({ action, mode, boundExhausted, judgmentGate })) {
  escalateToHuman(action);               // fall back to interrupting the human
}
```

`resolveViaInstinct` returns a resolution ONLY when the action is **not**
irreversible **and** a matching instinct meets `CONFIDENCE_THRESHOLD` (default
`0.85`, per-call overridable). Otherwise it returns `null` and the situation
escalates exactly as before. **The irreversibility gate is checked first**, so an
irreversible action can never be auto-resolved here — it always falls through to
`shouldEscalate`, which returns `true` for it, and the human confirms.

### 3. Log instead of interrupt

When an instinct auto-resolves what would otherwise have been an escalation, do NOT
silently swallow it — append a **"would have escalated"** entry to
`.soe/tracks/{id}/decision-log.md` recording the situation, the matched instinct
(id + confidence), and the auto-resolution. This keeps the reduced-interruption
behavior fully auditable and makes it obvious, in hindsight, exactly which
escalations the learning loop absorbed and why.

### 4. Corrections update the instinct (self-improvement loop)

If the human later disagrees with an auto-resolution, that correction feeds straight
back into `soe:continuous-learning-v2` per the CLAUDE.md self-improvement loop: the
instinct's confidence is lowered (or the instinct is refined/retired) so the same
mistake is not repeated. Confidence goes **up** on confirmation and **down** on
correction — the loop ruthlessly iterates until the routine-escalation rate drops
without ever loosening the irreversible invariant.

---

## Invariants (do not violate)

- **Irreversible ALWAYS confirms.** Enforced in `lib/escalation.js`, not in this
  prose. Never add a code path that skips `resolveViaInstinct` / `shouldEscalate`
  for an irreversible action.
- **Only high-confidence, reversible matches auto-resolve.** Below threshold, no
  match, or any irreversibility → escalate.
- **Every auto-resolution is logged** to the track's `decision-log.md` as "would
  have escalated". No silent auto-resolutions.
- **Corrections always flow back** into the instinct's confidence. Learning is a
  loop, not a one-shot.

## Red flags (stop and correct)

- Auto-resolving (or even *considering* auto-resolving) an irreversible action.
- Calling `resolveViaInstinct` without also honoring its `null` return by falling
  back to `shouldEscalate` / escalation.
- Auto-resolving without appending the "would have escalated" decision-log entry.
- Capturing an escalation outcome anywhere but `soe:continuous-learning-v2` (the
  single instinct store).
- Raising an instinct's confidence after a human correction instead of lowering it.
