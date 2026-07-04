---
name: critique
description: "Red-team a design or plan document before it is executed. Dispatches the soe:devils-advocate agent to run the soe:adversarial-review methodology against a target file and return numbered findings."
allowed_tools: Read, Task
command: true
---

# /soe:critique — adversarial review of a design or plan

Runs the **adversarial gate** (design §3.4) on demand. It dispatches the
`soe:devils-advocate` agent (Opus, fresh isolated context) to red-team a target
document using the `soe:adversarial-review` methodology, and returns a **numbered
findings list** followed by the *discuss all / some / continue* choice.

## Usage

```
/soe:critique design <file>    # red-team a design/spec/architecture doc
/soe:critique plan <file>      # red-team a plan doc + design↔plan cross-reference
```

- **`design <file>`** — design mode: gaps, inconsistencies, missing pieces,
  pattern misuse, against the quality lens.
- **`plan <file>`** — plan mode: everything design mode does on the plan, PLUS a
  **design↔plan cross-reference** (faithfulness, drift, dropped scope, scope
  creep). Point it at the plan; it locates and reads the referenced design.

## Examples

```
/soe:critique design docs/plans/2026-07-03-soe-design.md
/soe:critique plan docs/plans/my-feature-plan.md
```

## What it does

1. Parse the mode (`design` | `plan`) and the target `<file>` from the arguments.
   If the mode is missing or not one of `design`/`plan`, or the file does not
   exist, report the correct usage and stop.
2. **Dispatch `soe:devils-advocate`** via the Task tool, instructing it to run the
   `soe:adversarial-review` skill in the parsed mode against `<file>` (and, for
   `plan` mode, to locate and cross-reference the design doc).
3. Relay the agent's numbered findings and its **discuss all / discuss some /
   continue** prompt back to you. Do not resolve findings until you choose.

This is the same methodology the orchestrator runs automatically at
`EVALUATE_PLAN`; `/soe:critique` is the manual, on-demand entry point.
