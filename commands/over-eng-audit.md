---
name: over-eng-audit
description: "On-demand repo-wide over-engineering audit. Dispatches the soe:over-engineering-auditor agent across the entire codebase and reports a ranked list of what to delete, simplify, or replace with stdlib/native equivalents. No /go or pipeline needed."
allowed_tools: Read, Task
command: true
---

# /soe:over-eng-audit — repo-wide over-engineering audit

Runs the **over-engineering lens repo-wide** (design §3.4) on demand. It
dispatches the `soe:over-engineering-auditor` agent (Opus, fresh isolated
context) to scan the **entire codebase** instead of a single diff, and returns a
**ranked list** of reducible code — biggest cut first — ending with a
`net: -<N> lines, -<M> deps possible.` estimate and a severity.

This is **ambient / on-demand**: no `/go`, no orchestrator, no pipeline. It is
the whole-repo counterpart to `/soe:simplify` (which reviews a diff or path).

## Usage

```
/soe:over-eng-audit
```

Takes no arguments — the scope is the whole repository tree.

## What it does

1. **Dispatch `soe:over-engineering-auditor`** via the Task tool, instructing it
   to scan the repository for reducible / over-engineered code — one line per
   finding, tagged `delete`/`stdlib`/`native`/`yagni`/`shrink`, ranked biggest
   cut first.
2. Relay the agent's ranked findings and its closing
   `net: -<N> lines, -<M> deps possible.` estimate (with severity) back to you.
   If there is nothing to cut, it reports `Lean already. Ship.`

**Advisory only.** The auditor lists findings; it applies nothing. You decide
whether to act on each suggestion.

For a diff- or path-scoped review instead of a repo-wide sweep, use
`/soe:simplify`. For the deletion philosophy behind the tags, see the
`soe:minimal-code` skill.
