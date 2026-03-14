---
id: workspace-lifecycle-and-runtime-attachments
title: "Workspace lifecycle and runtime attachments"
change: add-workspace-backed-manager-worker-substrate
updated-at: 2026-03-16T00:03:16.511Z
source-changes:
  - add-workspace-backed-manager-worker-substrate
---

## Summary
Model provisioning, attaching, resuming, and retiring ephemeral workspaces truthfully while preferring Git worktrees as the v1 isolation mechanism.

## Requirements
- The workspace descriptor SHALL record intended repository root, base ref, branch strategy, and workspace strategy, with `git-worktree` treated as the required v1 backing strategy and future strategies remaining additive.
- V1 runtime launches SHALL prefer explicit subprocess-backed Pi sessions with cwd set to the workspace attachment rather than mutating the current session cwd or relying on session fork/tree semantics as a surrogate for workspace isolation.
- Worker lifecycle SHALL include explicit workspace-oriented states such as requested, provisioning, ready, active, blocked, waiting_for_review, completion_requested, approved_for_consolidation, completed, retired, and failed rather than inferring lifecycle from prose.

## Scenarios
- A headless manager process launches a worker Pi instance in a worktree while preserving portable committed state.
- A manager allocates several workers before all worktrees are provisioned and later attaches them as resources become available.
- A worker workspace is reprovisioned after local cleanup without changing the worker's durable identity.
