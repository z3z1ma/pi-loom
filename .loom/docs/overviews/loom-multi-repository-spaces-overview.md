---
id: loom-multi-repository-spaces-overview
title: "Loom multi-repository spaces overview"
status: active
type: overview
section: overviews
topic-id: loom-multi-repository-spaces
topic-role: owner
publication-status: current-owner
publication-summary: "Current canonical overview for governed topic loom-multi-repository-spaces."
recommended-action: update-current-owner
current-owner: loom-multi-repository-spaces-overview
active-owners:
  - loom-multi-repository-spaces-overview
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
  - repositories
  - scope
  - workspaces
outputs: []
upstream-path: null
---

# Loom multi-repository spaces overview

Pi Loom supports a first-class multi-repository operating model where one Loom space can enroll multiple repositories and multiple local worktrees for the same repository. The space, not the current working directory, is the coordination boundary.

## Core concepts

### Space
A Loom space is the canonical coordination boundary. It stores the durable SQLite-backed catalog and groups the repositories that participate in the same operational context.

### Repository
A repository is a canonically enrolled member of the space. Repository-owned records keep their repository identity even when the current session starts from a parent directory instead of the repository root.

### Worktree
A worktree is one local checkout of a repository. Runtime work such as file edits, tests, Ralph launches, and docs maintenance happens in a worktree, but canonical state remains in the shared catalog.

## Scope selection and targeting

Pi Loom no longer assumes that one session maps to one repository inferred from `cwd`.

- `scope_read` reports the discovered space, enrolled repositories, the active repository/worktree binding, and diagnostics.
- `scope_write` is the explicit path for selecting, revoking, enrolling, or unenrolling repository scope.
- Broad reads can operate at space scope.
- Repository-bound writes and path-bearing operations must either run under an unambiguous active repository selection or provide explicit repository targeting.

## Portable paths and runtime launches

Repository-qualified paths keep artifacts truthful in ambiguous sessions. Runtime launches for Ralph, docs, and critique propagate explicit space/repository/worktree scope into the child process instead of guessing from the child `cwd`.

## Degraded mode

A repository may remain canonically enrolled even when no local worktree is currently available. Space-level reads still work, while repository-bound writes and runtime launches fail closed instead of silently hopping to a different repository.
