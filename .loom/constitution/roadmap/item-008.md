---
id: item-008
project: "Pi Loom"
status: active
horizon: now
updated-at: 2026-03-16T17:28:05.892Z
initiatives:
  - loom-storage-substrate-migration
research:
  - sqlite-first-storage-substrate-and-sync-architecture
spec-changes:
  - sqlite-first-canonical-storage-substrate
---

## Title
Migrate Loom storage to a shared database substrate with repo projection sync

## Summary
Replace per-repo file-backed canonical state with a local shared database substrate that supports cross-repo Loom coordination, repo/worktree-aware execution, deterministic repo projection, and future PostgreSQL backends.

## Rationale
The current file-backed `.loom` model hard-codes repo-local identity and direct file reads across packages, which prevents first-class cross-repo tickets, plans, and initiatives. A shared database substrate is now a user-directed architectural shift, but it must preserve local-first operation, human-reviewable projections, repo-native docs, and an explicit sync/hydration path for SQLite users.

## Linked Initiatives
- loom-storage-substrate-migration

## Linked Research
- sqlite-first-storage-substrate-and-sync-architecture

## Linked Spec Changes
- sqlite-first-canonical-storage-substrate
