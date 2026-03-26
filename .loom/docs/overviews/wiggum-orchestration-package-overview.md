---
id: wiggum-orchestration-package-overview
title: "Wiggum orchestration package overview"
status: active
type: overview
section: overviews
audience:
  - ai
  - human
source: workspace:pi-loom
topics:
  - async-jobs
  - orchestration-reset
  - ralph-wiggum
outputs:
  - https-github-com-z3z1ma-pi-loom-git:packages/pi-ralph-wiggum/README.md
  - https-github-com-z3z1ma-pi-loom-git:README.md
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
