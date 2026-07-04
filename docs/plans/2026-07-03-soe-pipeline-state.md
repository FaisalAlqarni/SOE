# Pipeline State: soe
Created: 2026-07-03
Phase: executing — P0-P4✅ (45 tasks, 240 tests); NEXT: P5.1 (final phase)

## Config
Workspace: /development/soe (fresh repo, working on default branch per user — new repo, no main to protect)
Design: docs/plans/2026-07-03-soe-design.md (v2 + §4.1 multi-model)
Plan: docs/plans/2026-07-03-soe-implementation.md (v4)
Merge ledger: docs/plans/2026-07-03-skill-merge-ledger.md

## Phase P0: Scaffold & guardrails
### P0.1: Node project + test harness [COMPLETE] [tier: light]
- [x] Implementer: done (commit 0b8815a; node v20.20.0; node --test passes 0 tests)
- [x] Spec review: PASS (diff exactly matches spec)
### P0.2: Plugin manifests [COMPLETE] [tier: light]
- [x] Implementer: done (commit bb60ee3; TDD RED→GREEN; manifest.test.js passes)
- [x] Spec review: PASS
### P0.3: Licensing & credit [COMPLETE] [tier: light]
- [x] Implementer: done (commit 7e8614c; AGPL 661L + MIT credits + checklist line verbatim)
- [x] Spec review: PASS
### P0.4: Skill/agent validity test [COMPLETE] [tier: standard]
- [x] Implementer: done (commit b723d20; TDD-via-fixtures RED→GREEN; handles no-skills + edge cases)
- [x] Spec review: PASS
- [x] Quality review: PASS
### P0.5: Reference-integrity test (dangling + old-namespace) [COMPLETE] [tier: standard]
- [x] Implementer: done (commit b961486; dangling + residual checks; RED dirty/ GREEN clean/)
- [x] Spec review: PASS
- [x] Quality review: PASS
### P0.6: Namespace-rename tool [COMPLETE] [tier: standard]
- [x] Implementer: done (commit 066929a; TDD RED→6 green; longest-prefix-first; idempotent)
- [x] Spec review: PASS
- [x] Quality review: PASS
### P0.7: CI + doc stubs [COMPLETE] [tier: light]
- [x] Implementer: done (commit a085c0c; test:all green end-to-end; docs/plans committed separately 0c393bf)
- [x] Spec review: PASS

## Phase P1: Discipline pipeline [IN PROGRESS]
Gate policy (execution-time): per-task hard gate = **validity green**; reference-integrity resolves intra-scope refs, forward-refs to later-phase agents/commands accepted until targets land, fully-green refs enforced at phase boundary.
### P1.1 import SP 6.1.1 discipline skills [COMPLETE] [tier: standard]
- [x] Implementer (commit 4926737; 13 skills/44 files; rename 6; validity+refs green) · [x] Spec PASS · [x] Quality PASS
- FOLLOW-UP (P5 rebrand): normalize residual bare-word `superpowers` paths/brand in supporting assets (.superpowers/, docs/superpowers/, server.cjs brand, obra/superpowers URLs)
### P1.2 brainstorming flavour merge [COMPLETE] [tier: standard]
- [x] Implementer (commit 585991a; 4-option+workspace grafted onto SP6.1.1; helpers copied; validity green) · [x] Spec PASS · [x] Quality PASS · fwd-ref soe:write-plan→P1.12
### P1.3 TDD flavour merge [COMPLETE] [tier: standard]
- [x] Implementer (commit 412f77d; SP iron-law + ECC RED-gate + user Step-0/coverage/mistakes; SKILL 138L + reference.md) · [x] Spec PASS · [x] Quality PASS
### P1.4 writing-plans flavour merge [COMPLETE] [tier: standard]
- [x] Implementer (commit 107e772; copy-then-edit +52/-0; idempotency rule added) · [x] Spec PASS · [x] Quality PASS
### P1.5 ECC gates + P1.7 rules + P1.8 logging + P1.9 instincts + P1.12 meta [COMPLETE via direct copy] (commit fb737ea)
- [x] Copied cp+rename; validity PASS; refs FULLY CLEAN (fixed 2 dropped-cmd refs: brainstorming write-plan→writing-plans, evolve new-table example)
- NOTE: skill-create is a COMMAND not a skill (plan mislabel); no skills/skill-create dir needed.
- DEFERRED polish (→P5): optional rule↔skill cross-links, search-first coupling note.
- Confirmed SP-6.1.1 sourcing correct: none of these 8 skills exist in SP 6.1.1, so ECC/user is the right source.
### P1.6 multi-model orchestration [COMPLETE] [tier: standard]
- [x] Implementer (commit 9500b5b; TDD RED3→GREEN3; aliases fable/opus/sonnet; self-select profiles; firewall) · [x] Spec PASS · [x] Quality PASS
### P1.10 using-soe + SessionStart [COMPLETE] [tier: standard]
- [x] Implementer (commit d5a872f; copy-then-edit; no model-detection; valid soe JSON; 13/13) · [x] Spec PASS · [x] Quality PASS
### P1.11 hooks.json + git-guard test [COMPLETE] [tier: standard]
- [x] Implementer (commit 7e5a48f; hooks.json 6 events/18 scripts; git-guard real block/allow test; 27/27) · [x] Spec PASS · [x] Quality PASS

