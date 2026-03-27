---
id: loom-ralph-orchestration-overview
title: "Loom Ralph orchestration overview"
status: active
type: overview
section: overviews
topic-id: loom-ralph-orchestration
topic-role: owner
publication-status: current-owner
publication-summary: "Current canonical overview for governed topic loom-ralph-orchestration."
recommended-action: update-current-owner
current-owner: loom-ralph-orchestration-overview
active-owners:
  - loom-ralph-orchestration-overview
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
  - bounded-loops
  - orchestration
  - ralph
outputs: []
upstream-path: null
---

# Ralph orchestration in Loom

Ralph is Pi Loom's bounded managed-loop layer. It orchestrates over plans, tickets, critique, docs, and related Loom context without replacing those layers as the canonical source of truth.

## What Ralph owns

Ralph owns ticket-bound run state, iteration packets, runtime artifacts, continuation decisions, steering, and stop/pause behavior.

## What Ralph does not replace

- Plans remain the execution-strategy layer.
- Tickets remain the live execution ledger.
- Critique remains the durable review layer.
- Docs remain the post-completion explanatory layer.

## Execution model

`ralph_run` creates or resumes the system-owned run for one exact ticket binding, optionally under a governing plan. Each iteration is bounded and expected to keep the bound ticket truthful before exit.

## Operational boundary

Ralph is intentionally narrower than a general workflow engine. It is the bounded orchestration primitive for Loom's long-horizon execution loops, not a replacement for broader control-plane layers.
