---
id: cap-storage-contract
title: "Backend-agnostic canonical storage contract"
change: sqlite-first-canonical-storage-substrate
updated-at: 2026-03-17T00:40:26.902Z
source-changes:
  - sqlite-first-canonical-storage-substrate
---

## Summary
All Loom layers read and write through a storage contract that models entities, links, events, projections, and path scopes without hard-coding file-backed assumptions or SQLite-only semantics.

## Requirements
- Packages stop reopening neighboring `.loom` files directly to discover state.
- SQLite-specific features may be used as accelerators only if the logical contract remains satisfiable by PostgreSQL later.
- The contract can express constitution, research, initiative, spec, plan, ticket, critique, Ralph, durable worker history, docs indexes, and cross-layer links.
- The contract defines optimistic versioning, ownership, and query semantics independently of SQLite implementation details.

## Scenarios
- A plan query can fetch linked tickets, critiques, and roadmap refs without reopening markdown or JSON files from other packages.
- A PostgreSQL adapter can satisfy the same domain tests used by the SQLite adapter.
