---
name: self-audit
description: "Build/release-time engine self-audit — soe reviewing its OWN plugin (the airframe). Runs frontmatter-validity + reference-integrity checks and an AgentShield (ecc-agentshield) scan of soe's own config, then reports findings by severity. GATES release: blocks on critical/high (full gate wired in P4.5)."
allowed_tools: Bash, Read
command: true
---

# /soe:self-audit — engine self-audit (soe reviewing itself)

Runs the **build/release-time engine self-audit** (design §3.4 / §12). This is
soe inspecting **its OWN plugin** — the *airframe* — and is deliberately
**distinct from the runtime adversarial gate** (`/soe:critique`, which red-teams
a user's design/plan). Here the target is soe's own shipped code and config.

Backed by the `soe:security-scan` skill, which wraps
[AgentShield](https://github.com/affaan-m/agentshield) (npm `ecc-agentshield`)
running **locally** against the plugin config. The core local scan is free
(MIT) with **no Pro/hosted dependency**.

## What it runs (against soe itself)

1. **Frontmatter validity** — `npm run test:validity`
   Every `skills/*/SKILL.md` and `agents/*.md` has YAML frontmatter with a
   non-empty `name:` and `description:`.

2. **Reference integrity** — `npm run test:refs`
   No dangling `soe:<name>` tokens (every reference resolves to a real skill,
   agent, or command) and no residual legacy namespace prefixes (the pre-soe
   `superpowers`, `supaconductor`, `orchestrator-supaconductor`, and `sp-ecc`
   prefixes must all have been rewritten to `soe`).

3. **AgentShield config scan** — `npx ecc-agentshield scan` over soe's own
   `.claude-plugin/`, `hooks/`, `agents/`, and `scripts/` plus config sanity.
   Flags hardcoded secrets, overly-permissive allow lists, command injection in
   hooks, and risky MCP servers. Best-effort: if `ecc-agentshield` is not
   installed, this step is skipped with a warning rather than hard-failing the
   run (validity + refs still run and still gate).

## Usage

```bash
# One-shot: validity + refs + AgentShield scan, aggregated
npm run self-audit

# Or run the steps individually
npm run test:validity      # frontmatter
npm run test:refs          # dangling / legacy-namespace refs
npx ecc-agentshield scan   # config security scan (needs the devDependency)

# Machine-readable AgentShield report for CI
npx ecc-agentshield scan --format json
```

## Reporting findings by severity

Aggregate results into four buckets and print them highest-first:

| Severity | Examples | Release impact |
|----------|----------|----------------|
| **Critical** | Hardcoded API keys, `Bash(*)` allow-all, command injection in a hook, a failing validity/refs check | **Blocks release** |
| **High** | Auto-run instructions in config, agents with needless Bash, missing deny list | **Blocks release** |
| **Medium** | Silent error suppression in hooks, `npx -y` auto-install | Recommended |
| **Info** | Missing MCP descriptions, correctly-flagged prohibitive instructions | Awareness |

## This GATES release

A clean self-audit is a **release precondition**. The audit **blocks on any
critical or high finding** — including a red `npm run test:validity` or
`npm run test:refs`. The full release gate that enforces this (and fails CI on
critical/high) is wired up in **P4.5**; this command is the engine those gate
checks invoke.

See the `soe:security-scan` skill for the complete AgentShield reference
(output formats, `--fix`, severity grades, and the optional `--opus` deep
analysis which requires your own `ANTHROPIC_API_KEY`).
