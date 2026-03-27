---
id: specification-layer-semantics
title: "Specification layer semantics"
status: active
type: concept
section: concepts
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
source: workspace:workspace
verified-at: 2026-03-27T10:46:33.159Z
verification-source: manual:pl-0131-iter-001
successor: null
successor-title: null
predecessors: []
retirement-reason: null
topics:
  - behavior-contracts
  - layer-boundaries
  - specs
outputs: []
upstream-path: null
---

# Specification layer semantics

Specifications are the bounded declarative behavior contracts in Pi Loom.

## Core rule

A spec should still make sense when read in isolation after the implementation changes. It names what the system supports and what must be true, not the steps required to change today's code.

## Naming and framing

Write titles around the behavior or capability being specified rather than an implementation delta. Prefer stable behavior names over task phrasing.

## Layer boundaries

Research captures evidence and discovery. Initiatives hold strategic outcome context. Plans translate accepted behavior into execution strategy and linked ticket work. Tickets remain the live execution ledger.
