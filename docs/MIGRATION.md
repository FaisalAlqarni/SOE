# Migrating from `sp-ecc` to `soe`

`soe` is a **clean-break** successor to the old `sp-ecc` plugin. It is *not* a
drop-in rename: the discipline pipeline was rebuilt on Superpowers 6.1.1, the
old bespoke multi-agent commands were replaced by a single tested orchestration
engine (the **Evaluate-Loop**), and the ad-hoc session/checkpoint machinery was
replaced by a durable `.soe/` state layer.

**There are no alias shims.** Old `/sp-ecc:*` command names do not resolve under
`soe`. This is deliberate — a clean break keeps the surface small and honest
rather than carrying a compatibility layer forever. Migrate by learning the new
entry points below; there are far fewer of them.

> **Publish gate.** `soe` MUST NOT be published or tagged until the written
> permission item in [`NOTICE.md`](../NOTICE.md) (`written permission from
> Ibrahim`) is checked. This migration doc, and the README, both point at that
> gate. Do not cut a release before it is satisfied.

---

## The short version

Most of the old sprawling command surface collapses into **two entry points**:

| You used to run… | Now you… |
|---|---|
| `/orchestrate`, `/multi-*`, `/execute-plan`, and friends | run **`/go <goal>`** and let the Evaluate-Loop plan → evaluate → execute → fix → complete |
| a grab-bag of ambient helper commands | just **talk to the session model** — the multi-model methodology is ambient (no command needed) |

Everything else is either a **skill** you invoke by name (`soe:<skill>`) or an
**agent** the engine dispatches for you.

---

## Command / skill mapping

### Core workflow

| Old (`sp-ecc`) | New (`soe`) | Notes |
|---|---|---|
| `/sp-ecc:brainstorm` (skill/command) | `soe:brainstorming` skill | Same disciplined intent/requirements exploration; also the first stage of the discipline pipeline that feeds `/go`. |
| `/write-plan` | `soe:writing-plans` skill | Turns a spec into bite-sized, testable tasks. |
| `/execute-plan` | `soe:subagent-driven-development` skill (+ `soe:executing-plans`) | Executes plan tasks; in the engine this is driven automatically by `/go`. |
| `/verify` | `soe:verification-before-completion` (+ `soe:verification-loop` behavior, now folded into the evaluators) | Evidence-before-assertions. In the engine, verification runs as an autonomous gate every loop. |

### Orchestration (the big consolidation)

| Old (`sp-ecc`) | New (`soe`) | Notes |
|---|---|---|
| `/orchestrate` | **Dropped — superseded by `/go` + the Evaluate-Loop.** | `/go` resolves your goal to a *track*, persists `state.json`, and hands off to `soe:soe-orchestrator`, which runs `PLAN → EVALUATE_PLAN → EXECUTE → EVALUATE_EXEC → (FIX↺ | COMPLETE)`. |
| all `/multi-*` commands | **Dropped — superseded by `/go` + the Evaluate-Loop.** | The old hand-rolled multi-agent fan-out is replaced by the tested engine: worktree workers, a context firewall, a sole-serial-writer state store, and bounded fix/plan loops. |
| `/checkpoint`, `/sessions` | **Dropped — superseded by the `.soe/` state layer.** | Durable per-track state lives in `.soe/tracks/{id}/state.json` (+ `docs/plans/`), scaffolded by `/setup`. Resume is a real mechanism computed over that committed state — no manual checkpointing. |

### Kept capabilities

These carried over. Note that the surface was **narrowed to skills + agents**
plus a small set of commands; several old *commands* are now reached as **skills
you invoke by name** or **agents the engine dispatches**, rather than as
top-level slash commands.

| Old (`sp-ecc`) | New (`soe`) | Form |
|---|---|---|
| `go-build` / `go-review` / `go-test` | `soe:build-error-resolver`, `soe:code-reviewer`, `soe:tdd-guide` agents; Go specialists route in via `soe:capability-discovery` when a Go pack is installed | agents / role-routing |
| `python-review` | `soe:code-reviewer` agent by default; the specialist Python reviewer routes in via `soe:capability-discovery` when a Python pack (e.g. ECC/soe-extras) is installed | agent / role-routing |
| `logging` | `/soe:logging` command + `soe:logging-best-practices` skill + `soe:logging-reviewer` agent | command + skill + agent |
| `e2e` | `soe:e2e-runner` agent | agent |
| `refactor-clean` | `soe:refactor-cleaner` agent | agent |
| `test-coverage` | `soe:test-driven-development` skill + `soe:tdd-guide` agent (coverage enforced as a verification gate) | skill + agent |
| `update-*` (doc/plan updaters) | `soe:doc-updater` agent | agent |
| `instinct-*` (status/export/import) | `/soe:instinct-status`, `/soe:instinct-export`, `/soe:instinct-import` | commands (kept) |
| `learn` | `/soe:learn` and `/soe:learn-eval` | commands (kept) |
| `evolve` | `/soe:evolve` | command (kept) |
| `skill-create` | `/soe:skill-create` | command (kept) |

### New in `soe` (no `sp-ecc` predecessor)

| New | What it does |
|---|---|
| `/setup` (`soe:soe-setup`) | Scaffolds the `.soe/` state layer + managed `.gitignore` block. |
| `/go` (`soe:soe-orchestrator`) | The single Evaluate-Loop entry point. |
| `/soe:critique` (`soe:adversarial-review`, `soe:devils-advocate`) | On-demand red-team of a design or plan doc. |
| `/soe:self-audit` (`soe:security-scan`) | Build/release-time audit of soe's *own* plugin config (AgentShield). |
| `soe:capability-discovery` | Cross-plugin role→provider routing so installed specialists are preferred, with soe-core generics as fallback. |
| `soe:board-of-directors` | 5-lens expert board (collapsed by default, full board on high-stakes escalation). |

---

## Instinct data carry-over

Learned instincts migrate cleanly. **Do not** copy the old data directory by
hand — export from `sp-ecc` and import into `soe` so the formats are reconciled:

1. In your old setup, export the learned instincts:

   ```
   /instinct-export
   ```

   (this writes a portable instincts bundle).

2. In `soe`, import that bundle:

   ```
   /soe:instinct-import
   ```

   Point it at the file produced by step 1. Confidence scores and provenance
   carry over; you can verify the result with `/soe:instinct-status`.

The escalation-learning loop (`soe:escalation-learning`) will continue growing
those instincts from how you resolve future escalations.

---

## Coexistence (recommended path)

Because there are no alias shims, the safest migration is **side-by-side**:

1. **Install `soe` alongside `sp-ecc`.** They do not share command names, so
   they will not collide. `sp-ecc`'s `/sp-ecc:*` commands keep working; `soe`
   adds `/setup`, `/go`, `/soe:*`, and the `soe:*` skills.
2. **Run `/setup`** in a project to scaffold `.soe/`.
3. **Migrate at your own pace.** Start using `/go` for new work; keep reaching
   for `sp-ecc` commands for anything you have not moved yet.
4. **Carry over instincts** once (see above).
5. **Uninstall `sp-ecc`** when you no longer reach for any of its commands.

Nothing forces a big-bang cutover. Migrate one workflow at a time.
