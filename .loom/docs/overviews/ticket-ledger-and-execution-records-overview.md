---
id: ticket-ledger-and-execution-records-overview
title: "Ticket ledger and execution records overview"
status: active
type: overview
section: overviews
topic-id: ticket-ledger
topic-role: owner
publication-status: current-owner
publication-summary: "Current canonical overview for governed topic ticket-ledger."
recommended-action: update-current-owner
current-owner: ticket-ledger-and-execution-records-overview
active-owners:
  - ticket-ledger-and-execution-records-overview
audience:
  - ai
  - human
source: workspace:pi-loom
verified-at: 2026-03-27T23:25:30.000Z
verification-source: manual:docs-zero-drift-review-2026-03-27
successor: null
successor-title: null
predecessors: []
retirement-reason: null
topics: []
outputs:
  - https-github-com-z3z1ma-pi-loom-git:ticketing/README.md
upstream-path: ticketing/README.md
---

# Ticket ledger and execution records overview

## Purpose

Tickets are Pi Loom's durable execution ledger.

They are the canonical shared record of one bounded unit of work: what problem is being solved, what has to be true before the work is done, what changed during execution, and what evidence justifies the current state.

## What a ticket records

A ticket is meant to stand on its own for a fresh human or AI reader.

In practice that means the ticket carries the execution detail that other layers should not have to reconstruct later:

- why this work matters now
- scope and explicit non-goals
- acceptance criteria and verification expectations
- dependencies, blockers, and execution risks
- journaled decisions, discoveries, and scope changes
- checkpoints or attachments when they improve auditability or handoff

The ticket ledger also separates durable lifecycle state from derived coordination views. A ticket can still store \`open\` while list and graph surfaces show that it is ready or blocked based on dependencies. That lets the system surface execution truth without rewriting the underlying history every time dependency state changes.

## Relationship to plans

Plans sit above tickets as the execution-strategy layer.

A plan gathers the broader context for a rollout, owns ticket linkage, sequencing, interfaces, milestones, and validation intent, and explains why the work is being staged the way it is. The plan does not replace the ticket body. Each linked ticket still needs to be a complete execution record for one unit of work.

This boundary matters because a plan answers “how does this rollout fit together?” while a ticket answers “what is true about this exact work item right now?”

## Relationship to Ralph

Ralph is the ticket-bound orchestration layer, not a second execution ledger.

A Ralph run is bound to one ticket, optionally under a governing plan, and each bounded iteration is expected to leave the ticket more truthful than it found it. Status, journal updates, verification notes, blockers, checkpoints, and branch intent remain on the ticket so later humans, critics, and reruns can resume from durable state instead of from transcript residue.

Ralph's packets, run narratives, and runtime artifacts are observability and orchestration surfaces. They explain what the loop did, but they are not the canonical record of whether the work is actually complete.

## Relationship to critique and docs

Critique judges the work against its contract and surrounding context. Documentation explains accepted reality after that work has landed.

Neither layer should become the place where live execution state is maintained. If the ticket is stale, later critique and docs work inherit stale execution truth.

## Projections and rendered outputs

Pi Loom stores canonical ticket state in SQLite via the ticketing layer.

Rendered ticket markdown, packets, checkpoints, and repo-visible projections are derived review surfaces. They are useful because they make the ledger legible outside the database, but they are snapshots rendered from canonical state rather than a parallel system of record.

## Branch intent and worktree execution

Execution tickets can also carry durable branch intent for worktree-backed runs.

That branch intent belongs on the ticket because it is part of the execution contract, not an incidental detail of one local clone. Ralph consumes the ticket's declared branch mode, family, or exact branch name instead of inventing lineage from local git heuristics.

## Practical implication

When execution becomes confusing, fix the ticket or the governing plan before trying to compensate in Ralph steering, critique prose, or ad hoc notes.

In Pi Loom, tickets are where execution truth is supposed to stay legible.
