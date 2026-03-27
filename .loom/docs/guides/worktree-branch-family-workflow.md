---
id: worktree-branch-family-workflow
title: "Worktree branch-family workflow"
status: active
type: guide
section: guides
topic-id: worktree-branch-family-workflow
topic-role: companion
publication-status: current-companion
publication-summary: "Current companion doc beneath active topic owner worktree-branch-family-execution."
recommended-action: update-current-companion
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
  - workflow
  - worktrees
outputs: []
upstream-path: README.md
---

# Worktree branch-family workflow

The worktree branch-family workflow makes branch lineage explicit in ticket and canonical storage state instead of relying on local git heuristics.

## Branch intent sources

- `branch-mode: exact` reuses the stored exact branch name.
- `branch-mode: allocator` asks the canonical allocator for the next exact branch within the repository and family.
- `branch-mode: none` falls back to a default ticket-scoped family.

## Why the workflow exists

The workflow keeps follow-up tickets, reruns, and repository-local reservations truthful even when old local branches have already been deleted.

## Important operational guarantee

Once a Ralph run stores its chosen branch and worktree in execution state, reruns keep reusing that same branch and worktree.
