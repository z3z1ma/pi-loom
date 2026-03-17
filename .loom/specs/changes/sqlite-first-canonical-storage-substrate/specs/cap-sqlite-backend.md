---
id: cap-sqlite-backend
title: "SQLite-first local backend and migration mode"
change: sqlite-first-canonical-storage-substrate
updated-at: 2026-03-17T00:40:26.902Z
source-changes:
  - sqlite-first-canonical-storage-substrate
---

## Summary
SQLite becomes the default canonical backend for local operation, with migration support from current file-backed artifacts and deterministic projection generation during cutover.

## Requirements
- A transitional phase can dual-write canonical DB state and generated repo projections until file-backed reads are removed.
- Migration introduces stable IDs and ownership metadata before full canonical cutover.
- SQLite operation is same-host only; the design does not assume network-shared SQLite.
- The default local database path is user-level and independent of repo checkout location.

## Scenarios
- A maintainer moves a repository checkout and the shared catalog still recognizes the same logical repository.
- A migration command imports existing `.loom` artifacts into the catalog and regenerates equivalent projections.
