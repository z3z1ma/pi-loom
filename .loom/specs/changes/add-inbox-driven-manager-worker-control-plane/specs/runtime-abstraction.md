---
id: runtime-abstraction
title: "Worker runtime abstraction"
change: add-inbox-driven-manager-worker-control-plane
updated-at: 2026-03-16T02:39:16.175Z
source-changes:
  - add-inbox-driven-manager-worker-control-plane
---

## Summary
Decouple worker domain semantics from the current subprocess-only execution path so multiple runtime implementations can satisfy the same worker contract.

## Requirements
- Runtime descriptors and durable worker state SHALL record which runtime kind executed the worker so debugging and recovery remain truthful.
- The runtime abstraction SHALL preserve the same worker contract across runtime kinds: durable inbox processing, checkpoints, telemetry, approval requests, and recovery semantics must not drift by runtime implementation.
- Worker execution SHALL be driven through a runtime abstraction that treats the current subprocess implementation as one runtime strategy rather than the architecture itself.

## Scenarios
- A worker launched via subprocess and a worker launched via SDK both produce the same durable message/checkpoint/approval semantics.
- An operator can tell from durable state which runtime hosted the last worker execution.
