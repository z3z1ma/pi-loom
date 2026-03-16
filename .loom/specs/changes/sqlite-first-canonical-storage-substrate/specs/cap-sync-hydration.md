---
id: cap-sync-hydration
title: "Reserved-branch sync and hydration for SQLite users"
change: sqlite-first-canonical-storage-substrate
updated-at: 2026-03-16T17:40:15.372Z
source-changes:
  - sqlite-first-canonical-storage-substrate
---

## Summary
SQLite users can export deterministic sync bundles to a dedicated branch and hydrate or update a local database from that branch with explicit conflict handling.

## Requirements
- Each exported entity carries stable IDs, ownership/project metadata, versions, and link data needed for idempotent import.
- Hydration can reconstruct a local database from an empty state using the reserved branch plus repo-native docs/artifacts.
- Import detects conflicting concurrent edits to the same entity/version and surfaces them explicitly.
- Sync exports are deterministic text/entity bundles or event bundles, not raw SQLite database files.

## Scenarios
- A contributor clones a repo, checks out the reserved sync branch, hydrates a new local catalog, and resumes work.
- Two branches independently add unrelated tickets and initiatives, then merge their sync exports without manual DB surgery.
