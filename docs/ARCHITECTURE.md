# Architecture

This is the **human-debuggability reference** for `soe`. The guiding principle:
every integrity-critical decision — state transitions, resume, loop bounds, risk
gating, escalation, board verdicts, the context firewall — lives in **real,
unit-tested code under `lib/`**, not in a prompt. Skills and agents supply
*judgment*; `lib/` supplies the *guarantees*. When something goes wrong you can
read the code, read the committed `state.json`, and reconstruct exactly what
happened.

`soe` has two layers:

- **Layer-1 — the discipline surface.** Skills + rules + adversarial-review
  guidance + shared committed state. Harness-portable (Claude Code, Codex,
  OpenCode).
- **Layer-2 — the engine.** The Evaluate-Loop and its `lib/` machinery.
  Claude-Code-only in v1.

---

## The engine: the Evaluate-Loop

`/go <goal>` resolves a goal to a **track** and hands off to the
`soe:soe-orchestrator` agent, which drives one explicit state machine to
completion:

```
PLAN → EVALUATE_PLAN → EXECUTE → EVALUATE_EXEC → (FIX ↺ | COMPLETE)
```

The orchestrator detects the current phase from persisted state, dispatches the
one agent (or set of workers) that phase calls for, applies the result, advances
the state, and repeats. Its non-negotiable invariants:

- **`.soe/` state layer.** Per-project bookkeeping. Per-track durable state lives
  in `.soe/tracks/{id}/state.json` (+ `*.md`); `docs/plans/` holds durable plan
  docs. Ephemeral run-state is git-ignored.
- **Sole serial writer.** The orchestrator is the *only* writer of a track's
  `state.json`, behind an exclusive on-disk lock. Workers never write it; they
  return envelopes and the orchestrator applies them one at a time.
- **Worktree workers.** Each implementation task is delegated as a Task-tool
  subagent running in its **own git worktree**. Its return IS the completion
  signal. Isolation means workers can't corrupt each other or the main tree.
- **Context firewall.** A worker writes its full output to a scratch path
  *outside* the worktree and returns only `{ path, summary, confidence }`. The
  full output — and any prompt-injection payload buried in it — never enters the
  orchestrator's context. The envelope is validated before it is trusted.
- **Evaluators.** Dedicated evaluator agents judge the plan (`EVALUATE_PLAN`) and
  the execution result (`EVALUATE_EXEC`) and decide whether to advance, fix, or
  re-plan. Relevant agents: `soe:loop-planner`, `soe:loop-executor`,
  `soe:loop-execution-evaluator`, `soe:loop-fixer`.
- **Board.** For high-consequence proposals, `soe:board-of-directors` runs a
  5-lens expert board (architect, product, security, operations, experience) —
  cheap *collapsed* mode by default, *full* multi-agent board on escalation.
- **Bounded loops.** The loop can never spin forever: fix cycles are capped
  (default 5) and plan revisions are capped (default 3), counter-backed in
  `state.loop_state`.
- **Crash-safe resume.** Resume is computed over the single authoritative state
  store — the first not-`completed` task — with an idempotency guard so a task
  whose commit already landed is skipped rather than double-applied.

---

## The `lib/` modules

Pure, tested, mostly fs-free helpers. This is where the guarantees live.

| Module | Responsibility |
|---|---|
| `state.js` | The single authoritative execution-state store. **F3 — no torn reads**: write-temp → fsync → atomic `rename(2)`. **F6 — single writer**: `withWriterLock()` takes an `O_CREAT\|O_EXCL` exclusive lock. |
| `resume.js` | Crash-safe resume + idempotency. `resumePoint()` returns the first not-`completed` task; `nextAction()` skips an `in_progress` task whose recorded `commitSha` is already in the branch (F14/F18). |
| `loop-guard.js` | Bounded-loop enforcement (F9). Pure counters: `incFix()`/`incPlan()` count-then-compare, halting *at* the cap (fix 5, plan 3). Caller owns persistence. |
| `gitignore-manager.js` | Writes a delimited **managed block** into the user project's `.gitignore` (F4): ignore ephemeral run-state, keep durable memory (`docs/plans/`, per-track `*.md` + `state.json`) committable. Idempotent. |
| `setup.js` | The real scaffolder behind `/setup`. Creates `.soe/config.json`, `.soe/tracks/`, `.soe/setup_state.json`, and applies the managed gitignore block. Idempotent + resumable via `last_step`. |
| `risk-matrix.js` | The deterministic risk **floor** (F16). `classify(diff)` scans for high-risk markers (auth, authz, payment, crypto, secrets, SQL/migrations, destructive deletes, PII, prod config, force-push) and size; any hit pins `full`. `applyClassifierHint` lets an LLM only *raise* the tier, never lower it. |
| `scrutiny.js` | The one sanctioned path for ceremony right-sizing (F7/F16). Routes every scrutiny decision through the risk floor; graphify blast-radius and the LLM hint may only *raise* it. Logs every downscope for audit. |
| `escalation.js` | The safety-critical escalation valve + irreversible classifier (F5/F11). Pure. `isIrreversible(action)` flags data-loss migrations, prod deploys, force-push, secret rotation; `shouldEscalate(ctx)` decides whether a human is needed. |
| `capability-scan.js` | Cross-plugin discovery (§6). Builds a `role → best-provider` map. Tagged (`role:`/`domain:`) providers route precisely; untagged providers route by name/description keyword match; tagged always outranks untagged. |
| `board-verdict.js` | The Board verdict engine. `parseCollapsed` validates the single-call 5-lens JSON against a strict contract (rejects malformed/bogus verdicts); `aggregateFull` tallies 5 independent persona votes for the escalation path. |
| `firewall-return.js` | The context-firewall validator (F12). Validates an untrusted worker's `{ path, summary, confidence }` envelope — path exists, confidence in range — before the orchestrator trusts it. |
| `codex-detect.js` | Detection for the optional `codex-peer` provider. Pure `isCodexAvailable({ hasBinary, hasPlugin })` — available only when BOTH the `codex` CLI is on PATH AND `openai/codex-plugin-cc` is installed; silently skipped otherwise. |
| `skills-core.js` | Shared skill-tree helpers used by the scanners/tests. |

