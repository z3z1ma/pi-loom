---
id: sqlite-first-canonical-storage-substrate
title: "SQLite-first canonical storage substrate"
status: finalized
created-at: 2026-03-16T17:12:54.867Z
updated-at: 2026-03-17T00:40:26.902Z
research:
  - sqlite-first-storage-substrate-and-sync-architecture
initiatives:
  - loom-storage-substrate-migration
capabilities:
  - cap-storage-topology
  - cap-storage-contract
  - cap-sqlite-backend
  - cap-projections-and-docs
  - cap-sync-hydration
  - cap-worker-runtime-carveout
  - cap-postgres-portability
---

## Design Notes
The current file-backed stores derive identity from `<cwd>/.loom/...` and reopen neighboring package files directly. The new design must break that assumption. Canonical operational graph state should live behind a backend-agnostic storage contract implemented by SQLite first. Repo-native documentation should remain file-authoritative. Binary or copied artifacts should be content-addressed files referenced by the DB. Worker runtime/worktree control-plane state remains clone-local; only durable worker history may move to shared storage once leases/heartbeats exist. The sync branch is a projection surface carrying deterministic entity snapshots and/or append-only event bundles plus artifact manifests. Raw SQLite files, WAL files, and binary session changesets are not the merge unit.

## Capability Map
- cap-storage-topology: Shared catalog topology and global identity
- cap-storage-contract: Backend-agnostic canonical storage contract
- cap-sqlite-backend: SQLite-first local backend and migration mode
- cap-projections-and-docs: Repo-native docs and deterministic projection surfaces
- cap-sync-hydration: Reserved-branch sync and hydration for SQLite users
- cap-worker-runtime-carveout: Execution-local runtime carve-out and durable worker history boundary
- cap-postgres-portability: PostgreSQL portability without semantic drift

## Requirements
- req-001: Every durable entity has a stable app-generated global ID; human-friendly refs remain secondary aliases or projections.
  Acceptance: A single space can own work across two repositories without ID collisions or path-derived composite keys.; Existing repo-local refs such as `pl-0042` can still be rendered for humans without acting as the canonical key.; Two worktrees of the same repository attach to one logical repository/project record without duplicating tickets or plans.
  Capabilities: cap-storage-topology
- req-002: Logical coordination containers are modeled explicitly so tickets, plans, initiatives, and provenance can span repositories.
  Acceptance: A single space can own work across two repositories without ID collisions or path-derived composite keys.; Existing repo-local refs such as `pl-0042` can still be rendered for humans without acting as the canonical key.; Two worktrees of the same repository attach to one logical repository/project record without duplicating tickets or plans.
  Capabilities: cap-storage-topology
- req-003: Repo-relative paths remain data attributes and scopes, not primary identity.
  Acceptance: A single space can own work across two repositories without ID collisions or path-derived composite keys.; Existing repo-local refs such as `pl-0042` can still be rendered for humans without acting as the canonical key.; Two worktrees of the same repository attach to one logical repository/project record without duplicating tickets or plans.
  Capabilities: cap-storage-topology
- req-004: The default canonical store is one user-level Loom catalog rather than one database per repository.
  Acceptance: A single space can own work across two repositories without ID collisions or path-derived composite keys.; Existing repo-local refs such as `pl-0042` can still be rendered for humans without acting as the canonical key.; Two worktrees of the same repository attach to one logical repository/project record without duplicating tickets or plans.
  Capabilities: cap-storage-topology
- req-005: Packages stop reopening neighboring `.loom` files directly to discover state.
  Acceptance: A PostgreSQL backend can be designed later without changing the contract's logical semantics.; Representative package stores can be rewritten against the contract without needing direct path traversal to neighboring packages.; The contract supports append-only event history and current-state queries for the same entity.
  Capabilities: cap-storage-contract
- req-006: SQLite-specific features may be used as accelerators only if the logical contract remains satisfiable by PostgreSQL later.
  Acceptance: A PostgreSQL backend can be designed later without changing the contract's logical semantics.; Representative package stores can be rewritten against the contract without needing direct path traversal to neighboring packages.; The contract supports append-only event history and current-state queries for the same entity.
  Capabilities: cap-storage-contract
