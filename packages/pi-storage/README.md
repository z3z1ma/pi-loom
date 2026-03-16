# @pi-loom/pi-storage

Internal shared storage-contract package for Pi Loom.

This package is not a Pi extension. It seeds the backend-agnostic abstractions needed for Pi Loom's SQLite-first migration without claiming that any database backend is implemented here yet.

## Scope

The initial contract covers the core shared-storage concepts that current file-backed stores bake into repo-local paths:

- spaces / projects
- repositories
- worktrees
- repo-relative path scopes
- durable entities
- cross-entity links
- append-only events
- repo-materialized projections
- clone-local runtime attachments
- backend-agnostic storage interfaces

## Intended use

Other packages should eventually depend on these abstractions instead of reopening neighboring `.loom/...` files directly. SQLite is the first intended canonical backend, but the contract is deliberately shaped so PostgreSQL can satisfy the same semantics later.

## Backend policy

- SQLite is the default local-machine canonical backend.
- Network-shared SQLite is not the intended multi-machine deployment model.
- PostgreSQL is the intended future path for shared canonical state across machines.
- SQLite-specific features may be used as accelerators, but logical correctness must remain backend-neutral.

## Important boundary

The contract separates canonical shared state from clone-local runtime state:

- canonical operational state belongs in a shared storage backend
- repo-materialized markdown bodies and review surfaces may remain in git when useful
- clone-local runtime/worktree attachments stay local and must not masquerade as canonical shared truth