## Phase P1 [COMPLETE] — boundary gate green (validity PASS, refs CLEAN, suite PASS; 22 skills/4 agents/8 cmds/18 commits)

## Phase P2: Real engine [IN PROGRESS]
### P2.1 lib/state.js (atomic + single-writer lock) [COMPLETE] [tier: thorough]
- [x] Implementer (commit ec91a0a; 10 tests; crash-split F3, single-writer F6, stale-reclaim, TTL-injectable; suite 37) · [x] Spec PASS · [x] Quality PASS · Security N/A
### P2.2 lib/resume.js (+ idempotency guard) [COMPLETE] [tier: thorough]
- [x] Implementer (commit 0cc0b0d; 16 tests; F14/F18; injectable git; suite 53) · [x] Spec PASS · [x] Quality PASS · Security N/A
- ⚠️ FLAGGED: state.tasks shape mismatch (resume=ordered array vs state.js markTaskComplete=keyed object) → fix in P2.2b
### P2.2b Reconcile state.tasks shape → ordered array [COMPLETE] [tier: thorough]
- [x] Implementer (commit 97c0db8; ordered-array unified; integration test (f); suite 55) · [x] Spec PASS · [x] Quality PASS
### P2.3 lib/gitignore-manager.js [COMPLETE] (commit d69c9e6; 6 tests; idempotent managed block; suite 61) Spec+Quality PASS
### P2.4 lib/loop-guard.js [COMPLETE] (commit e088468; 12 tests; halt-at-cap; suite 73) Spec+Quality PASS
### P2.5 /setup + .soe layout [COMPLETE] (commit 3945c8c; 9 tests; runSetup reuses applyGitignore; idempotent; suite 82) Spec+Quality PASS
### P2.6 loop agents (tier-pinned) [COMPLETE] (69e12dd; opus/opus/sonnet/sonnet; loop-fixer→loop-guard) Spec+Quality PASS
### P2.7 workers + firewall-return [COMPLETE] (01ac495; firewall-return 12 tests; abs scratch outside worktrees; suite 94) Spec+Quality PASS
### P2.8 board of directors [COMPLETE] (6553562; board-verdict 16 tests collapsed+full; 5 personas; suite 110) Spec+Quality PASS
### P2.9 evaluators + reviewer agents [COMPLETE] (5afb46e; 9 reviewers imported+pinned; 3 eval skills; 18 agents valid aliases) Spec+Quality PASS
### P2.10 orchestrator [COMPLETE] (c41c97d; simplified no-msgbus; wired all libs; state machine; sole-serial-writer) Spec+Quality PASS SecurityN/A
### P2.11 /go command [COMPLETE] (3e45e78; track match/create; dispatch orchestrator; bare-go resume) Spec+Quality PASS
### P2.12 engine mechanics tests [COMPLETE] (e64de49; 7 integration subtests; REAL worktree isolation F6; suite 117) Spec+Quality PASS

