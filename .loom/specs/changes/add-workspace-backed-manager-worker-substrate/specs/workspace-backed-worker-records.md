---
id: workspace-backed-worker-records
title: "Workspace-backed worker records"
change: add-workspace-backed-manager-worker-substrate
updated-at: 2026-03-16T00:03:16.511Z
source-changes:
  - add-workspace-backed-manager-worker-substrate
---

## Summary
Persist workers as durable execution anchors whose state truthfully represents a workspace-backed execution unit rather than a transcript branch or generic subprocess.

## Requirements
- Canonical worker state SHALL preserve only portable metadata and logical workspace descriptors; clone-local absolute paths, process ids, and machine-specific workspace attachments SHALL remain runtime-only and excluded from committed canonical state.
- Each worker SHALL have a stable worker id plus persisted objective, attached ticket ids, optional linked plan/spec/research/initiative/critique/ralph refs, source manager reference, and consolidation target metadata.
- The system SHALL create one durable worker record under `.loom/workers/<worker-id>/` with canonical state, markdown summary, append-only messages and checkpoints, dashboard state, and a runtime-only launch descriptor.

## Scenarios
- A manager creates a worker for a ticket-backed implementation slice and later inspects it from another machine clone.
- A reviewer audits a committed worker record and can understand the work assignment without access to the original machine-local worktree path.
- A worker runtime crashes and a new manager session resumes supervision from durable worker state.
