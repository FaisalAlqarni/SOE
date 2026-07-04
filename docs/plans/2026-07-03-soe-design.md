# soe — Design (v2)

> A lean, token-efficient Claude Code plugin that fuses the Superpowers discipline pipeline with a **simplified, real** multi-agent orchestration engine (adapted from Conductor), plus the few ECC process/meta skills that genuinely improve the pipeline. Language depth is delegated to separately-installed plugins.

- **Status:** Design approved (revised after adversarial review — all 16 findings folded in)
- **Date:** 2026-07-03
- **Companion:** `2026-07-03-skill-merge-ledger.md` (per-skill decisions; superseded by §5 where they conflict)
- **License:** **AGPL-3.0** (inherited from Conductor); Superpowers + ECC (MIT) and Conductor credited in `LICENSES/`. Ibrahim's reuse permission to be obtained **in writing**.
- **Base:** adapted (not verbatim-forked) from `Ibrahim-3d/conductor-orchestrator-superpowers` v3.7.0.

---

## 1. Purpose

Replace the outdated `sp-ecc` plugin (Superpowers 4.1.1 + ECC 1.7.0 + 3-layer ceremony) with `soe`:

1. **Superpowers 6.1.1 discipline pipeline** as the spine.
2. **A real orchestration engine** — an Evaluate-Loop with parallel execution, quality gates, and a Board of Directors — with the reliability-critical parts implemented as **actual tested code**, not agent-followed pseudocode.
3. **Durable project memory** that survives sessions, machines, and teammates (committed markdown), separate from ephemeral run-state.
4. **Lean by design** — soe is the pipeline + engine + rules + the *few* ECC process/meta skills that improve it. It is **not** a 279-skill monolith. Language/framework depth comes from installing ECC (or other plugins) alongside.
5. **Token efficiency and human-debuggability as hard constraints**, in that priority order under integrity: **integrity > simplicity > maintainability/readability > scalability > performance > tokens.**

## 2. Scope — what is and isn't in soe

| In `soe-core` | Out of soe |
|---|---|
| Superpowers 6.1.1 discipline pipeline | ECC's ~279 language/framework knowledge skills |
| Simplified orchestration engine (loop + board + parallel + `.soe/` state) | Per-language packs (install ECC directly for depth) |
| ECC process/meta improvements: `search-first`, `intent-driven-development`, TDD RED-gate, `strategic-compact`, `skill-stocktake`(+scripts), `security-scan`/AgentShield | ECC non-skill assets: `ecc2/` Rust crate, `ecc_dashboard.py`, `SOUL.md`, install machinery |
| **Multi-model orchestration** (§4.1): `model-orchestration` skill + model-pinned agents (replaces `model-routing`) | — |
| Continuous-learning / instinct system | — |
| Wide-events **logging** (broadly useful → core) | — |
| Adversarial-review gate | — |
| `rules/common/*` (compiled into skills) | — |

**Companion plugin `soe-extras` (separate, optional):** the user's authored language skills — Rails (incl. Rails Engines), Flutter (incl. state-management matrices), dart, ruby. Installed only where needed. Kept out of core for token leanness.

**Merge coverage:** the ~15-25 ECC process/meta candidates are dispositioned via an **automated, complete bucketing pass** (dedupe 887→~279 unique names, classify each `{concern, KEEP/MERGE/DROP/ADOPT}`), with a **completeness gate** (§9) that fails if any candidate is left undispositioned. Long-tail/niche ECC skills are never bundled — they come from installing ECC.

## 3. Architecture