## Phase P2 [COMPLETE] — real engine built+tested; boundary gate green; 117 tests; 6 libs
NOTE(polish→P4/P5): go.md node -e snippets should use ${CLAUDE_PLUGIN_ROOT}/lib not ./lib

## Phase P3: Gates, modes & learning [IN PROGRESS]
### P3.1 interaction modes [COMPLETE] (e762334; soe-modes 3 modes; suite 117) Spec+Quality PASS
### P3.2 gate classification [COMPLETE] (ba340b6; verification vs judgment; 7 skills tagged) Spec+Quality PASS
### P3.3 lib/escalation.js [COMPLETE] (0d3a896; 25 tests; irreversible-never-auto-resolve invariant proven; suite 142) Spec+Quality+Security PASS
### P3.4 escalation-learning [COMPLETE] (7330197; driver test F11 in-flow; suite 146) Spec+Quality+Security PASS
### P3.5 lib/risk-matrix.js [COMPLETE] (af7f58e; 38 tests; 11 markers→full; raise-only hint; blastRadius fail-safe; suite 184) Spec+Quality+Security PASS
### P3.6 lib/scrutiny.js + dangerous corpus [COMPLETE] (bb57b72; routed scrutiny; 4 dangerous fixtures→full+full-board F16; suite 209) Spec+Quality+Security PASS
### P3.7 adversarial-review gate + finishing absorption [COMPLETE] (2157688; 2-mode gate; devils-advocate opus; /critique; COMPLETE-gate absorption) Spec+Quality PASS

## Phase P3 [COMPLETE] — gates/modes/learning; boundary green; 209 tests

## Phase P4: Discovery & security [IN PROGRESS]
### P4.1 lib/capability-scan.js [COMPLETE] (7e6fc83; 15 tests; tag+keyword routing; suite 224) Spec+Quality PASS
### P4.2 role-routing + fallback [COMPLETE] (caa3f8a; 4 tests; core-never-hard-depends F13; suite 228) Spec+Quality PASS
### P4.3 using-graphify [COMPLETE] (a8b08f1; 4 rules; blast-radius test F12; suite 232) Spec+Quality PASS
### P4.3b codex-peer [COMPLETE] (186d0e5; codex-detect 8 tests; experimental; suite 240) Spec+Quality PASS
### P4.4 /soe:self-audit + AgentShield-on-self [COMPLETE] (b62fabc; security-scan no-paywall; targets own code; ecc-agentshield pinned; SECURITY.md) Spec+Quality+Security PASS
### P4.5 bundled-exec audit + release gate [COMPLETE] (016f40a; 42 scripts enumerated; 2 advisory orphans; CI gate) Spec+Quality PASS

## Phase P4 [COMPLETE] — discovery + security; boundary green; 240 tests
ORPHANS(advisory): continuous-learning-v2/agents/start-observer.sh + scripts/test_parse_instinct.py — wire or remove in P5

## Phase P5: ECC merge, companion, multi-harness, migration [IN PROGRESS]
### P5.1 ecc canonical inventory [COMPLETE] (7c2b26b; 277 unique F1; ledger 277 TODO; suite 244) Spec+Quality PASS
### P5.2 disposition + completeness gate [COMPLETE] (729b885; 277 dispositioned 269DROP/6KEEP/2ADOPT; gate 5 tests; suite 249) Spec+Quality PASS
### P5.3 merge adopted ECC process/meta [COMPLETE via direct copy] (recursive-decision-ledger + regex-vs-llm-structured-text adopted; skill-stocktake scripts restored; no paywall; validity+refs green) Spec+Quality PASS
### P5.4 soe-extras companion [COMPLETE] (/development/soe-extras 5fe1799; 10 skills tagged; bodies untouched) Spec+Quality PASS
### P5.5 multi-harness Layer-1 [COMPLETE] (8bedd1b; .codex+.opencode manifest+index; no-dup; harness-layer1.sh 23 checks) Spec+Quality PASS
### P5.6 migration + final docs + publish gate [COMPLETE] (265be15; MIGRATION+USAGE+README+ARCHITECTURE; publish gate confirmed) Spec+Quality PASS

