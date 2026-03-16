---
id: loom-storage-substrate-migration
title: "Loom storage substrate migration"
status: active
created-at: 2026-03-16T17:12:27.621Z
updated-at: 2026-03-16T17:28:05.832Z
owners:
  - "pi-loom maintainers"
tags:
  - migration
  - multi-repo
  - postgres
  - sqlite
  - storage
research:
  - sqlite-first-storage-substrate-and-sync-architecture
spec-changes:
  - sqlite-first-canonical-storage-substrate
tickets:
  - t-0044
  - t-0045
  - t-0046
  - t-0047
  - t-0048
  - t-0049
capabilities: []
roadmap-refs:
  - item-008
---

## Objective
Replace Pi Loom's file-backed canonical state with a shared local database substrate that supports cross-repo coordination, worktree-aware execution, deterministic repo projection, and future PostgreSQL backends.

## Outcomes
- Canonical Loom entity state lives in a shared local database instead of path-derived repo files.
- Cross-repo tickets, initiatives, plans, and provenance links are first-class and queryable.
- Repo-native projections and sync surfaces remain reviewable and hydratable for SQLite users.
- The storage contract is backend-agnostic enough to admit a later PostgreSQL adapter without redesigning domain semantics.

## Scope
- Constitution/research/initiative/spec/plan/ticket/critique/Ralph durable metadata and links
- Docs carve-out and artifact strategy
- Migration of current file-backed stores onto a shared storage contract
- Projection/export/import strategy for reserved sync branches
- Repository, project/space, and worktree identity modeling

## Non-Goals
- Immediate replacement of all runtime/worktree-local files
- Locking the design to SQLite-only primitives
- Network-shared SQLite across machines
- Skipping human-reviewable projections in favor of opaque binary databases

## Success Metrics
- A finalized storage spec can express single-repo, multi-worktree, and multi-repo coordination without path-derived identity hacks.
- A fresh machine can hydrate a local SQLite DB from a reserved sync branch and preserve stable IDs/links.
- A later PostgreSQL backend can satisfy the same storage contract with no domain-level semantic drift.
- Docs remain truthful and reviewable in-repo after canonical state migration.

## Status Summary
Strategic migration initiative is active with a finalized spec, an active migration plan, and six projected execution tickets covering policy/contract extraction, ID migration, SQLite backend cutover, sync export/import, worker-runtime carve-outs, and PostgreSQL readiness.

## Risks
- Constitutional mismatch if policy is not updated before implementation.
- Global ID and ownership migration complexity across all current Loom layers.
- Loss of reviewability if projections are removed instead of demoted from canonical truth.
- SQLite write contention or operational bugs if concurrency/version assumptions are under-specified.
- Worker runtime confusion if clone-local control-plane state is over-centralized.

## Linked Roadmap
- item-008 [now/active] Migrate Loom storage to a shared database substrate with repo projection sync — Replace per-repo file-backed canonical state with a local shared database substrate that supports cross-repo Loom coordination, repo/worktree-aware execution, deterministic repo projection, and future PostgreSQL backends.

## Milestones
- milestone-001:  [planned]

## Strategic Decisions
(none)
