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
verified-at: 2026-03-28T03:16:30.000Z
verification-source: manual:docs-tool-semantics-review-2026-03-28
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

A strong spec names a capability or behavior the system should support. It should remain intelligible after the current implementation changes, so it cannot be written like a task list, migration note, or summary of the diff that happened to prompt the work.

## Keep the boundary declarative

A spec should explain:

- what must be true
- why the behavior matters
- which scenarios, constraints, and failure modes shape the contract
- how acceptance will be judged

It should not become the place where rollout sequencing, ticket choreography, or implementation scratch notes accumulate.

## Use the lifecycle deliberately

Mutable specs are where clarification and shaping happen. Proposed, clarifying, and specified records are still draft contracts, so they may be refined while the intended behavior is still being settled.

Delete is for draft cleanup, not for rewriting history. If a mutable spec should not survive as durable history at all, it can be removed before other durable records depend on it. Once a spec is finalized, that draft phase is over: the clarifications, design notes, analysis, checklist output, and linked context become governed read-only history. Archive comes only after finalization and is terminal; it preserves the frozen record for reading, lineage, and capability provenance.

## Hand off cleanly downstream

The coherent path is:

- research informs the problem space
- initiatives frame strategic context when needed
- specs define intended behavior
- plans translate accepted behavior into execution strategy and ticket linkage
- tickets carry the live execution work

If accepted behavior changes after finalization, capture that in a new spec lineage and record supersession there instead of reopening or silently rewriting finalized or archived history.

## Practical rule

If a reader could confuse the document for a plan or a ticket, the spec is probably not staying declarative enough. If you are using a finalized or archived spec like editable working notes, you are also in the wrong layer. Keep drafting inside mutable specs, delete abandoned drafts before they become durable history, and let finalized records stand as the truthful contract they accepted.
