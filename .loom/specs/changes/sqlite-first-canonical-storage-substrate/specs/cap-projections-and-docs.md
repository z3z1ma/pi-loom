---
id: cap-projections-and-docs
title: "Repo-native docs and deterministic projection surfaces"
change: sqlite-first-canonical-storage-substrate
updated-at: 2026-03-17T00:40:26.902Z
source-changes:
  - sqlite-first-canonical-storage-substrate
---

## Summary
Documentation remains authoritative in repos, while selected human-reviewable Loom artifacts become deterministic projections generated from canonical DB state.

## Requirements
- Artifact payloads that are binary or large remain file-based and content-addressed, with DB references to their metadata.
- Docs content (`doc.md` and related human-facing docs) remains repo-authoritative and reviewable in git.
- Plans, tickets, checkpoints, packets, dashboards, and similar review surfaces may remain materialized as deterministic projections when valuable.
- Projected artifacts stay repo-relative and portable and can be regenerated idempotently from canonical state.

## Scenarios
- A code review includes a projected ticket markdown diff generated from canonical DB state.
- A docs overview remains authored and reviewed inside the repository even though linked tickets live in SQLite.
