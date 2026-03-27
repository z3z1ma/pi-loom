---
id: worktree-branch-family-execution
title: "Worktree branch-family execution"
status: active
type: overview
section: overviews
topic-id: worktree-branch-family-workflow
topic-role: owner
publication-status: current-owner
publication-summary: "Current canonical overview for governed topic worktree-branch-family-workflow."
recommended-action: update-current-owner
current-owner: worktree-branch-family-execution
active-owners:
  - worktree-branch-family-execution
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
  - branch-families
  - execution
  - worktrees
outputs: []
upstream-path: null
---

# Worktree branch-family execution

Worktree-backed execution uses durable branch-family intent instead of inferring lineage from local git state.

## Ticket-owned branch intent

Execution tickets declare whether they use an exact branch name, a repository-scoped branch-family allocator, or no special branch intent. Ralph reads that ticket state instead of guessing from the current branch.

## Canonical allocation

Branch reservations are scoped per repository and branch family. One repository can advance from `UDP-100` to `UDP-100-1` without affecting another repository's first `UDP-100`.

## Rerun idempotence

Once a Ralph run has selected and stored its branch/worktree in canonical execution state, reruns reuse that same branch and worktree instead of reallocating on every iteration.
