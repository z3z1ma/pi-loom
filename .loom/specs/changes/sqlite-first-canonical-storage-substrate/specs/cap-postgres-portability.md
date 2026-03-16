---
id: cap-postgres-portability
title: "PostgreSQL portability without semantic drift"
change: sqlite-first-canonical-storage-substrate
updated-at: 2026-03-16T17:40:15.372Z
source-changes:
  - sqlite-first-canonical-storage-substrate
---

## Summary
The storage contract and migration plan preserve a clean path to a later PostgreSQL backend for multi-machine canonical storage.

## Requirements
- Backend contract tests cover identity, links, events, optimistic versioning, and projection determinism.
- Operational guidance explicitly treats PostgreSQL as the path for multi-machine shared canonical state.
- SQLite-only features such as WAL tuning, session changesets, or FTS are optional and never required for logical correctness.
- Sync/export semantics remain backend-independent.

## Scenarios
- A sync export generated from SQLite can be generated equivalently from PostgreSQL later.
- A team replaces the local SQLite backend with PostgreSQL while preserving entity IDs and projections.
