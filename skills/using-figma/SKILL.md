---
name: using-figma
description: Optional Figma design-source provider for spec-grounding — detected via a registered Figma MCP (its figma skill / mcp__*figma* tools like use_figma / get_design_context / authenticate). During spec creation for UI/frontend work, when the Figma MCP is available AND authenticated AND the user gave a Figma URL, reads design context (components, layout, spacing/tokens, variants, flows) READ-ONLY from that URL and grounds the design doc's UI section in the ACTUAL design instead of guessing. Three-part guard; silently skipped (no prompt, no offer) when absent OR unauthenticated OR no URL — the agent then derives the UI from intent as usual. NEVER writes to Figma (no generate-design / code-connect). Registered as an optional design-source provider by soe:capability-discovery.
metadata:
  role: design-source
  provider: figma
  posture: read-only
  status: optional
---

# using-figma — optional Figma design-source for spec-grounding (design §6)

Figma is a **first-class OPTIONAL** provider: a **design source** soe uses during
**spec creation** to ground a UI/frontend spec in the **ACTUAL design** —
components, layout, spacing/tokens, variants, flows — instead of guessing the UI
from intent. It is used **only if present**, is **READ-ONLY**, and **silently
falls back** to normal spec-derivation when absent. Core never hard-depends on it.

> When a real Figma design exists, ground the spec in it — cite the real node and
> component names so the spec matches the design. When it's absent, unauthed, or
> no URL was given, proceed exactly as normal and describe the UI from intent.

## When

During **spec creation** — the brainstorming / auto-spec derivation phase — for
**UI/frontend work**. This is the moment the design doc's UI section is written;
grounding it against a real design is only valuable here. For non-UI work, or
after the spec is written, there is nothing to do.

## 1. Detect + the three-part guard (all three must hold, else DO NOTHING)

Grounding runs **only** when **ALL THREE** are true. If **any** is false → do
nothing special, proceed with normal spec-derivation. No error, no prompt, no
offer.

1. **Available** — the Figma MCP is registered in the session: its skill /tools
   are present (e.g. a `figma` skill, or `mcp__*figma*` tools such as
   `use_figma` / `get_design_context` / `authenticate`).
   - **Not installed → skip silently.** Use native intent-based UI description.
2. **Authenticated** — the Figma MCP's auth is complete.
   - **Installed but NOT authenticated → skip SILENTLY.** Do **not** prompt, do
     **not** offer to authenticate, do **not** surface it at all. Proceed with
     normal spec-derivation as if Figma were absent. (A partially-known world is
     treated as absent, never optimistically as present.)
3. **URL provided** — the user gave a Figma URL: in the goal, or when
   brainstorming asks for one on UI/frontend work (a single natural ask — "do you
   have a Figma design URL?"). No URL volunteered → **skip.**
   - No URL → skip silently; describe the UI from intent as usual.

Only when **available AND authenticated AND a URL is in hand** does grounding
proceed. This is the silent-fallback posture, encoded: two of three (or one of
three) is still "absent" for routing purposes.

## 2. What it does when live — read design context, ground the UI section

With all three satisfied, pull design context via the Figma MCP **READ** path for
the given URL and fold it into the design doc's UI section:

| Need | Figma READ call | Grounds |
|---|---|---|
| components / element inventory for the node | `get_design_context` (design context) / get-code-for-a-node | which components the UI is built from |
| layout / structure / hierarchy | design context (layout) | the screen's structure and arrangement |
| spacing / tokens / variables | variables / tokens (design context) | real spacing, color, and type tokens |
| variants / states | design context (variants) | the states each component must cover |
| flows | design context (flows) | how screens connect |

Then **ground the design doc's UI section in it** — describe the components,
layout, spacing/tokens, variants, and flows from the design, and **cite the Figma
node / component names** so the spec provably matches the design (e.g. "the
`PrimaryButton` component / the `Checkout / Summary` frame"). The spec is written
against the real design, not an invented UI.

## 3. Read-only RULE (non-negotiable)

- **READ-ONLY.** Only ever *read* design context from the given URL. **NEVER**
  create or modify a Figma file, node, variable, component, or style.
- **NEVER call the generate / write path.** The Figma MCP also exposes
  generate-design and code-connect (write-side) surfaces — those are **out of
  scope here**. Do not invoke them; grounding a spec never writes to Figma.

## 4. Fallback — normal spec-derivation

If Figma is absent, **or** installed-but-unauthenticated, **or** no URL was
provided → proceed with **normal spec-derivation**: the agent describes the UI
from the user's intent exactly as it would with no Figma provider at all. The run
is identical to a Figma-never-installed run — additive only, never required.

## 5. Posture

Reading design context to ground a spec is a **read-only** design-source role
(reversible, no side effects) → **auto-use + log** that the spec was grounded in
Figma and cite the source node/URL (per `soe:capability-discovery`). Figma here
never takes an irreversible action, so it does not touch the escalation/confirm
gate.

## Red flags (stop and correct)

- **Requiring** Figma — any spec path that errors, prompts, or stalls when Figma
  is absent instead of deriving the UI from intent. Core must run Figma-absent,
  unchanged.
- **Prompting / offering to authenticate** when the MCP is installed but
  unauthenticated — the unauthed case is a **silent** skip, no surfacing.
- Proceeding to ground when **any** of the three (available / authenticated /
  URL) is missing — all three are required.
- **Writing to Figma** — calling generate-design / code-connect / any create or
  modify tool. This provider is strictly READ-ONLY.
- Grounding the spec in Figma but **not citing** the node/component names, so the
  spec can't be checked against the design.