```
soe/  (new repo, AGPL-3.0)
├── .claude-plugin/{plugin.json, marketplace.json}   # name: soe
├── skills/        pipeline discipline + engine + process/meta + logging
├── agents/        engine agents + generic reviewers (specialists via discovery)
├── commands/      /go, loop-*, /soe:critique, /soe:self-audit, kept learning cmds
├── hooks/         minimal, auditable; harness-aware SessionStart
├── lib/           REAL tested scripts: atomic state I/O, resume, capability scan
├── rules/common/  user rules, compiled into skills, synced via rules-distill
├── tests/         test suite (engine, hooks, merge-integrity, security self-audit)
├── docs/          ARCHITECTURE.md, USAGE.md, MIGRATION.md, SECURITY.md, plans/
└── LICENSES/      credit: superpowers (MIT), ECC (MIT), conductor (AGPL)

Per user-project (created by /setup):
├── docs/plans/            human design docs + plans (committed, single source of truth)
└── .soe/                  machine orchestration bookkeeping (hidden)
    ├── config.json        mode + thresholds
    └── tracks/{id}/
        ├── state.json     AUTHORITATIVE execution state (atomic writes, orchestrator-only)
        ├── progress.md    rendered FROM state.json (human-readable, not hand-edited)
        ├── decision-log.md, retrospective.md   (durable → committed)
        └── run/           ephemeral worker/run scratch (gitignored)
```

### 3.1 Two-tier trigger model

- **Durable project memory = always on.** Design docs and plans live in `docs/plans/` (your existing convention); the engine's `.soe/` bookkeeping *references* them. `/setup` writes precise `.gitignore` rules into the user project so **durable memory is committed** (specs, plans, decisions, retrospectives, learned patterns) and **ephemeral run-state is ignored** (`.soe/**/run/`). This gives shareable cross-session/cross-machine/cross-teammate memory without git noise.
- **The Evaluate-Loop = opt-in via `/go`**, auto-*offered* when a plan is parallelizable or high-stakes.

### 3.2 The pipeline (Superpowers spine + engine gates)

```
/brainstorm ─► docs/plans/*-design.md      (judgment gate: human present)
writing-plans ─► docs/plans/*-plan.md + DAG (judgment gate + adversarial review)
        │
        ▼   ── /go  OR  auto-offer ──
   PLAN ─► EVALUATE_PLAN ─► EXECUTE ─► EVALUATE_EXEC ─► COMPLETE
             │(board+adversarial)  (worktree workers)  │(quality gates)
             └ fail ─► revise (max 3)                   └ fail ─► FIX (max 5) ─┐
                                                            ▲──────────────────┘
```

- **Workers run in isolated git worktrees** (own files). The **orchestrator is the sole serial writer** of shared execution state (`state.json`) — no cross-process locking needed. This replaces Conductor's pseudocode message-bus.
- **Reliability-critical primitives are real, tested `lib/` scripts:** atomic state write (temp→fsync→rename), resume, capability scan. Not agent-followed pseudocode.
- **Crash-safe resume (honest):** completed-task state is atomically persisted in `state.json` (single source of truth); on resume, completed tasks are skipped; at most the one task in-flight at crash may re-run — so the planning skill guides tasks to be **idempotent/safe to retry**.

### 3.3 Interaction modes & gate classification

Gates are classified, not uniformly "ask the user":
- **Verification gates** (TDD red/green, `verification-before-completion`, review, evaluators) check *reality* (run tests, inspect diff) — they run **autonomously**.
- **Judgment gates** (brainstorm, spec/plan approval, adversarial review, genuine ambiguity) need human judgment — **front-loaded** into the interactive setup phase before the long run starts.

**Modes** (`config.json`):
- **Autonomous-guardrailed (default):** front-loaded approvals, then the execution loop runs unattended; escalates only on **high-impact/irreversible actions** or **bound exhaustion** (fix max 5 / plan-revision max 3); logs all autonomous decisions to `decision-log.md`.
- **Interactive:** asks at every judgment gate.
- **Fully-agentic:** never asks; resolves + logs everything.

**Escalation-learning loop.** Each escalation is training data: on resolution, a hook captures `{situation, decision, your reasoning, principle}` → a confidence-scored **instinct** (existing continuous-learning engine). Before escalating, the orchestrator consults instincts; a **high-confidence** match resolves the way you would (logged as "would have escalated"), reducing interruptions over time. **Safety invariant: irreversible / high-blast-radius actions (data-loss migration, prod deploy, force-push, secret rotation) ALWAYS confirm — never auto-resolved by learning.**

### 3.4 Two review altitudes

