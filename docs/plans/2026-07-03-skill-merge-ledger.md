# Skill Merge Ledger — SP 6.1.1 + ECC 2.0.0 + Conductor 3.7.0 + current repo

> Decision record for unifying skills into the new Conductor-based plugin.
> **Global rule:** adopt ECC's *content* but restructure fat skills into **thin `SKILL.md` (gates + index) + `reference.md`/`examples.md`** (progressive disclosure) to minimize token burn. Process skills stay terse (Superpowers form). Knowledge depth is on-demand only.

Legend: KEEP = take one source as-is · MERGE = combine · DROP = discard · ADOPT = net-new from ECC · winner in **bold**.

> **Correction (post 3-way-diff):** this ledger's first pass compared current-repo skills only against the *latest* SP 6.1.1 / ECC 2.0, so it mislabeled several of the user's intentional customizations (vs the true SP 4.1.1 / ECC 1.7.0 baselines) as "bloat" or "adopt canonical." A proper 3-way diff found ~11 MAJOR-EDIT flavours. The authoritative disposition is **§5.1 of `2026-07-03-soe-design.md`** (merit-based: keep good, improve flawed, absorb superseded). Where this ledger and §5.1 disagree, **§5.1 wins** — notably: `subagent-driven-development`, `finishing-a-development-branch`, `verification-loop` are ABSORBED into the Conductor engine (not simply "KEEP SP"); `frontend-patterns` current framework-agnostic rewrite is KEPT (not "KEEP ECC"); `test-driven-development` / `writing-plans` MERGE in the user's additions.

---

## 1. Core discipline / process skills — favor Superpowers brevity + hard gates

