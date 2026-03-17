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
---

## Task Graph
- task-001: Update policy and extract storage contract
  Summary: Rewrite constitutional and README policy so canonical DB state and projection/doc carve-outs are explicit, then define the backend-agnostic storage contract for entities, links, events, projections, projects, repositories, and worktrees.
  Requirements: req-002, req-003, req-004, req-005, req-007, req-008
  Capabilities: cap-storage-contract, cap-storage-topology
  Acceptance: Constitution/README are truthful about DB-canonical operational state, repo-native docs, and projection surfaces.; Representative package stores can target the contract instead of filesystem traversal APIs.
- task-002: Introduce global IDs and ownership metadata
  Summary: Add stable global IDs, ownership/project metadata, and version semantics to all durable entity types while preserving human-friendly local refs as aliases or projections.
  Requirements: req-001, req-002, req-003, req-010
  Capabilities: cap-sqlite-backend, cap-storage-topology
  Dependencies: task-001
  Acceptance: Cross-repo entities no longer rely on path-derived or per-repo sequence IDs.; Existing refs can still be rendered or mapped without ambiguity.
- task-003: Implement SQLite backend and deterministic projections
  Summary: Build the SQLite adapter behind the storage contract, import current file-backed state, and generate deterministic projections during the cutover period.
  Requirements: req-009, req-011, req-012, req-013, req-014, req-015, req-016
  Capabilities: cap-projections-and-docs, cap-sqlite-backend
  Dependencies: task-001, task-002
  Acceptance: A migrated repo can round-trip current state into SQLite without losing links or path portability.; Canonical writes land in SQLite and projected artifacts can still be generated for affected layers.
- task-004: Design reserved-branch export and hydration
  Summary: Define and implement deterministic sync exports, content-addressed artifact manifests, hydration/import flows, and explicit conflict handling for SQLite users.
  Requirements: req-017, req-018, req-019, req-020
  Capabilities: cap-projections-and-docs, cap-sync-hydration
  Dependencies: task-002, task-003
  Acceptance: A fresh machine can hydrate from the reserved branch and reproduce the same logical graph.; Two non-conflicting sync exports can merge cleanly in git and import successfully.
- task-005: Separate durable worker history from local runtime state
  Summary: Define and implement the boundary between canonical shared worker history and clone-local worktree/runtime control-plane state, including leases and heartbeats for any canonical worker liveness state.
  Requirements: req-021, req-022, req-023, req-024
  Capabilities: cap-worker-runtime-carveout
  Dependencies: task-001, task-003
  Acceptance: Canonical worker history remains portable across clones without machine-local pollution.; Worker crash recovery can distinguish stale local runtime from durable shared history.
- task-006: Validate backend portability and prepare PostgreSQL path
  Summary: Build backend-contract tests and backend-neutral semantics so PostgreSQL can later replace or complement SQLite without redesigning domain behavior.
  Requirements: req-006, req-025, req-026, req-027, req-028
  Capabilities: cap-postgres-portability, cap-storage-contract
  Dependencies: task-001, task-003, task-004
  Acceptance: A backend-neutral test suite exists for core storage semantics.; The architecture docs and spec do not assume network-shared SQLite as a supported deployment.

## Traceability
- task-001 -> req-002, req-003, req-004, req-005, req-007, req-008
- task-002 -> req-001, req-002, req-003, req-010
- task-003 -> req-009, req-011, req-012, req-013, req-014, req-015, req-016
- task-004 -> req-017, req-018, req-019, req-020
- task-005 -> req-021, req-022, req-023, req-024
- task-006 -> req-006, req-025, req-026, req-027, req-028
