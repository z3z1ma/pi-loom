---
id: cap-worker-runtime-carveout
title: "Execution-local runtime carve-out and durable worker history boundary"
change: sqlite-first-canonical-storage-substrate
updated-at: 2026-03-17T00:40:26.902Z
source-changes:
  - sqlite-first-canonical-storage-substrate
---

## Summary
Clone-local worker runtime/worktree control-plane data stays local, while shared durable worker history moves only as far as the canonical contract can support truthfully.

## Requirements
- Durable worker messages, checkpoints, approvals, and completion history may move into canonical storage only if lease/heartbeat semantics prevent stale running state.
- Sync exports exclude clone-local runtime attachments and process metadata.
- Worker histories in canonical storage distinguish durable shared facts from machine-local execution details.
- Worktree paths, PIDs, transient launch descriptors, local runtime attachments, and similar clone-specific state remain local-only.

## Scenarios
- A second developer reads worker checkpoints and approvals without seeing the first developer's local PID or worktree path.
- A worker dies mid-run and a manager session can recover based on expired leases and durable history.
