---
id: ticket-ledger-maintenance-guide
title: "Ticket ledger maintenance guide"
status: active
type: guide
section: guides
topic-id: ticket-ledger
topic-role: companion
publication-status: current-companion
publication-summary: "Current companion doc beneath active topic owner ticket-ledger-and-execution-records-overview."
recommended-action: update-current-companion
current-owner: ticket-ledger-and-execution-records-overview
active-owners:
  - ticket-ledger-and-execution-records-overview
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
  - execution-ledger
  - tickets
  - verification
  - workflow
outputs:
  - https-github-com-z3z1ma-pi-loom-git:ticketing/README.md
upstream-path: ticketing/README.md
---

# Ticket ledger maintenance guide

## Treat tickets as the live truth of work

A ticket should be kept truthful enough that a fresh reader can understand what the work is, what changed, and what still blocks completion.

## Keep the body complete

Tickets should carry enough detail to resume execution honestly:

- context
- scope and non-goals
- acceptance criteria
- risks and edge cases
- dependencies
- verification expectations

## Update reality as it changes

Keep the ticket current through:

- status changes
- journal entries
- blockers
- dependency updates
- checkpoints and attachments when they improve handoff or auditability

Do not let the ticket body drift behind what actually happened.

## Preserve branch intent explicitly

If worktree-backed execution depends on branch intent, keep that intent on the ticket rather than inferring it from ad hoc local git state.

## Practical rule

If a later Ralph run, reviewer, or human operator would be misled by the ticket as written, the ticket is not being maintained truthfully enough.
