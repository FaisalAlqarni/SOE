---
name: clean-caller
description: A skill that only references existing targets.
---

This skill delegates to soe:exists for the happy path. Every soe:<name>
token here resolves to a real skill, agent, or command, so the dangling
check passes.