- **Runtime plan/design critique — the adversarial gate.** Skill `adversarial-review` (methodology, single source of truth) red-teams a design or plan against the quality lens (**integrity, simplicity, maintainability, readability, scalability, performance, human-debuggability**) + correct pattern usage. *design mode* finds gaps/inconsistencies; *plan mode* adds a **design↔plan cross-reference** (no drift/scope-creep). Output: numbered findings, then ask *discuss all / some / continue*. Executed by agent `devils-advocate` (fresh isolated context) via command `/soe:critique [design|plan] <file>`, and wired into the loop's `EVALUATE_PLAN`. In autonomous mode, findings feed bounded plan revision + logging.
- **Build/release-time engine self-audit — `/soe:self-audit`.** Reviews *soe itself*: skill/agent validity, dead cross-references, **AgentShield/security-scan against soe's own** `.claude-plugin`/hooks/agents/scripts, config sanity, pattern compliance. Runs in CI; gates release. soe's own design/plan docs are **dogfooded** through the adversarial gate.

## 4. Token efficiency (constraint, subordinate to integrity)

In priority order:
1. **Lean scope** (the big win — soe isn't a 279-skill monolith; small discovery surface).
2. **On-demand skill loading** (platform-native).
3. **Terse process skills** (Superpowers form; loaded constantly).
4. **Multi-model orchestration** (§4.1) — model-aware tiering (Sonnet mechanical, Opus orchestration/deep-reasoning, Fable 5 selective high-stakes judgment [optional], Codex peer [optional]) + a **context firewall** (delegated agents return only path + 3-line summary + confidence).
5. **Collapsed board** default (1 Opus call, all 5 lenses) — full independent-persona board only for high-stakes.
6. **Selective progressive disclosure** — thin+reference *only* where a skill is both large and reference-style (mainly `soe-extras`); never reflexively (avoids the staleness the reviewer flagged).

**Fail-safe scrutiny (integrity > tokens).** Ceremony right-sizing may only *lower* scrutiny on **deterministically-verified-safe** work:
- A **rule-based risk matcher** (real code, not LLM discretion) scans diff/plan for high-risk markers — **auth, authz, payment, crypto, secrets, SQL/migrations, deletions, PII, prod config, force-push, security paths, >N LOC**. Any hit → **full scrutiny forced** (full board + thorough review).
- The LLM classifier can only *raise* the tier above this floor, **never lower it**. Downscoping applies only when **no** risk signal fires.
- **Graph-based blast-radius (when graphify present, §6.1):** `get_pr_impact`/`shortest_path` compute the real dependency reach of a change; a large or security-path-touching blast-radius forces full scrutiny even if the diff itself looks small. Falls back to path/marker rules when graphify is absent.
- **Tested (§9):** a corpus of known-dangerous changes must always route to full scrutiny. Every downscope is logged.

### 4.1 Multi-model orchestration (session-model-led)

Replaces the obsolete `model-routing`. **The session model the user selects IS the orchestrator** (Claude Code's main model naturally orchestrates); subagents are pinned to other tiers via `model:` frontmatter using **latest FULL model ids** (`claude-fable-5` / `claude-opus-4-8` / `claude-sonnet-5`). **AMENDED 2026-07-04** (was: "aliases, never full IDs"): a live shakedown proved the bare `sonnet` alias resolves to the older `claude-sonnet-4-6`, so tiers now pin full ids to guarantee the latest model. On Claude Code ≥ 2.1.172 subagents nest and honor their own `model:` frontmatter, so these pins carry all normal tiering deterministically — no routing code. Model tiers (all verified to resolve on the subscription):
- **`fast-worker` → `claude-sonnet-5`** — mechanical work: boilerplate, tests, formatting, simple edits.
- **`deep-reasoner` → `claude-opus-4-8`** — reasoning-heavy: architecture, complex debugging, algorithm design (fresh context).
- **`strategist` → `claude-fable-5`** — most capable, for the hardest/longest-horizon judgment. Used when the orchestrator itself is *not* Fable and wants Fable's ceiling. Two gates govern it: **availability** (skipped if the user isn't on a Fable plan) and **config** — **AMENDED 2026-07-04** (was: "no deterministic gate"): `.soe/config.json` `fable_enabled:false` routes this tier to the reasoner (Opus) to cap Fable spend, resolved at dispatch by the tested `lib/model-resolve.js` `resolveModel(config, 'strategist')` and passed as the per-invocation `model`.
- **`codex-peer` → Codex** (OpenAI, **optional/experimental**) — a different-perspective peer for high-stakes parallel synthesis, *if* the `codex` CLI + `openai/codex-plugin-cc` are detected (§6). Best-effort; never a hard dependency.

**Topology follows the session model (self-selected via the `model-orchestration` skill — no hook model-detection):** the orchestrator knows its own model and applies the matching profile from the skill.
- **On Fable** → Fable orchestrates; delegates reasoning to `deep-reasoner` (opus), mechanical to `fast-worker` (sonnet). (No `strategist` — the orchestrator already *is* Fable.)
- **On Opus** → Opus orchestrates; mechanical → `fast-worker` (sonnet); reasoning stays with Opus or a fresh-context `deep-reasoner`; `strategist` (fable) only if the user has Fable.
- **On Sonnet** → Sonnet orchestrates; reasoning → `deep-reasoner` (opus), mechanical stays local.

Graceful by construction: pick a model, get the matching topology; absent tiers (Fable/Codex) are simply not used — soe-core never hard-depends on them.

**Context firewall (token saver).** Delegated subagents write full output to an **absolute shared scratch path outside the worktrees** (e.g. `$SOE_SCRATCH/<track>/<task>/`, NOT a relative `.soe/…` inside a worker's worktree — which the orchestrator couldn't read) and return only `path + 3-line summary + confidence`. A tested `lib/firewall-return.js` validates/parses that contract (path exists, confidence is a number in range) before it feeds any downstream decision (e.g. escalation-learning).

**Primitives.** Model-pinned **agents** carry `model:` **full-id** frontmatter; a `model-orchestration` **skill** holds the topology profiles + per-slice guidance (which tier for which kind of work). In the **pipeline**, the existing loop agents (`loop-planner`, `loop-executor`, `loop-fixer`, evaluators) are pinned directly to their tiers — we do **not** duplicate the tiering machinery. **Fan-out agents** (`soe-orchestrator`, `board-meeting`, `loop-execution-evaluator`) additionally list the `Agent` spawn tool so they can dispatch their own subagents (nesting, CC ≥ 2.1.172).

**Two usage levels — ambient and pipeline.**
- **Ambient (no `/go`, no track, no state):** the `model-orchestration` skill guides the orchestrator to delegate in *any* conversation — ad-hoc debugging, reviews, enhancements. Honest scope: this is the orchestrator *choosing* to spawn the right pinned agent (convention guided by the skill), not an enforced routing mechanism. No commands required. Lands in **P1** (agents + skill), before the P2 engine.
- **Pipeline (opt-in `/go`):** the Evaluate-Loop uses the tier-pinned loop agents + board + state tracking.

## 5. Skill unification

Governed by `2026-07-03-skill-merge-ledger.md` (see its correction note; §5 here wins on conflicts). Strategy:

- **Process/discipline → Superpowers 6.1.1, terse.** Adopt ECC `search-first` + `intent-driven-development` gates; graft ECC RED-gate refinements into TDD.
- **Merit-based flavour disposition** (see §5.1): the user's customizations are judged on merit — kept if good, improved if flawed, **absorbed if superseded by the engine**.
- **ECC process/meta pieces adopted** (verified free/MIT, no Pro/hosted deps): `strategic-compact`, `skill-stocktake`(+restored scripts), `security-scan`/AgentShield (declares `ecc-agentshield` npm dep). Fat skills, if adopted, are restructured thin+reference only where warranted. *(`model-routing` is NOT adopted from ECC — it is replaced by the `model-orchestration` skill in §4.1.)*
- **Namespace + precedence:** deterministic rename `orchestrator-supaconductor:`/`supaconductor:`/`sp-ecc:` → `soe:`; a **reference-integrity CI test** fails the build on any dangling reference. The merge yields **one canonical skill per concern**; soe references its own by full namespace; **core discipline skills are authoritative — discovered external skills are additive enhancement, never overriding core.**

### 5.1 Merit-based flavour disposition

3-way diff vs true baselines (SP 4.1.1 / ECC 1.7.0) revealed the user's real customizations. Disposition:

| Current-repo flavour | Disposition | Rationale |
|---|---|---|
| subagent-driven-development (+398) | **ABSORB → engine** | Hand-built orchestration superseded by the loop. Graft only: tier auto-detection heuristics → the **deterministic risk matrix** (§4); TDD-mandating implementer prompt + "Actual Code Changes" spec gate → worker/evaluator templates. |
| finishing-a-development-branch (+173) | **ABSORB + keep hook** | "Refuse to finish if gates unchecked" = engine COMPLETE gate; keep the `extract-patterns` learning hook. |
| frontend-patterns (framework-agnostic rewrite) | **→ soe-extras / drop from core** | Good skill, but language/UI → not core. Lives in extras or via ECC. |
| test-driven-development (+107) | **MERGE** | Step-0 Define-the-API, coverage tiers, common-mistakes → merge into SP 6.1.1 + ECC RED-gate. |
| writing-plans (+63) | **MERGE** | Per-task Depends-on/Risks/Testing feed the loop DAG; reconcile with SP 6.1.1 schema. |
| brainstorming (+42) | **KEEP** | The 4-option + workspace-prompt workflow. |
| verification-loop retry protocol (+22) | **ABSORB → fix-loop** | Same as the engine's bounded FIX. |
| logging-best-practices (authored) | **KEEP in core** | Broadly useful, no upstream equivalent. |
| continuous-learning/instincts (authored) | **KEEP in core** | Crown jewel; powers the escalation-learning loop. |
| Rails/Flutter/dart/ruby (authored) | **→ soe-extras** | Best-in-class, but language depth → optional companion plugin. |
| ECC-minor terseness/rebrand edits | **DROP/auto** | Handled by namespace rename; restore `skill-stocktake/scripts/` from ECC. |

## 6. Cross-plugin capability discovery

soe acts as a **host orchestrator** that uses whatever any installed plugin provides:
- **Capability scan** at run start builds a `role → best-provider` map from installed skills/agents (names + descriptions).
- **Role-based routing** prefers the best-matching installed specialist (e.g. a Go reviewer from ECC, a Flutter reviewer from `soe-extras`, AgentShield), **falling back to soe-core's generic** when none. Packs are purely additive; core never hard-depends on them.
- **Optional tag convention** gives precise routing; non-conforming plugins get best-effort description matching.
- **Posture:** auto-use discovered **enhancement** providers (reviewers/analyzers/generators) + log; anything taking an **irreversible/control** action follows the §3.3 confirm rule.
- **Codex peer (optional, §4.1):** if the official `openai/codex-plugin-cc` + `codex` CLI are detected, soe registers a `codex-peer` provider for high-stakes parallel synthesis (a different-perspective sr. engineer), used per the §4.1 model-orchestration methodology. Absent → silently skipped.

### 6.1 Graphify (first-class optional provider)

If [graphify](https://github.com/safishamsi/graphify) is present (detected via `graphify-out/graph.json` or its registered MCP server), soe uses it as a **code knowledge-graph provider** for both token efficiency and integrity:
- **Retrieval:** the `context-loader`/retrieval layer, workers, and evaluators query the graph (`query_graph`, `get_neighbors`, `shortest_path`) instead of grep-and-read — ~71× fewer tokens/query on large corpora (their reproducible benchmark; ~1× on tiny codebases, so no harm when small).
- **Blast-radius for fail-safe scrutiny (§4):** `get_pr_impact`/`shortest_path` compute *real dependency impact*, upgrading the risk matrix from path-pattern matching to graph-based impact analysis.
- **Integration rules (integrity > tokens):** (1) **consume an existing index, never auto-build** (semantic extraction can cost LLM tokens); may nudge the free AST-only `graphify update`. (2) **Respect staleness** — for code changed this session, trust ground-truth (files/diff), not a possibly-stale graph. (3) **Honor confidence labels** — treat `INFERRED`/`AMBIGUOUS` edges as hints, not facts. (4) **Silent fallback** to native file/grep tools when absent or empty. Thin provider skill: `using-graphify`.

## 7. Packaging (lean core + optional companion)

- **`soe-core`** — everything in §2 "In". One focused plugin, small discovery surface.
- **`soe-extras`** — the user's authored language skills; optional.
- Distributed via one marketplace. No proliferation of per-language packs.

## 8. Multi-harness (tiered)

- **Layer 1 — skills, rules, adversarial-review guidance, shared `.soe/`+`docs/plans/` state:** Claude Code **+ Codex + OpenCode** (markdown/packaging; upstream already multi-harnesses skills). Cross-harness collaboration via **shared committed state**.
- **Layer 2 — full autonomous orchestration engine:** **Claude Code (v1)** only (coupled to Task/subagent + hooks). **Codex/OpenCode engine adapters are deferred / best-effort**, explicitly not promised in v1.

This matches the workflow: the user (Claude Code) runs heavy orchestration; the team (Codex/OpenCode) uses skills + shared state.

## 9. Testing & audits (new — Conductor ships none)

- **Skill/agent validity** — every SKILL.md parses; has name + description.
- **Reference-integrity** — every internal `soe:` reference resolves; no dangling/dropped-skill refs (fixes #15).
- **Merge-completeness gate** — every ECC candidate has a disposition; nothing silently dropped (fixes #3).
- **Engine mechanics** — atomic `state.json` write, resume skips completed tasks, bounded loops (fix max 5 / plan max 3), worktree isolation.
- **Fail-safe scrutiny** — dangerous-change corpus always routes to full scrutiny (fixes #16).
- **Security self-audit** — AgentShield against soe's own scripts/hooks/config; **blocks release on critical/high, advisory on low** (fixes #12).
- **Bundled-executable audit** — every shipped `.sh`/`.js`/`.py` reviewed; deps pinned; `SECURITY.md` lists what runs and why.

## 10. Credit & licensing

`soe` ships **AGPL-3.0**. `LICENSES/` credits Jesse Vincent (Superpowers, MIT), Affaan Mustafa (ECC, MIT), and Ibrahim (Conductor, AGPL). Obtain Ibrahim's reuse permission **in writing**; show final result to upstream authors per the arrangement. External deps (`ecc-agentshield`) declared + pinned, not bundled.

## 11. Migration from `sp-ecc` (clean break)

- **`MIGRATION.md`** — table of old command/skill → new equivalent (or "dropped, superseded by X"). No alias shims.
- **Instinct data** carried over via existing `/instinct-export` → `/instinct-import` (highest-value migration).
- **Design docs** carry over naturally (`docs/plans/` convention preserved). Old `conductor/`/`tasks/` state superseded by `.soe/`.
- **Coexistence** — install soe alongside sp-ecc; migrate at your pace; uninstall old when ready.

## 12. Build sequence (for the plan phase)

1. Scaffold `soe` repo (AGPL, LICENSES, docs skeleton); establish **fresh granular git history** (understand-before-integrate; fixes #13).
2. Deterministic namespace rewrite → `soe:`; stand up reference-integrity test.
3. Refresh Superpowers 4.3 → 6.1.1 (new plan schema + unified reviewer).
4. Simplify the engine: worktree-isolated workers, sole-serial-writer orchestrator, **real tested `lib/` state scripts** (atomic write, resume, capability scan); drop the pseudocode message-bus (fixes #2/#14).
5. Redesign state layer: `docs/plans/` (human) + `.soe/` (machine); `/setup` writes precise project `.gitignore` (fixes #4/#9).
6. Execute the automated complete skill-merge per §5 + ledger; completeness gate; provenance-audit each adopted ECC piece (fixes #3/#11).
7. Absorb merit-based flavours (§5.1); wire the deterministic risk matrix + fail-safe scrutiny (fixes #16).
8. Interaction modes + escalation-learning loop + irreversible-always-confirm (fixes #5).
9. Adversarial-review skill/agent/command + `EVALUATE_PLAN` wiring; self-audit command + CI (fixes #6/#12).
10. Cross-plugin capability scan + role routing (fixes #10).
11. Multi-harness Layer-1 packaging (Codex/OpenCode); `soe-extras` companion (fixes #7).
12. Test suite + security self-audit gate (§9); `MIGRATION.md`, `SECURITY.md`, `ARCHITECTURE.md`, README.

## 13. Open questions (defer to plan)

- `soe` tagline/expansion (working: "Superpowers Orchestration Engine").
- Exact high-risk marker list + `>N LOC` threshold for the risk matrix (sensible defaults; tunable in `config.json`).
- Whether the deferred Codex/OpenCode engine adapters get a v2 milestone now or later.
