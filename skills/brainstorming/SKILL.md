---
name: brainstorming
description: "You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation."
---

# Brainstorming Ideas Into Designs

> Gate type: **judgment** (front-load/escalate per `soe:soe-modes` — see `soe:gate-classification`).

Help turn ideas into fully formed designs and specs through natural collaborative dialogue.

Start by understanding the current project context, then ask questions one at a time to refine the idea. Once you understand what you're building, present the design and get user approval.

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, scaffold any project, or take any implementation action until you have presented a design and the user has approved it. This applies to EVERY project regardless of perceived simplicity.
</HARD-GATE>

## Anti-Pattern: "This Is Too Simple To Need A Design"

Every project goes through this process. A todo list, a single-function utility, a config change — all of them. "Simple" projects are where unexamined assumptions cause the most wasted work. The design can be short (a few sentences for truly simple projects), but you MUST present it and get approval.

## Checklist

You MUST create a task for each of these items and complete them in order:

1. **Explore project context** — check files, docs, recent commits
2. **Offer the visual companion just-in-time** — NOT upfront. The first time a question would genuinely be clearer shown than described, offer it then (its own message); on approval its browser tab opens for you. If no visual question ever arises, never offer it. See the Visual Companion section below.
3. **Ask clarifying questions** — one at a time, understand purpose/constraints/success criteria
4. **Propose 2-3 approaches** — with trade-offs and your recommendation
5. **Present design** — in sections scaled to their complexity, get user approval after each section
6. **Write design doc** — save to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` and commit
7. **Spec self-review** — quick inline check for placeholders, contradictions, ambiguity, scope (see below)
8. **User reviews written spec** — ask user to review the spec file before proceeding
9. **Present the 4-option next-steps menu** — Ready / Revise / Save & exit / Discard (see "After the Design")
10. **Transition to implementation** — on "Ready", ask workspace preference (worktree vs branch), then invoke writing-plans skill to create implementation plan

## Process Flow

```dot
digraph brainstorming {
    "Explore project context" [shape=box];
    "Ask clarifying questions" [shape=box];
    "Propose 2-3 approaches" [shape=box];
    "Present design sections" [shape=box];
    "User approves design?" [shape=diamond];
    "Write design doc" [shape=box];
    "Spec self-review\n(fix inline)" [shape=box];
    "User reviews spec?" [shape=diamond];
    "Present 4-option menu" [shape=box];
    "Which option?" [shape=diamond];
    "Ask workspace preference\n(worktree vs branch)" [shape=box];
    "Invoke writing-plans skill" [shape=doublecircle];

    "Explore project context" -> "Ask clarifying questions";
    "Ask clarifying questions" -> "Propose 2-3 approaches";
    "Propose 2-3 approaches" -> "Present design sections";
    "Present design sections" -> "User approves design?";
    "User approves design?" -> "Present design sections" [label="no, revise"];
    "User approves design?" -> "Write design doc" [label="yes"];
    "Write design doc" -> "Spec self-review\n(fix inline)";
    "Spec self-review\n(fix inline)" -> "User reviews spec?";
    "User reviews spec?" -> "Write design doc" [label="changes requested"];
    "User reviews spec?" -> "Present 4-option menu" [label="approved"];
    "Present 4-option menu" -> "Which option?";
    "Which option?" -> "Ask clarifying questions" [label="2: revise"];
    "Which option?" -> "Present 4-option menu" [label="3: save & exit (stop)"];
    "Which option?" -> "Explore project context" [label="4: discard & restart"];
    "Which option?" -> "Ask workspace preference\n(worktree vs branch)" [label="1: ready"];
    "Ask workspace preference\n(worktree vs branch)" -> "Invoke writing-plans skill";
}
```

**The terminal state is invoking writing-plans.** Do NOT invoke frontend-design, mcp-builder, or any other implementation skill. The ONLY skill you invoke after brainstorming is writing-plans.

## The Process

**Understanding the idea:**

- Check out the current project state first (files, docs, recent commits)
- Before asking detailed questions, assess scope: if the request describes multiple independent subsystems (e.g., "build a platform with chat, file storage, billing, and analytics"), flag this immediately. Don't spend questions refining details of a project that needs to be decomposed first.
- If the project is too large for a single spec, help the user decompose into sub-projects: what are the independent pieces, how do they relate, what order should they be built? Then brainstorm the first sub-project through the normal design flow. Each sub-project gets its own spec → plan → implementation cycle.
- For appropriately-scoped projects, ask questions one at a time to refine the idea
- Prefer multiple choice questions when possible, but open-ended is fine too
- Only one question per message - if a topic needs more exploration, break it into multiple questions
- Focus on understanding: purpose, constraints, success criteria

**Exploring approaches:**

- Propose 2-3 different approaches with trade-offs
- Present options conversationally with your recommendation and reasoning
- Lead with your recommended option and explain why

**Presenting the design:**

- Once you believe you understand what you're building, present the design
- Scale each section to its complexity: a few sentences if straightforward, up to 200-300 words if nuanced
- Ask after each section whether it looks right so far
- Cover: architecture, components, data flow, error handling, testing
- Be ready to go back and clarify if something doesn't make sense

**Design for isolation and clarity:**

- Break the system into smaller units that each have one clear purpose, communicate through well-defined interfaces, and can be understood and tested independently
- For each unit, you should be able to answer: what does it do, how do you use it, and what does it depend on?
- Can someone understand what a unit does without reading its internals? Can you change the internals without breaking consumers? If not, the boundaries need work.
- Smaller, well-bounded units are also easier for you to work with - you reason better about code you can hold in context at once, and your edits are more reliable when files are focused. When a file grows large, that's often a signal that it's doing too much.

**Working in existing codebases:**

- Explore the current structure before proposing changes. Follow existing patterns.
- Where existing code has problems that affect the work (e.g., a file that's grown too large, unclear boundaries, tangled responsibilities), include targeted improvements as part of the design - the way a good developer improves code they're working in.
- Don't propose unrelated refactoring. Stay focused on what serves the current goal.

## After the Design

**Documentation:**

- Write the validated design (spec) to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
  - (User preferences for spec location override this default; e.g. `docs/plans/YYYY-MM-DD-<topic>-design.md`)
- Use elements-of-style:writing-clearly-and-concisely skill if available, or the bundled `./writing-clearly-and-concisely.md` helper, to polish the design doc prose
- Commit the design document to git

**Spec Self-Review:**
After writing the spec document, look at it with fresh eyes:

1. **Placeholder scan:** Any "TBD", "TODO", incomplete sections, or vague requirements? Fix them.
2. **Internal consistency:** Do any sections contradict each other? Does the architecture match the feature descriptions?
3. **Scope check:** Is this focused enough for a single implementation plan, or does it need decomposition?
4. **Ambiguity check:** Could any requirement be interpreted two different ways? If so, pick one and make it explicit.

Fix any issues inline. No need to re-review — just fix and move on.

**User Review Gate:**
After the spec review loop passes, ask the user to review the written spec before proceeding:

> "Spec written and committed to `<path>`. Please review it and let me know if you want to make any changes before we start writing out the implementation plan."

Wait for the user's response. If they request changes, make them and re-run the spec review loop. Only proceed once the user approves.

**Next steps — present exactly these 4 options:**

Once the user approves the written spec, present this menu (do NOT proceed to implementation on your own):

```
Design complete. What would you like to do?

