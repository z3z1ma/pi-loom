---
id: integrated-plan-authoring
title: "Integrated plan authoring"
status: active
type: overview
section: overviews
topic-id: integrated-plan-authoring
topic-role: owner
publication-status: current-owner
publication-summary: "Current canonical overview for governed topic integrated-plan-authoring."
recommended-action: update-current-owner
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
  - execution-strategy
  - plans
  - tickets
outputs: []
upstream-path: null
---

# Integrated plan authoring

Integrated plan authoring keeps execution strategy in the plan layer while allowing one plan write to materialize the linked ticket set when the rollout is already clear.

## What the integrated path solves

Plans need to stay the durable execution-strategy layer rather than devolving into chat-only scratchpads. The integrated path lets the author create or update the plan and its ticket set together when every resulting ticket can still be written as a complete self-contained execution unit.

## When to use it

Use integrated authoring when the execution slice is already well understood and the linked tickets can be authored truthfully in the same pass. Use staged authoring when the plan should be created first and ticket definitions need more room or later sequencing.

## Boundary to preserve

Plans own the rollout narrative, linked ticket membership, sequencing, interfaces, and validation intent. Tickets remain the live execution ledger with their own acceptance criteria, dependencies, and journal history.
