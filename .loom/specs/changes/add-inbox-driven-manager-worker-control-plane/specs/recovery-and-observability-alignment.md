---
id: recovery-and-observability-alignment
title: "Recovery and observability alignment"
change: add-inbox-driven-manager-worker-control-plane
updated-at: 2026-03-16T02:39:16.175Z
source-changes:
  - add-inbox-driven-manager-worker-control-plane
---

## Summary
Extend worker dashboards, packets, and recovery semantics so the more interactive control plane remains understandable and restart-safe.

## Requirements
- Recovery flows SHALL reconstruct worker truth across runtime kinds from durable records plus runtime descriptors without depending on hidden in-memory scheduler or session state.
- The package SHALL preserve portable canonical worker state even as richer runtime details are added, keeping machine-local runtime specifics out of committed canonical artifacts.
- Worker dashboards and packets SHALL expose unresolved inbox counts, acknowledgment lag, active runtime kind, scheduler visibility, and review backlog in addition to existing telemetry and checkpoint summaries.

## Scenarios
- A manager process restarts and immediately rebuilds a usable picture of which workers have pending inbox work and which runtime kind was active last.
- An operator can distinguish a worker that is blocked on inbox backlog from one that is merely idle with no pending work.
