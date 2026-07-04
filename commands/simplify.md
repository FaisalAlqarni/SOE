---
name: simplify
description: "On-demand over-engineering review of a diff or path. Dispatches the soe:over-engineering-reviewer agent at a target (a given path, or the current working-tree diff if none) and reports its reducible-code findings ending with a net: -N lines possible estimate. No /go or pipeline needed."
allowed_tools: Read, Task
command: true
---

# /soe:simplify — on-demand over-engineering review

Runs the **over-engineering lens** (design §3.4) on demand — the primary
token-frugal path for hunting reducible code. It dispatches the
`soe:over-engineering-reviewer` agent (Opus, fresh isolated context) at a target
and returns its **reducible-code findings** ending with a
`net: -<N> lines possible.` estimate and a severity.

This is **ambient / on-demand**: no `/go`, no orchestrator, no pipeline. Point
it at a path or let it read the working-tree diff, and it reports what can be cut.

## Usage

```
/soe:simplify [path|diff]
```

- **`/soe:simplify <path>`** — review the given file or directory.
- **`/soe:simplify`** (no arg) — review the current **working-tree diff**
  (`git diff`), the same target a pre-commit review would see.

## Examples

```
/soe:simplify                     # review the uncommitted diff
/soe:simplify src/parser.ts       # review one file
/soe:simplify src/auth/           # review a directory
```

## What it does

1. Parse the optional target from the arguments. If a `<path>` is given, that is
   the target; if no argument is given, the target is the current working-tree
   diff (`git diff`).
2. **Dispatch `soe:over-engineering-reviewer`** via the Task tool, instructing it
   to review the target for reducible / over-engineered code — one line per
   finding, tagged `delete`/`stdlib`/`native`/`yagni`/`shrink`.
3. Relay the agent's findings and its closing `net: -<N> lines possible.`
   estimate (with severity) back to you. If there is nothing to cut, it reports
   `Lean already. Ship.`

**Advisory only.** The reviewer lists findings; it applies nothing. You decide
whether to act on each suggestion. This is the same lens the orchestrator runs
inside the review pipeline; `/soe:simplify` is the manual, on-demand entry point.

For a repo-wide sweep instead of a diff/path, use `/soe:over-eng-audit`. For the
deletion philosophy behind the tags, see the `soe:minimal-code` skill.
