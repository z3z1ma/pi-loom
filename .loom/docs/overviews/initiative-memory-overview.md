---
id: initiative-memory-overview
title: "Initiative memory overview"
status: active
type: overview
section: overviews
topic-id: initiative-memory
topic-role: owner
publication-status: current-owner
publication-summary: "Current canonical overview for governed topic initiative-memory."
recommended-action: update-current-owner
current-owner: initiative-memory-overview
active-owners:
  - initiative-memory-overview
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
  - https-github-com-z3z1ma-pi-loom-git:initiatives/README.md
upstream-path: initiatives/README.md
---

# Initiative memory overview

## Purpose

Initiative memory is Pi Loom's strategic outcome layer.

It exists to connect codebase work to broader product, business, or program direction without collapsing that direction into a pile of tickets or rollout checklists.

## What initiatives hold

An initiative is the durable home for the strategic framing around a body of work. It may capture:

- the objective
- intended outcomes
- in-scope and out-of-scope surface area
- success metrics
- milestones
- risks
- status summaries
- owners and timing expectations
- links to research, specs, tickets, and constitutional roadmap items

## Why it is separate

Pi Loom keeps initiatives distinct from specs, plans, and tickets because they answer a different question.

- Initiatives explain why a broader body of work matters.
- Specs explain what behavior should be true.
- Plans explain how execution should be sequenced.
- Tickets explain the live truth of individual execution units.

Without initiatives, strategy gets reconstructed from lower-level execution artifacts that were not designed to carry it.

## Current model

Initiative state is stored canonically in SQLite via `pi-storage`.

The layer supports milestone tracking, append-only decision history, linked specs and tickets, and overview views that summarize strategic progress over related work.

## Relationship to the rest of Loom

Initiatives sit between research and the spec/plan/ticket execution side of the stack.

They often inherit evidence from research and constitutional direction from roadmap items, then shape the downstream specification and execution work needed to realize that strategic outcome.

## Practical implication

When work spans multiple specs or multiple ticket streams, create or update an initiative instead of forcing strategy into one ticket, one plan, or one chat thread. Initiative memory is where strategic intent should stay durable.
