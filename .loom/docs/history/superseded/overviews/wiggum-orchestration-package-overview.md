---
id: wiggum-orchestration-package-overview
title: "Wiggum orchestration package overview"
status: superseded
type: overview
section: overviews
topic-id: wiggum-orchestration-package
topic-role: owner
publication-status: historical-superseded
publication-summary: "Historical superseded record retired from active publication: Pi Loom no longer ships a separate Wiggum orchestration package. Current orchestration truth lives in the top-level Ralph package and its governed docs, so this package-specific record remains historical only."
recommended-action: follow-successor-or-retirement
current-owner: null
active-owners: []
audience:
  - ai
  - human
source: workspace:pi-loom
verified-at: 2026-03-27T09:30:00.000Z
verification-source: ticket:pl-0129
successor: null
successor-title: null
predecessors: []
retirement-reason: "Pi Loom no longer ships a separate Wiggum orchestration package. Current orchestration truth lives in the top-level Ralph package and its governed docs, so this package-specific record remains historical only."
topics:
  - historical
  - ralph-wiggum
outputs: []
upstream-path: null
---

# Wiggum orchestration package overview

## Current package surface

`pi-ralph-wiggum` is the only shipped Wiggum orchestration package in this workspace.

`pi-chief-wiggum` was removed on 2026-03-21 so the repository stops carrying a manager-first control plane that the project intends to redesign from scratch later. The current shipped stack therefore exposes Ralph directly rather than routing execution through a manager package.

## Ralph Wiggum

`pi-ralph-wiggum` remains the bounded orchestration primitive. It owns durable Ralph runs, iteration records, runtime artifacts, policy-driven continuation decisions, and the async job substrate used for bounded loop execution.

The important boundary remains unchanged: Ralph Wiggum is not a generic workflow engine. It orchestrates bounded fresh-context iterations over plans, tickets, critique, docs, and related Loom artifacts.

## Async-job-backed iteration triggering

Ralph's async job substrate remains the execution trigger for bounded iterations.

That means:

- long-running Ralph runs can be started, inspected, awaited, and cancelled without losing durable run truth
- duplicate launch requests can still be coalesced against running async jobs
- durable Ralph records remain the communication substrate between iterations instead of a hidden in-memory transcript protocol

The async job layer is the execution trigger. Durable Ralph records remain the truth.

## Future execution-control-plane work

The removal of `pi-chief-wiggum` is a reset, not a promise that orchestration above Ralph is solved elsewhere.

If Pi Loom adds a future workspace-backed manager/worker control plane, it should be introduced as a fresh design with truthful boundaries instead of incrementally preserving the removed package's API or runtime model. Until then, tickets remain the live execution ledger, Ralph remains the only shipped orchestration package, and any broader control-plane work is deferred.
