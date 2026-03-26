---
id: worktree-branch-family-workflow
title: "Worktree branch-family workflow"
status: active
type: guide
section: guides
audience:
  - ai
  - human
source: workspace:pi-loom
topics:
  - branch-families
  - ralph
  - worktree-branches
outputs:
  - https-github-com-z3z1ma-pi-loom-git:README.md
  - https-github-com-z3z1ma-pi-loom-git:ralph/README.md
  - https-github-com-z3z1ma-pi-loom-git:ticketing/README.md
upstream-path: null
---

# Worktree branch-family workflow

## Why this exists

Pi Loom no longer treats local git state as authoritative branch lineage. Worktree-backed execution used to derive branch names from the ticket ref or the alphabetically first external ref and then add a suffix only when a matching local branch already existed. That broke as soon as earlier follow-up work had already been merged and deleted locally.

The shipped model moves branch truth into durable state:

- execution tickets describe branch intent
- canonical storage allocates exact branch names per repository and branch family
- Ralph and sibling worktree-backed runtimes consume that durable contract instead of inferring from git history

## Ticket-owned branch intent

Execution tickets can now express branch intent explicitly:

- `branch-mode: none` — no special override is declared; worktree-backed runtimes fall back to a default ticket-scoped family
- `branch-mode: allocator` — the ticket must also carry `branch-family`, and runtimes allocate the next exact branch name canonically for that repository and family
- `branch-mode: exact` — the ticket must also carry `exact-branch-name`, and runtimes reuse that exact branch directly

`external-refs` still exist for traceability, but they are not branch truth.

## Canonical reservation behavior

Canonical reservations are repository-scoped. That means:

- repository A, family `UDP-100` can allocate `UDP-100`
- a later follow-up ticket in repository A and the same family can allocate `UDP-100-1`, even if `UDP-100` was already merged and deleted locally
- repository B can still allocate its own first `UDP-100`

This model solves the real follow-up workflow where the same delivery family spans multiple Loom tickets over time.

## Ralph behavior

Ralph keeps its existing bound-run idempotence:

- when a new worktree-backed Ralph run is first created, it resolves one exact branch name from ticket intent plus canonical reservations
- that exact branch name is stored in the run's `executionEnv`
- reruns of the same bound Ralph run keep reusing the stored branch and worktree instead of reallocating

Exact ticket overrides are honored as-is. Ralph does not silently replace them with allocator output.

## Critique and docs behavior

Critique and docs worktree-backed runtimes now use the same shared managed branch resolver as Ralph. They no longer grow an independent naming policy from external refs or local branch scans. If they need a fresh worktree branch, they resolve it through the same durable branch-intent and reservation contract.

## What the system no longer does

Pi Loom no longer treats any of the following as canonical branch lineage truth:

- the alphabetically first external ref
- whichever matching branch happens to exist locally
- git merge history guessed by the model

If branch lineage matters, put it on the ticket or let the canonical reservation history record it.

## Operator examples

### Follow-up ticket after merge

1. Ticket A in repository A declares `branch-mode: allocator` and `branch-family: UDP-100`
2. Ralph creates a worktree-backed run and allocates `UDP-100`
3. The work is merged and the local branch may later disappear
4. Ticket B in the same repository and branch family later starts
5. The allocator returns `UDP-100-1` from canonical reservation history alone

### Exact branch override

1. Ticket C declares `branch-mode: exact` and `exact-branch-name: release/manual-hotfix`
2. Ralph, critique, and docs all reuse `release/manual-hotfix` directly when they launch for that ticket
3. No subsystem allocates a different family suffix behind the operator's back

## Verification signals

The shipped behavior is verified by focused tests covering:

- canonical per-repository branch-family allocation
- ticket create/read/update validation for branch intent
- Ralph follow-up allocation, rerun reuse, and retry-after-provision-failure reuse
- critique/docs runtime launches using the shared branch resolver rather than external-ref ordering
- cleanup removing external-ref branch heuristics from code and tests
