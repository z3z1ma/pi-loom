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
verified-at: 2026-03-27T23:25:30.000Z
verification-source: manual:docs-zero-drift-review-2026-03-27
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

Worktree-backed Ralph execution treats branch selection as durable execution state instead of a local Git guess. The bound ticket declares branch intent, canonical storage reserves exact names when allocation is needed, and the Ralph run records the chosen worktree so later iterations continue on the same substrate.

## When this workflow matters

Use this workflow whenever a Ralph run executes in `worktree` mode or when a ticket needs stable branch lineage across retries, follow-up tickets, or repositories that happen to share the same family name.

## Start with ticket-owned branch intent

The ticket is the only canonical place that tells Ralph how to choose a branch:

- `branch-mode: none` means no special lineage was declared. Ralph falls back to a default ticket-scoped family (`ralph/<ticket-id>`) instead of inventing lineage from external refs or the current branch.
- `branch-mode: allocator` means the ticket also carries `branch-family`. Ralph asks canonical storage for the next exact branch in that repository and family.
- `branch-mode: exact` means the ticket carries `exact-branch-name`. Ralph reuses that branch name directly.

`external-refs` can still point at incidents, upstream issues, or historical branches, but they are traceability only. They do not drive branch selection.

## Allocation is canonical and repository-scoped

Allocator-backed tickets do not inspect the current clone for an available branch name. Ralph records reservations in canonical storage per repository and branch family.

That preserves two important truths:

- repository A can allocate `UDP-100`, then `UDP-100-1`, even if the original `UDP-100` branch was merged and deleted locally
- repository B can still allocate its own first `UDP-100`, because reservations are repository-scoped rather than global across the entire Loom space

A later ticket in the same family gets the next suffix. The same Ralph run does not.

## Ralph provisions a local worktree from that exact branch

After Ralph resolves the exact branch name, it provisions a sibling Git worktree beneath `.ralph-worktrees/` in the repository root. The directory name is a sanitized form of the exact branch name, and if that branch is already checked out in an existing Ralph worktree, Ralph reuses the existing path instead of creating another one.

The worktree is local runtime substrate, not shared canonical state. What becomes durable is the Ralph run's recorded execution environment: branch name, worktree root, repository root, and the original ledger root.

That split matters because the code changes live in the child worktree, while Loom state still writes back to the original repository ledger through `PI_LOOM_ROOT`. Operators get isolated Git state without drifting ticket, plan, or documentation updates into a separate ledger.

## Reruns reuse the same branch and worktree

Once a bound Ralph run has stored its `executionEnv`, later iterations of that same run keep launching from the same worktree and branch. Ralph does not re-run allocation on every iteration.

This makes worktree mode idempotent in the way operators actually need:

- retries do not silently hop to a new branch
- critique and revision loops keep accumulating changes in the same worktree
- a provisioning failure after reservation reuse can retry the same reserved branch instead of consuming another family suffix

A new Ralph run for a different ticket is different work. That new run may allocate the next branch in the family.

## What is durable and what is local

Durable truth lives in:

- ticket branch intent (`branch-mode`, `branch-family`, `exact-branch-name`)
- canonical branch reservation history for allocator-backed runs
- Ralph run execution metadata describing the chosen worktree environment

Local clone truth lives in:

- the filesystem contents of `.ralph-worktrees/`
- whether an old branch still exists in this clone
- any temporary Git state inside the child worktree

If readers need to understand lineage, they should inspect the ticket and the canonical run state, not guess from whichever branches happen to be visible in one clone.

## Practical operator expectations

When the workflow is working correctly:

- the ticket tells you why Ralph chose a branch
- the first allocator-backed run reserves the family root and later tickets advance the suffix
- reruns of the same bound Ralph run stay on the same worktree
- deleting a merged local branch does not erase the durable family history
- switching repositories does not consume another repository's family sequence

This guide complements the topic owner `worktree-branch-family-execution`: the owner overview explains the contract, while this companion explains how that contract behaves during real Ralph worktree runs.