- req-007: The contract can express constitution, research, initiative, spec, plan, ticket, critique, Ralph, durable worker history, docs indexes, and cross-layer links.
  Acceptance: A PostgreSQL backend can be designed later without changing the contract's logical semantics.; Representative package stores can be rewritten against the contract without needing direct path traversal to neighboring packages.; The contract supports append-only event history and current-state queries for the same entity.
  Capabilities: cap-storage-contract
- req-008: The contract defines optimistic versioning, ownership, and query semantics independently of SQLite implementation details.
  Acceptance: A PostgreSQL backend can be designed later without changing the contract's logical semantics.; Representative package stores can be rewritten against the contract without needing direct path traversal to neighboring packages.; The contract supports append-only event history and current-state queries for the same entity.
  Capabilities: cap-storage-contract
- req-009: A transitional phase can dual-write canonical DB state and generated repo projections until file-backed reads are removed.
  Acceptance: A user can clone a repo in a new location and still attach it to the same logical catalog/project records.; Canonical writes occur in SQLite while projected artifacts can still be regenerated for review during migration.; No durable record leaks clone-local absolute paths into canonical storage or projections.
  Capabilities: cap-sqlite-backend
- req-010: Migration introduces stable IDs and ownership metadata before full canonical cutover.
  Acceptance: A user can clone a repo in a new location and still attach it to the same logical catalog/project records.; Canonical writes occur in SQLite while projected artifacts can still be regenerated for review during migration.; No durable record leaks clone-local absolute paths into canonical storage or projections.
  Capabilities: cap-sqlite-backend
- req-011: SQLite operation is same-host only; the design does not assume network-shared SQLite.
  Acceptance: A user can clone a repo in a new location and still attach it to the same logical catalog/project records.; Canonical writes occur in SQLite while projected artifacts can still be regenerated for review during migration.; No durable record leaks clone-local absolute paths into canonical storage or projections.
  Capabilities: cap-sqlite-backend
- req-012: The default local database path is user-level and independent of repo checkout location.
  Acceptance: A user can clone a repo in a new location and still attach it to the same logical catalog/project records.; Canonical writes occur in SQLite while projected artifacts can still be regenerated for review during migration.; No durable record leaks clone-local absolute paths into canonical storage or projections.
  Capabilities: cap-sqlite-backend
- req-013: Artifact payloads that are binary or large remain file-based and content-addressed, with DB references to their metadata.
  Acceptance: A documentation update still lands as a repo file change after canonical state migration.; A projected plan packet regenerated twice from the same canonical state is byte-stable aside from explicitly allowed timestamps/version fields.; Artifact references survive hydration/export without embedding clone-local absolute paths.
  Capabilities: cap-projections-and-docs
- req-014: Docs content (`doc.md` and related human-facing docs) remains repo-authoritative and reviewable in git.
  Acceptance: A documentation update still lands as a repo file change after canonical state migration.; A projected plan packet regenerated twice from the same canonical state is byte-stable aside from explicitly allowed timestamps/version fields.; Artifact references survive hydration/export without embedding clone-local absolute paths.
  Capabilities: cap-projections-and-docs
- req-015: Plans, tickets, checkpoints, packets, dashboards, and similar review surfaces may remain materialized as deterministic projections when valuable.
  Acceptance: A documentation update still lands as a repo file change after canonical state migration.; A projected plan packet regenerated twice from the same canonical state is byte-stable aside from explicitly allowed timestamps/version fields.; Artifact references survive hydration/export without embedding clone-local absolute paths.
  Capabilities: cap-projections-and-docs
- req-016: Projected artifacts stay repo-relative and portable and can be regenerated idempotently from canonical state.
  Acceptance: A documentation update still lands as a repo file change after canonical state migration.; A projected plan packet regenerated twice from the same canonical state is byte-stable aside from explicitly allowed timestamps/version fields.; Artifact references survive hydration/export without embedding clone-local absolute paths.
  Capabilities: cap-projections-and-docs
- req-017: Each exported entity carries stable IDs, ownership/project metadata, versions, and link data needed for idempotent import.
  Acceptance: A fresh machine can import the reserved branch and rebuild the same logical graph with stable IDs intact.; Conflicting edits on the same entity are detected and reported instead of silently last-write-wins.; Two developers can merge non-conflicting entity exports on the reserved branch and hydrate successfully.
  Capabilities: cap-sync-hydration