## Phase P5 [COMPLETE] — ALL IMPLEMENTATION TASKS DONE (P0-P5)
Remaining P5: P5.2 disposition+completeness · P5.3 merge adopted · P5.4 soe-extras · P5.5 multi-harness L1 · P5.6 migration+docs+publish gate
Remaining P4: P4.2 role-routing+fallback · P4.3 graphify · P4.3b codex-peer · P4.4 self-audit · P4.5 bundled-exec audit+gate
Remaining P3: P3.5 risk-matrix · P3.6 scrutiny+corpus · P3.7 adversarial-review+finishing absorption
Remaining P2: P2.6 loop agents (tier-pinned) · P2.7 workers+firewall-return · P2.8 board · P2.9 evaluators · P2.10 orchestrator · P2.11 /go · P2.12 engine mechanics tests

## Phase P3: Gates, modes & learning [PENDING]
P3.1 modes · P3.2 gate classification · P3.3 escalation.js · P3.4 escalation-learning · P3.5 risk-matrix.js · P3.6 scrutiny.js+corpus · P3.7 adversarial-review+finishing absorption

## Phase P4: Discovery & security [PENDING]
P4.1 capability-scan · P4.2 role-routing+fallback · P4.3 graphify · P4.3b codex-peer · P4.4 self-audit · P4.5 bundled-exec audit+gate

## Phase P5: ECC merge, companion, multi-harness, migration [PENDING]
P5.1 ecc inventory · P5.2 disposition+completeness · P5.3 merge adopted · P5.4 soe-extras · P5.5 multi-harness L1 · P5.6 migration+docs+publish gate

## After All Tasks [highest tier: THOROUGH]
- [x] E2E runner — N/A (plugin; no UI/user-flow surface)
- [x] Doc-updater — done via P5.6 (README/ARCHITECTURE/USAGE/MIGRATION)
- [x] Verification-loop — GREEN (node 249, validity, refs, harness-L1, bundled-exec audit)
- [x] Refactor-cleaner — final review did safe cleanup (go.md runtime path fix eba3087)
- [x] Final code review — holistic review PASS; all design §3-§6 commitments have artifacts; no integration gaps
- [x] finishing: BUILD COMPLETE. ⚠️ PUBLISH GATE OPEN — do NOT tag/publish until Ibrahim's written AGPL permission attached (NOTICE.md)

## STATUS: ✅ BUILD COMPLETE — all P0-P5 + after-all-tasks done. 249 tests green. On default branch of fresh /development/soe repo.

## Notes
- Multi-model: no Advisor (user on subscription); `fable`/`opus`/`sonnet` aliases; session-model-led self-select.
- Do NOT publish/tag release until Ibrahim's written AGPL permission attached (NOTICE.md checkbox).

## Phase P6: Pipeline-entry refinement (post-review, user-directed)
Rationale: supaconductor's /go auto-generates spec (hallucination risk); we want human-in-loop + a dual-derivation cross-check. THREE entry commands sharing one loop; spec-derivation owned by commands (interactive), orchestrator starts at PLAN with bound design doc. Engine (parallel workers/board/quality gates) UNTOUCHED.
### P6.1 three entry commands + spec-derivation/reconciliation + loop-planner↔writing-plans [COMPLETE] (2152a1a)
  - /go = BRAINSTORM(human)→bind→PLAN ; /go-auto = auto-spec→bind→PLAN ; /go-all = brainstorm ∥ independent background auto-spec → 3-way reconciliation(human) → bind merged → PLAN
  - state.json += design_doc (bound path) + spec_mode ; track-bound guard + ask-on-ambiguity ; brainstorming "Ready"→bind→/go
### P6.2 e2e-runner chrome-devtools discovery + evaluator change-based dispatch [COMPLETE] (f88acfc)
### P6.3 soe plumbing e2e test [COMPLETE] (e87b834; 8 tests; suite 257)
## Phase P6 [COMPLETE] — /go + /go-auto + /go-all; engine untouched; 257 tests
