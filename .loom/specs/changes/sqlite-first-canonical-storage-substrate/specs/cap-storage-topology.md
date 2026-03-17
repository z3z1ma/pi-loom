---
id: cap-storage-topology
title: "Shared catalog topology and global identity"
change: sqlite-first-canonical-storage-substrate
updated-at: 2026-03-17T00:40:26.902Z
source-changes:
  - sqlite-first-canonical-storage-substrate
---

## Summary
Pi Loom uses one user-level shared catalog by default, with explicit spaces/projects, repositories, and worktrees, and all durable entities carry stable global IDs independent of repo-relative paths.

## Requirements
- Every durable entity has a stable app-generated global ID; human-friendly refs remain secondary aliases or projections.
- Logical coordination containers are modeled explicitly so tickets, plans, initiatives, and provenance can span repositories.
- Repo-relative paths remain data attributes and scopes, not primary identity.
- The default canonical store is one user-level Loom catalog rather than one database per repository.

## Scenarios
- A cross-repo initiative links tickets in `service-a` and `service-b` while remaining one initiative.
- A user opens three worktrees of one repo and all attach to one shared ticket graph.