- req-018: Hydration can reconstruct a local database from an empty state using the reserved branch plus repo-native docs/artifacts.
  Acceptance: A fresh machine can import the reserved branch and rebuild the same logical graph with stable IDs intact.; Conflicting edits on the same entity are detected and reported instead of silently last-write-wins.; Two developers can merge non-conflicting entity exports on the reserved branch and hydrate successfully.
  Capabilities: cap-sync-hydration
- req-019: Import detects conflicting concurrent edits to the same entity/version and surfaces them explicitly.
  Acceptance: A fresh machine can import the reserved branch and rebuild the same logical graph with stable IDs intact.; Conflicting edits on the same entity are detected and reported instead of silently last-write-wins.; Two developers can merge non-conflicting entity exports on the reserved branch and hydrate successfully.
  Capabilities: cap-sync-hydration
- req-020: Sync exports are deterministic text/entity bundles or event bundles, not raw SQLite database files.
  Acceptance: A fresh machine can import the reserved branch and rebuild the same logical graph with stable IDs intact.; Conflicting edits on the same entity are detected and reported instead of silently last-write-wins.; Two developers can merge non-conflicting entity exports on the reserved branch and hydrate successfully.
  Capabilities: cap-sync-hydration
- req-021: Durable worker messages, checkpoints, approvals, and completion history may move into canonical storage only if lease/heartbeat semantics prevent stale running state.
  Acceptance: A crashed worker cannot leave a permanent shared `running` state with no expiry or recovery path.; A second clone can inspect durable worker history without inheriting another machine's runtime attachment details.; Worker projections/summaries can be regenerated from canonical history without exposing clone-local internals.
  Capabilities: cap-worker-runtime-carveout
- req-022: Sync exports exclude clone-local runtime attachments and process metadata.
  Acceptance: A crashed worker cannot leave a permanent shared `running` state with no expiry or recovery path.; A second clone can inspect durable worker history without inheriting another machine's runtime attachment details.; Worker projections/summaries can be regenerated from canonical history without exposing clone-local internals.
  Capabilities: cap-worker-runtime-carveout
- req-023: Worker histories in canonical storage distinguish durable shared facts from machine-local execution details.
  Acceptance: A crashed worker cannot leave a permanent shared `running` state with no expiry or recovery path.; A second clone can inspect durable worker history without inheriting another machine's runtime attachment details.; Worker projections/summaries can be regenerated from canonical history without exposing clone-local internals.
  Capabilities: cap-worker-runtime-carveout
- req-024: Worktree paths, PIDs, transient launch descriptors, local runtime attachments, and similar clone-specific state remain local-only.
  Acceptance: A crashed worker cannot leave a permanent shared `running` state with no expiry or recovery path.; A second clone can inspect durable worker history without inheriting another machine's runtime attachment details.; Worker projections/summaries can be regenerated from canonical history without exposing clone-local internals.
  Capabilities: cap-worker-runtime-carveout
- req-025: Backend contract tests cover identity, links, events, optimistic versioning, and projection determinism.
  Acceptance: A future PostgreSQL adapter can satisfy the same storage-contract test suite as SQLite.; Disabling SQLite-specific accelerators does not change logical results.; The architecture does not assume network-shared SQLite as a supported deployment.
  Capabilities: cap-postgres-portability
- req-026: Operational guidance explicitly treats PostgreSQL as the path for multi-machine shared canonical state.
  Acceptance: A future PostgreSQL adapter can satisfy the same storage-contract test suite as SQLite.; Disabling SQLite-specific accelerators does not change logical results.; The architecture does not assume network-shared SQLite as a supported deployment.
  Capabilities: cap-postgres-portability
- req-027: SQLite-only features such as WAL tuning, session changesets, or FTS are optional and never required for logical correctness.
  Acceptance: A future PostgreSQL adapter can satisfy the same storage-contract test suite as SQLite.; Disabling SQLite-specific accelerators does not change logical results.; The architecture does not assume network-shared SQLite as a supported deployment.
  Capabilities: cap-postgres-portability
- req-028: Sync/export semantics remain backend-independent.
  Acceptance: A future PostgreSQL adapter can satisfy the same storage-contract test suite as SQLite.; Disabling SQLite-specific accelerators does not change logical results.; The architecture does not assume network-shared SQLite as a supported deployment.
  Capabilities: cap-postgres-portability
