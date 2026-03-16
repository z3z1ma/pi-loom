---
id: sqlite-first-storage-substrate-and-sync-architecture
title: "SQLite-first storage substrate and sync architecture"
status: synthesized
created-at: 2026-03-16T17:11:47.554Z
updated-at: 2026-03-16T17:16:12.691Z
initiatives:
  - loom-storage-substrate-migration
specs:
  - sqlite-first-canonical-storage-substrate
tickets: []
capabilities: []
artifacts: []
---

## Question
How should Pi Loom migrate from per-repo file-backed `.loom` artifacts to a shared SQLite-first substrate that still supports multi-repo coordination, worktrees, future PostgreSQL backends, and git-based sync/hydration?

## Objective
Produce a strategic architecture recommendation for canonical storage, identity, repo/worktree tenancy, sync/export format, and phased rollout before implementation begins.

## Status Summary
Synthesized architecture recommendation complete. The migration is viable, but only as a domain-model redesign with explicit global identity, spaces/projects, projections, and sync surfaces rather than as a storage swap under current path-derived assumptions.

## Scope
- Cross-repo entities spanning multiple repositories
- Docs carve-out and projection strategy
- Future PostgreSQL-compatible storage contract
- Git branch export/import for SQLite users
- Shared local SQLite database as default storage substrate
- Worktree-aware execution and worker/runtime carve-outs

## Non-Goals
- Designing a network-shared SQLite deployment
- Detailed SQL DDL for every table
- Immediate implementation tickets
- Replacing git-based code review with database-only workflows

## Methodology
- Inspect representative file-backed stores and path helpers
- Read constitutional brief and current repo architecture
- Review official SQLite documentation on WAL, backup, and session changesets
- Synthesize a backend-agnostic domain/storage model with rollout phases

## Keywords
- hydration
- multi-repo
- postgres
- projection
- sqlite
- storage
- sync
- worktree

## Hypotheses
(none)

## Conclusions
- A single user-level Loom database should be the default, not one database per repo, because tickets/plans/initiatives must be able to span repositories.
- Canonical identity must become globally unique and detached from repo paths or local slug sequences; human-friendly refs can remain as projections or aliases.
- Docs should remain repo-native, human-reviewable files; most other Loom layer state can move into the database and emit repo projections as needed.
- Future PostgreSQL support requires a backend-agnostic storage contract. SQLite-specific features such as session changesets may help sync, but they must not become the logical correctness boundary.
- Git sync must not use raw SQLite files as the merge unit. Deterministic text exports or entity/event bundles should be projected onto a reserved branch and hydrated back into a local DB idempotently.
- Repo/worktree identity should be modeled explicitly: logical spaces/projects for coordination, repositories for code ownership, and worktrees/checkouts as local execution attachments.

## Recommendations
- Create a shared local catalog at a user-level path such as `~/.pi/loom/catalog.sqlite`, with explicit spaces/projects/repos/worktrees instead of one DB per repo.
- Design and test a deterministic sync-branch export/import format based on stable entity snapshots or event bundles, plus content-addressed artifact blobs where needed.
- Introduce stable app-generated IDs (UUID/ULID) for every durable entity and keep current slugs/refs as secondary display identifiers.
- Keep worker runtime control-plane state local to each machine/worktree even if durable worker history eventually moves into the DB.
- Sequence the rollout as policy update -> storage contract extraction -> ID migration -> SQLite backend with projections -> branch sync/hydration -> optional PostgreSQL backend.
- Split canonical operational graph state from projections: initiatives/specs/plans/tickets/links/events in DB; docs and selected human-facing markdown/json outputs remain repo-native projections.

## Open Questions
- How much SQLite-specific acceleration (FTS, session changesets) is acceptable before it harms PostgreSQL portability?
- Should sync branch export be row-oriented snapshots, append-only event logs, or both?
- Should the default coordination container be a user-global space, per-repo space, or user-created named spaces that can own multiple repos?
- What subset of worker history belongs in canonical shared storage versus clone-local runtime state?
- Which human-facing artifacts besides docs should remain continuously materialized in repos for reviewability after canonical state moves into SQLite?

## Linked Work
- initiative:loom-storage-substrate-migration
- spec:sqlite-first-canonical-storage-substrate

## Artifacts
(none)
