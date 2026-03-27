---
id: specifications-as-behavior-contracts
title: "Specifications as behavior contracts"
status: active
type: overview
section: overviews
topic-id: specification-layer-semantics
topic-role: owner
publication-status: current-owner
publication-summary: "Current canonical overview for governed topic specification-layer-semantics."
recommended-action: update-current-owner
current-owner: specifications-as-behavior-contracts
active-owners:
  - specifications-as-behavior-contracts
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
  - behavior-contracts
  - requirements
  - specs
outputs: []
upstream-path: null
---

# Specifications as behavior contracts

Pi Loom specifications define intended behavior, not implementation steps. A spec should still make sense when read in isolation after the implementation changes.

## What a spec is for

A spec is the durable contract for one bounded capability or behavior slice. It explains what must be true, why it matters, what constraints shape the design, and how success will be recognized.

## What a spec is not

A spec is not a task list, migration journal, or execution scratchpad. It should not be written around the current code delta.

## Relationship to adjacent layers

Research captures evidence and discovery. Initiatives provide longer-horizon strategic context. Plans translate accepted behavior into execution strategy and ticket linkage. Tickets remain the execution ledger.