---

## Gates, modes, and learning

- **Gate classification (`soe:gate-classification`, §3.3).** Every gate is either
  a **verification gate** (checks reality — TDD, review, evaluators,
  verification-before-completion; **always autonomous**, never waits on a human)
  or a **judgment gate** (a genuinely-human call — front-loaded or escalated).
  This split is what lets soe run the execution loop unattended *without* losing
  discipline.
- **Modes (`soe:soe-modes`, §3.3).** `.soe/config.json` `mode` selects how much
  the engine asks vs. resolves: `autonomous-guardrailed` (default), `interactive`,
  `fully-agentic`. Mode changes behavior at **judgment gates only** — verification
  gates always run.
- **Escalation learning (`soe:escalation-learning`, F11).** On each
  escalation-resolution, soe records `{situation, decision, reasoning, principle}`
  as a confidence-scored instinct (via `soe:continuous-learning-v2`). Before
  escalating, the orchestrator pre-checks instincts (`escalation.js`
  `resolveViaInstinct`) and auto-resolves high-confidence **reversible** matches,
  logging a "would have escalated" note. **Irreversible actions are never
  auto-resolved.**

---

## Discovery (cross-plugin capability)

`soe` is a **host orchestrator**. Packs (soe-extras, ECC, AgentShield, …) are
purely *additive*. `soe:capability-discovery` runs `capability-scan.js` at run
start to build the role→provider map, so the loop prefers the best installed
specialist and falls back to soe-core generics (`soe:code-reviewer`,
`soe:security-reviewer`, `soe:architect`, …) when none exists. Two optional
first-class providers:

- **graphify (`soe:using-graphify`, §6.1).** A code knowledge-graph used for
  token-efficient retrieval (`query_graph`/`get_neighbors`/`shortest_path`
  instead of grep-and-read) and for feeding blast-radius into
  `risk-matrix.js`. Consume-only, staleness-aware; silently falls back to native
  file/grep tools when absent.
- **codex-peer (`soe:using-codex`, §4.1/§6).** An optional, experimental
  "different-perspective peer": on high-stakes problems, run Opus AND Codex on
  the same problem in parallel and merge without cross-contamination. Detected
  via `codex-detect.js`; enhancement-only, silently skipped when absent, never
  takes an irreversible action without the `soe:soe-modes` confirm rule.

---

## Multi-model orchestration (§4.1)

The **session model the user picked IS the orchestrator** — soe does not detect
or switch it. It self-selects its topology from its own model identity and
delegates to subagents pinned to other tiers via `model:` **alias** frontmatter
(`fable` / `opus` / `sonnet` — never full IDs):

- `soe:strategist` — **Fable**. Hardest, longest-horizon, highest-stakes,
  irreversible calls and final adversarial synthesis. Skipped when Fable is
  unavailable.
- `soe:deep-reasoner` — **Opus**, fresh context. Complex debugging, architecture,
  root-cause analysis below the strategist's bar.
- `soe:fast-worker` — **Sonnet**. Well-specified mechanical work: scaffolding,
  tests to spec, renames, formatting.

The methodology is **ambient** (works in any conversation, no command) as well
as inside the pipeline.

---

## Multi-harness model (§8)

`soe` targets three harnesses via a tiered model:

- **Layer-1 (discipline surface) — portable.** Skills + rules + adversarial
  guidance + shared committed state. Exposed to non-Claude harnesses through
  packaging directories that *reference* — never duplicate — the single shared
  `skills/` and `rules/` trees:
  - `.codex/` — `AGENTS.md` + `config.toml` for the Codex CLI.
  - `.opencode/` — `README.md` + `opencode.json`, which registers the shared
    `../skills` path via `skills.paths`.
- **Layer-2 (engine) — Claude-Code-only in v1.** The Evaluate-Loop and `lib/`
  machinery run under Claude Code.

Cross-harness collaboration happens through **shared committed state** (the same
`.soe/` + `docs/plans/` paths), not a live runtime bridge — every harness reads
and writes the same committed files.
