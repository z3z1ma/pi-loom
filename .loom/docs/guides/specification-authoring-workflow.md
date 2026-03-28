---
id: specification-authoring-workflow
title: "Specification authoring workflow"
status: active
type: guide
section: guides
topic-id: specification-layer-semantics
topic-role: companion
publication-status: current-companion
publication-summary: "Current companion doc beneath active topic owner specifications-as-behavior-contracts."
recommended-action: update-current-companion
current-owner: specifications-as-behavior-contracts
active-owners:
  - specifications-as-behavior-contracts
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
  - behavior-contracts
  - specs
  - workflow
outputs:
  - https-github-com-z3z1ma-pi-loom-git:specs/README.md
upstream-path: specs/README.md
---

# Specification authoring workflow

## Start from behavior, not the diff

A good spec names a capability or behavior the system should support. It should not read like a task list or migration note.

## Keep the boundary declarative

A spec should answer:

- what must be true
- why it matters
- which scenarios and constraints matter
- how acceptance will be judged

A spec should not become the place where rollout sequencing or ticket choreography lives.

## Use the lifecycle deliberately

Mutable specs are where clarification and shaping happen.

Once finalized, the spec becomes governed history. If behavior changes later, create a new change lineage rather than silently rewriting the finalized record.

## Hand off cleanly downstream

The coherent path is:

- research informs the problem space
- initiatives frame strategic context when needed
- specs define intended behavior
- plans translate that behavior into execution strategy
- tickets carry the live execution work

## Practical rule

If a reader could confuse the document for a plan or a ticket, the spec is probably not staying declarative enough.
