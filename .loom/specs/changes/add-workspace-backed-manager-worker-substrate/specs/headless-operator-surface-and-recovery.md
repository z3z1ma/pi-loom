---
id: headless-operator-surface-and-recovery
title: "Headless operator surface and recovery"
change: add-workspace-backed-manager-worker-substrate
updated-at: 2026-03-16T00:03:16.511Z
source-changes:
  - add-workspace-backed-manager-worker-substrate
---

## Summary
Expose a complete command/tool/runtime surface that works in headless environments and supports deterministic recovery from process interruption.

## Requirements
- All critical manager-worker flows SHALL be headless-safe and structured; interactive UI, widgets, or dashboards MAY assist operators but MUST NOT be required for correctness or recoverability.
- Recovery after interruption SHALL rehydrate from durable worker state, messages, checkpoints, and runtime descriptors rather than from a monolithic transcript or hidden in-memory state.
- The package SHALL expose `/worker` commands and `worker_*` tools for creating, reading, listing, messaging, checkpointing, approving, rejecting, launching, resuming, retiring, and inspecting workers without direct file editing.

## Scenarios
- A CI-like manager process runs headlessly, supervises workers, and resumes after restart from durable records.
- A fresh session reads the latest worker packet and continues supervision with no access to prior chat transcript state.
- An operator uses commands and tools to inspect a failed worker and retire it safely without opening the underlying files manually.