| Concern | Strategy | Winner | Note |
|---|---|---|---|
| brainstorming | KEEP | **SP 6.1.1** | Fullest disciplined version. |
| writing-plans | KEEP | **SP 6.1.1** | Adopt 6.0 plan schema (Global Constraints + per-task Interfaces). |
| executing-plans | KEEP | **SP** | Terse gate; avoid conductor's loop-coupling in the skill itself. |
| subagent-driven-development | KEEP | **SP** | Repo 468L is bloat; conductor variant is orchestrator-coupled. |
| test-driven-development | MERGE | **SP + ECC checks** | SP's Iron Law spine + graft ECC's compile-time-RED path, test-runner detection, TDD evidence report. |
| systematic-debugging | KEEP | **SP** | Repo == SP. |
| verification-before-completion | KEEP | **SP** | Hard gate; identical across sources. |
| verification-loop | DROP | — | Redundant with verification-before-completion + per-language `*-verification`. |
| using-git-worktrees | KEEP | **SP** | Native-tool fallback. |
| finishing-a-development-branch | KEEP | **SP** | Bake in user commit/DRY rules. |
| requesting/receiving-code-review | KEEP | **SP** | Bake user coding-style/security/testing checklist into review prompt. |
| writing-skills | KEEP | **SP** | Most complete + current. |
| dispatching-parallel-agents | KEEP | **SP** | (Conductor's parallel *engine* is separate — see §2.) |
| clarify-first | KEEP | **current-repo** | Net-new gate; cross-link to brainstorming. |
| strategic-compact | MERGE | **ECC (136L)** | Concrete phase-boundary compaction heuristics. |
| iterative-retrieval | KEEP | ECC/repo | Keep one; feeds context-loader (§2). |
| search-before-coding | ADOPT | **ECC search-first** | Research/reuse gate; bakes DRY. Strip agent-name coupling. |
| intent-driven-development | ADOPT | **ECC** | Ambiguous asks → observable AC-NNN criteria. |
| orch-* ceremony (add/fix/change/refine/mvp) | DROP | — | Superseded by composing terse SP skills + the loop. |

---

## 2. Orchestration engine — Conductor is the base; graft select ideas

| Concern | Strategy | Note |
|---|---|---|
| conductor-orchestrator (Evaluate-Loop) | KEEP | Richest engine (DAG + message-bus + parallel workers). |
| go (entry point) | KEEP | Single `/go`. |
| loop-planner / loop-plan-evaluator | KEEP | DAG plan + PASS/FAIL gate. |
| loop-executor / loop-execution-evaluator | KEEP | Dispatches to typed evaluators. |
| loop-fixer | KEEP | Bounded loop-back (max 5). |
| eval-ui-ux / code-quality / integration / business-logic | KEEP | Reference language reviewer agents as tools inside these. |
| board-of-directors | MERGE | Graft ECC santa-method dual-independent-reviewer + council disagreement framing. |
| message-bus | KEEP | File-based queue + fcntl locking; foundational. |
| parallel-dispatch | MERGE | Graft ECC parallel-execution-optimizer worktree-isolation + verification lanes. |
| worker-templates / track-manager | KEEP | Complete. |
| context-loader / context-driven-development | MERGE | Graft iterative-retrieval progressive-refinement. |
| **size classifier** | GRAFT (from ECC orch-pipeline) | Right-size ceremony to task tier/blast-radius (token saver). |
| **optional human gates** | GRAFT (from ECC orch-pipeline) | Post-plan + pre-commit gates as non-autonomous mode. |
| cto-advisor / cto-plan-reviewer / plan-critiquer / leads | KEEP | Advisory layer. |
| knowledge (mgr+retro) / business-docs-sync / agent-factory | KEEP | Adequate. |
| using-supaconductor | KEEP→rebrand | Fork's entry contract (rename to using-<plugin>). |
| ECC/current multi-plan/execute/backend/frontend/workflow | DROP | External Codex/Gemini runtime; multi-*model* axis, not multi-*agent*; duplicates loop. Optional add-on only. |
| current /orchestrate | DROP | Fixed chains are a degenerate subset of the DAG loop. |

---

## 3. Python + Django — adopt ECC (current repo is near-verbatim ECC copy)

All six current skills are ECC-minus-metadata. **Adopt ECC canonical**, restore fuller `django-security` File Validation (77L vs 27L), re-apply repo's 2 "When to Activate" bullets. Restructure into thin+reference.

ADOPT net-new: **django-celery** (async/jobs), **fastapi-patterns**, **error-handling** (cross-language, keep separate). Optional/gated: generating-python-installer, pytorch-patterns, mle-workflow.

---

## 4. JS / TS / Frontend — mostly ECC depth; preserve current frontend-design

| Concern | Strategy | Winner |
|---|---|---|
| coding-standards (TS/JS) | MERGE | ECC structure + current's concrete TS snippets |
| React (patterns/perf/testing) | ADOPT | **ECC** (current has none) |
| Vue / Nuxt | ADOPT | **ECC** |
| state mgmt / data fetching / forms | MERGE | ECC deep + current's 3-tier framing |
| accessibility | ADOPT | **ECC frontend-a11y** |
| animation (motion-*) | ADOPT | **ECC** 4-skill suite |
| **frontend-design / aesthetics** | MERGE | **current-repo** (canonical bolder skill ECC omits) + ECC audience/domain framing |
| backend-patterns | MERGE | ECC + current (near-equal); extract API design out |
| api-design | ADOPT | **ECC** dedicated skill |
| Next.js (RSC/Turbopack) | ADOPT | **ECC** |
Also ADOPT (no current equiv): react-native, angular, vite, prisma, nestjs, bun-runtime, design-system.

---

## 5. Go / Rust / JVM — current Go skills are ECC forks; adopt ECC superset

Go patterns/testing, JPA, Spring patterns/TDD: **DROP current, adopt ECC** (current == ECC-minus-header). Java standards, Spring security, Spring verification: **MERGE→ECC superset** (current is a strict subset). Keep Go concurrency folded in golang-patterns.

ADOPT net-new: **rust-patterns**, **rust-testing**, **kotlin-patterns**, **kotlin-testing**, **kotlin-coroutines-flows**. Optional: quarkus-patterns, kotlin-exposed/ktor, hexagonal-architecture.

Keep consistent with existing Go command layer (go-build/go-review/go-test, 80% cover gate).

---

## 6. Ruby/Rails + Dart/Flutter — CURRENT REPO WINS (crown-jewel content)

| Concern | Strategy | Winner |
|---|---|---|
| ruby-patterns / ruby-testing | KEEP | **current** (no ECC equiv) |
| rails-patterns (incl. **Rails Engines**) | KEEP | **current** — unique ~1,404L, must preserve |
| rails-security / rails-tdd / rails-verification | KEEP | **current** (no ECC equiv) |
| dart-patterns | MERGE | **current base** + ECC Dio/Freezed depth |
| dart-testing | KEEP | **current** |
| flutter-patterns (incl. **state-mgmt decision matrices**) | MERGE | **current base** — preserve matrices; layer ECC GoRouter auth-guard + Dio token-refresh + Freezed on top, never overwrite |
| flutter-verification | KEEP | **current** |
| Swift/iOS | ADOPT | **ECC** (swiftui, swift-concurrency, actor-persistence, protocol-di-testing; niche: foundation-models, liquid-glass, ios-icon-gen) |
| React Native | ADOPT | **ECC** |
| Android/Kotlin clean arch | ADOPT | **ECC** |
| flutter-dart-code-review | ADOPT | **ECC** (distinct review skill) |

---

## 7. Data / Logging / Security

| Concern | Strategy | Winner |
|---|---|---|
| postgres-patterns / clickhouse-io | KEEP (adopt ECC) | **ECC** origin (current = ECC-minus-metadata; keep repo hyperlink) |
| mysql-patterns | ADOPT | **ECC** |
| database-migrations | ADOPT | **ECC** (zero-downtime, multi-ORM) — high value gap-fill |
| logging / wide-events | KEEP | **current** (ECC has NO logging skill) + `/logging` cmd + rules/common/logging.md |
| observability | KEEP current | Fold ECC's thin enterprise-agent-ops stub into logging skill |
| security-review (OWASP/authz/secrets) | KEEP (adopt ECC) | **ECC** (10L longer); CSO board persona invokes it |
| security-scan / AgentShield | ADOPT ECC (replace repo) | **ECC** superset: `--opus` red/blue/audit pipeline, `init` scaffolding, HTML report, CI action |

---

## 8. Meta/learning + infra keep-drop

**Meta skills:** continuous-learning-v2 = **KEEP (user crown jewel)**; extract-patterns MERGE (wraps v2); eval-harness adopt ECC (marginal); model-routing **REPLACED** by the `model-orchestration` skill (design §4.1) — do not adopt from ECC/current; skill-create KEEP + consider ECC skill-scout; skill-stocktake adopt ECC + companions `skill-comply` + `rules-distill`.

**Commands — DROP:** brainstorm, write-plan, execute-plan, checkpoint, orchestrate, multi-plan, multi-execute, multi-backend, multi-frontend, multi-workflow (all wrappers/legacy/external-model). **REPLACE:** build-fix, verify, sessions. **KEEP:** go-build, go-review, go-test, python-review, logging, test-coverage, refactor-clean, e2e, evolve, instinct-export/import/status, learn, learn-eval, skill-create, setup-pm, update-codemaps, update-docs.

**Agents — KEEP most** (language reviewers are richer than conductor's generic reviewer): architect, build-error-resolver, go-build-resolver, go-reviewer, python-reviewer, database-reviewer, security-reviewer, refactor-cleaner, logging-reviewer, doc-updater, e2e-runner. **MERGE:** planner→conductor loop-planner; code-reviewer→adopt ECC's deeper one; tdd-guide→fold into TDD skill if no extra value.

**Hooks/lib — KEEP current (richer):** hooks.json (git guards, compaction, logging nudges, PostToolUse format, learning eval) — graft conductor's SessionStart matcher; session-start.sh MERGE (conductor version-check + legacy warn + sp-ecc branding); run-hook.cmd keep; lib/skills-core.js keep (improved). **rules/common/* KEEP + COMPILE** into skills; run `rules-distill` to keep in sync.

---

## Token-optimization rules applied throughout
1. Fat ECC skills → thin `SKILL.md` (gates + index) + `reference.md`/`examples.md` (progressive disclosure).
2. Process skills stay terse (SP form) — they load constantly.
3. Loop subagents load only task-relevant skills (context isolation).
4. Model routing: Haiku/Sonnet default, Opus for hard reasoning.
5. Collapsed board default; full board only high-stakes.
6. Size classifier right-sizes ceremony per task tier.
