---
id: constitutional-memory-maintenance-guide
title: "Constitutional memory maintenance guide"
status: active
type: guide
section: guides
topic-id: constitutional-memory
topic-role: companion
publication-status: current-companion
publication-summary: "Current companion doc beneath active topic owner constitutional-memory-overview."
recommended-action: update-current-companion
current-owner: constitutional-memory-overview
active-owners:
  - constitutional-memory-overview
audience:
  - ai
  - human
source: workspace:pi-loom
verified-at: 2026-03-28T00:10:30.000Z
verification-source: manual:docs-coverage-review-2026-03-28
successor: null
successor-title: null
predecessors: []
retirement-reason: null
topics:
  - constitution
  - project-policy
  - roadmap
outputs:
  - https-github-com-z3z1ma-pi-loom-git:CONSTITUTION.md
upstream-path: CONSTITUTION.md
---

# Constitutional memory maintenance guide

## When to update constitutional memory

Update constitutional memory when the durable identity of the project changes, not when a local implementation detail changes.

Typical triggers include:

- a changed project vision or strategic direction
- a new or revised non-negotiable constraint
- a principle clarified by hard-earned experience
- a roadmap item that materially changes status or intent
- a strategic decision that future work will need to recover later

## What does not belong there

Do not use constitutional memory for:

- ticket-level execution status
- implementation notes
- one-off debugging results
- package-local workflow tips
- temporary operator instructions

Those belong in tickets, plans, docs, research, or AGENTS guidance instead.

## Updating the aggregate

The constitutional layer is modeled as one mutable aggregate.

That means changes should be made deliberately and coherently:

- update the complete principles list when principles change
- update the complete constraints list when constraints change
- record strategic decisions explicitly rather than hiding them in chat
- keep roadmap items embedded in the aggregate and treat their ids as constitution-scoped only

## Relationship to repo publications

`CONSTITUTION.md` is the repo-visible publication of constitutional truth. Keep it aligned with canonical constitutional memory rather than treating it as a separate scratch document.

## Practical review rule

If a future reader would need this clarification to understand why the project behaves the way it does, it probably belongs in constitutional memory.
