# Security

## Trust model

`soe` runs **hooks, agents, and scripts with the invoking user's own
permissions**. It holds no elevated privileges of its own — treat it with the
same trust as any code you choose to execute locally. In particular:

- **Hooks** (`hooks/`) run Node/shell on Claude Code lifecycle events and can
  read/modify files and block tool calls within your session.
- **Scripts** (`scripts/`, `lib/`) run under `node`/`bash` when invoked by
  commands or tests.
- **Agents** (`agents/`) are prompt definitions that operate within the tool
  permissions you grant them.

None of these phone home or require network access for normal operation.

## Self-audit (AgentShield on itself)

soe audits **its own plugin configuration** at build/release time — the engine
reviewing itself (the "airframe"), distinct from the runtime adversarial gate.

Run it with:

```bash
npm run self-audit         # frontmatter validity + reference integrity + config scan
# or the command inside Claude Code:
/soe:self-audit
```

This chains three checks against soe's own tree:

1. `npm run test:validity` — every skill/agent has valid `name`/`description`
   frontmatter.
2. `npm run test:refs` — no dangling `soe:<name>` references and no residual
   legacy namespace prefixes.
3. **AgentShield** (`ecc-agentshield`) — a local security scan of
   `.claude-plugin/`, `hooks/`, `agents/`, and `scripts/` for hardcoded
   secrets, over-permissive allow lists, command injection in hooks, and risky
   MCP servers.

A clean self-audit **gates release**: the audit blocks on any **critical or
high** finding (including a failing validity or refs check). The full CI gate
that enforces this is wired up in P4.5.

AgentShield runs **entirely locally** and the core scan is **free (MIT) with no
Pro/hosted dependency**. The only optional cloud path is the `--opus` deep
analysis, which uses your own `ANTHROPIC_API_KEY` and is never required.

## Pinned dependencies

Security-relevant tooling is pinned in `package.json` for reproducibility:

| Dependency | Version | Purpose |
|------------|---------|---------|
| `ecc-agentshield` | `1.4.0` (devDependency) | Local config security scanner used by the self-audit |

soe ships no runtime `dependencies`; everything above is a `devDependency` used
only for auditing and testing.

## Reporting a vulnerability

If you find a security issue in `soe`:

1. **Do not** open a public issue for anything exploitable.
2. Open a GitHub **security advisory** on the soe repository (Security →
   "Report a vulnerability"), which keeps the report private until a fix ships.
3. Include: affected file(s)/hook/script, the impact, and reproduction steps.

We aim to acknowledge reports promptly and coordinate a fix and disclosure
timeline with the reporter.
