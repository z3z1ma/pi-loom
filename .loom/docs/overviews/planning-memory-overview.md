---
id: planning-memory-overview
title: "Planning memory overview"
status: active
type: overview
section: overviews
topic-id: planning-memory
topic-role: owner
publication-status: current-owner
publication-summary: "Current canonical overview for governed topic planning-memory."
recommended-action: update-current-owner
current-owner: planning-memory-overview
active-owners:
  - planning-memory-overview
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
topics: []
outputs:
  - https-github-com-z3z1ma-pi-loom-git:plans/README.md
upstream-path: plans/README.md
---

# Planning memory overview

## Purpose

Planning memory is Pi Loom's execution-strategy layer.

It exists to translate accepted behavior and broader context into a bounded, high-context execution narrative for a linked ticket set without replacing the ticket ledger.

## What plans hold

Plans are where Pi Loom keeps the durable execution strategy around a work slice. A plan may capture:

- the purpose and big picture
- context and orientation
- milestones
- plan-of-work sequencing
- concrete execution steps
- validation and acceptance strategy
- idempotence and recovery guidance
- interfaces and dependencies
- risks and open questions
- linked tickets and their role/order
- progress, discoveries, decisions, and revision notes

## Why it is separate

Pi Loom keeps planning distinct from both specs and tickets.

- Specs remain declarative behavior contracts.
- Plans turn those contracts and surrounding context into execution strategy.
- Tickets remain the live execution ledger and the self-contained units of work.

If plans disappear, sequencing and execution rationale get lost. If plans try to become tickets, the live ledger becomes muddled.

## Current model

Plan state is stored canonically in SQLite via `pi-storage`.

Plans can compile bounded packets from linked constitution, research, initiative, spec, ticket, critique, and docs context. They can also materialize or link tickets while keeping those tickets as the source of live execution truth.

## Relationship to Ralph

Ralph runs are often plan-aware, but Ralph is not the planning layer.

Plans define the bounded execution strategy that Ralph later consumes through packetized fresh-context runs against one ticket at a time.

## Practical implication

When the behavior contract is understood well enough to sequence real work, create or update a plan instead of stretching a spec into rollout prose or stuffing strategy into one ticket body. Planning memory is where execution strategy should become durable.