1. Ready — proceed to implementation
2. Revise — continue brainstorming (new idea or change)
3. Save & exit — keep design doc, come back later
4. Discard & start fresh — drop design, new brainstorm

Which option?
```

**If option 1 (Ready):**
- **Bind the design doc to a track, then hand off to `/go`.** When brainstorming
  is running as the spec-derivation step of an soe entry command (`/go`,
  `/go-all`), the design doc must be BOUND to the track so the loop reads it (not
  merely present on disk — an unbound doc is never silently adopted). Write the
  `design_doc` path into `.soe/tracks/{id}/state.json` under the writer lock via
  `lib/state.js` (`process.env.CLAUDE_PLUGIN_ROOT` for the import), merging into
  the existing state so `tasks`/`loop_state` are preserved:

  ```bash
  node -e '
    const ROOT = process.env.CLAUDE_PLUGIN_ROOT;
    import(`${ROOT}/lib/state.js`).then(async (S) => {
      const [dir, docPath] = process.argv.slice(1);
      await S.withWriterLock(dir, () => {
        const st = S.readState(dir) || {};
        S.writeState(dir, { ...st, design_doc: docPath, spec_mode: "human" });
      });
      console.log("bound", docPath);
    });
  ' ".soe/tracks/<id>" "<design-doc-path>"
  ```

  Then hand off to `/go`: `/go` sees the bound `design_doc`, skips re-brainstorm,
  and dispatches `soe:soe-orchestrator` to run `PLAN → EVALUATE_PLAN → EXECUTE →
  EVALUATE_EXEC → COMPLETE`. Workspace setup (worktree vs branch) and planning
  are owned by the loop — the orchestrator's PLAN phase runs `soe:writing-plans`
  via `soe:loop-planner`.

- **Standalone brainstorm (no soe track / not invoked by an entry command):** ask
  workspace preference:
  ```
  How would you like to set up the workspace?

  1. Create an isolated worktree (recommended for larger features)
  2. Work directly on a new branch
  ```
  - If worktree: use the soe:using-git-worktrees skill to create the isolated workspace
  - If direct branch: create a new branch from current HEAD
  - Then invoke the writing-plans skill to create a detailed implementation plan.
    Do NOT invoke any other implementation skill — writing-plans is the terminal state.

**If option 2 (Revise):**
- Ask what the user wants to change or explore
- Loop back to the appropriate phase (understanding, approaches, or design)

**If option 3 (Save & exit):**
- Confirm the design doc is saved and committed
- Report: "Design saved to `<path>`. You can resume implementation later by resuming with the `soe:writing-plans` skill and this design doc."

**If option 4 (Discard & start fresh):**
- Confirm: "This will discard the current design. Are you sure?"
- If confirmed: start over from the first checklist item

## Key Principles

- **One question at a time** - Don't overwhelm with multiple questions
- **Multiple choice preferred** - Easier to answer than open-ended when possible
- **YAGNI ruthlessly** - Remove unnecessary features from all designs
- **Explore alternatives** - Always propose 2-3 approaches before settling
- **Incremental validation** - Present design, get approval before moving on
- **Be flexible** - Go back and clarify when something doesn't make sense

## Visual Companion

A browser-based companion for showing mockups, diagrams, and visual options during brainstorming. Available as a tool — not a mode. Accepting the companion means it's available for questions that benefit from visual treatment; it does NOT mean every question goes through the browser.

**Offering the companion (just-in-time):** Do NOT offer it upfront. Wait until a question would genuinely be clearer shown than told — a real mockup / layout / diagram question, not merely a UI *topic*. The first time that happens, offer it then, as its own message:
> "This next part might be easier if I show you — I can put together mockups, diagrams, and comparisons in a browser tab as we go. It's still new and can be token-intensive. Want me to? I'll open it for you."

**This offer MUST be its own message.** Only the offer — no clarifying question, summary, or other content. Wait for the user's response. If they accept, start the server with `--open` so their browser opens to the first screen automatically. If they decline, continue text-only and don't offer again unless they raise it.

**Per-question decision:** Even after the user accepts, decide FOR EACH QUESTION whether to use the browser or the terminal. The test: **would the user understand this better by seeing it than reading it?**

- **Use the browser** for content that IS visual — mockups, wireframes, layout comparisons, architecture diagrams, side-by-side visual designs
- **Use the terminal** for content that is text — requirements questions, conceptual choices, tradeoff lists, A/B/C/D text options, scope decisions

A question about a UI topic is not automatically a visual question. "What does personality mean in this context?" is a conceptual question — use the terminal. "Which wizard layout works better?" is a visual question — use the browser.

If they agree to the companion, read the detailed guide before proceeding:
`skills/brainstorming/visual-companion.md`
