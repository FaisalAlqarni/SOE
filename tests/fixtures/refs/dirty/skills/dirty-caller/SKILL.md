---
name: dirty-caller
description: A skill that references both an existing and a missing skill.
---

This skill delegates to soe:exists for the happy path.

It also (wrongly) references soe:missing, which does not resolve to any
skill, agent, or command — this is a dangling reference and must FAIL.
