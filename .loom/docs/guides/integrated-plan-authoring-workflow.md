---
id: integrated-plan-authoring-workflow
title: "Integrated plan authoring workflow"
status: active
type: guide
section: guides
topic-id: integrated-plan-authoring
topic-role: companion
publication-status: current-companion
publication-summary: "Current companion doc beneath active topic owner integrated-plan-authoring."
recommended-action: update-current-companion
current-owner: integrated-plan-authoring
active-owners:
  - integrated-plan-authoring
audience:
  - ai
  - human
source: workspace:workspace
verified-at: 2026-03-27T10:46:33.159Z
verification-source: manual:pl-0131-iter-001
successor: null
successor-title: null
predecessors: []
retirement-reason: null
topics:
  - plans
  - ticket-linkage
  - workflow
outputs: []
upstream-path: null
---

# Integrated plan authoring workflow

Integrated plan authoring keeps the plan as the durable execution-strategy container while letting `plan_write` create or update linked tickets in the same write when the rollout is already clear.

## Integrated path

Use the integrated path when:

- the execution slice is already understood
- each linked ticket can still be written as a complete self-contained execution unit
- the plan should immediately carry the authoritative linked-ticket set

## Staged path

Create or revise the plan first when ticket authorship needs more room, additional discovery, or later sequencing. In that case the plan remains the bounded strategy container and ticket linkage is added afterward.

## Important distinction

`linkedTickets` is active plan membership. Loose ticket references in packet context are not a replacement for that durable linkage.
