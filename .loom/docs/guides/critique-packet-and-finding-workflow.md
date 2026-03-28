---
id: critique-packet-and-finding-workflow
title: "Critique packet and finding workflow"
status: active
type: guide
section: guides
topic-id: critique-memory
topic-role: companion
publication-status: current-companion
publication-summary: "Current companion doc beneath active topic owner critique-memory-overview."
recommended-action: update-current-companion
current-owner: critique-memory-overview
active-owners:
  - critique-memory-overview
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
  - critique
  - findings
  - review
  - workflow
outputs:
  - https-github-com-z3z1ma-pi-loom-git:critique/README.md
upstream-path: critique/README.md
---

# Critique packet and finding workflow

## Start from the right review question

A critique is strongest when the review question is bounded and explicit.

State what is being judged, which focus areas matter, and which surrounding context the reviewer needs.

## Build a packet that includes intent, not just a diff

A useful critique packet should bring in the surrounding strategic and execution context:

- constitution when policy matters
- research when evidence matters
- specs when behavior contracts matter
- plans when execution strategy matters
- tickets when live execution truth matters

Without that context, review collapses into shallow diff commentary.

## Record findings durably

Findings should explain:

- what is wrong
- why it matters
- what evidence supports the claim
- what follow-up work is recommended

Accepted findings may spawn tickets, but critique should still remain the durable review record.

## Keep critique distinct from execution

A critique should not become a ticket diary or a replacement execution ledger. Its role is to challenge work, not to masquerade as the work itself.

## Practical rule

If the review would be hard to reconstruct later without reopening the original chat, the critique packet or findings were not durable enough.
