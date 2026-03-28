---
id: canonical-graph-cutover-phase-1
title: "Canonical graph cutover phase 1"
status: archived
created-at: 2026-03-19T01:07:20.929Z
updated-at: 2026-03-28T00:10:02.402Z
research:
  - sqlite-data-plane-audit-and-enrichment-opportunities
initiatives:
  - canonical-shared-data-plane
capabilities:
  - canonical-link-lifecycle
  - cross-package-link-projection
  - graph-integrity-hardening
---

## Overview
Define and implement the first bounded milestone of Pi Loom's data plane transformation: activate canonical cross-entity links from existing package payloads, harden the storage substrate for link lifecycle management, and fix known integrity defects that would otherwise undermine the graph. This change is intentionally scoped to a complete first cut rather than the entire future data-plane end state. The target architecture remains a richer entity-plus-link-plus-event system, but phase 1 specifically delivers shared graph truth over today's embedded relationship data while preserving existing typed payloads as package-local documents.

## Capabilities
- canonical-link-lifecycle: Canonical link lifecycle in storage substrate
- cross-package-link-projection: Cross-package relationship projection
- graph-integrity-hardening: Graph integrity hardening for current stores

## Requirements
- req-001: Link synchronization must skip missing targets rather than creating fake entities or crashing package persistence.
  Acceptance: A package can declare its desired outgoing canonical links and the helper will upsert missing links and remove stale ones.; Storage tests prove that stale links are removed deterministically and unrelated links remain untouched.; The SQLite backend has the indexes needed for symmetrical graph queries on both link endpoints.
  Capabilities: canonical-link-lifecycle
- req-002: Shared helpers must synchronize a package-defined desired link set against existing links without deleting unrelated links owned by other concerns.
  Acceptance: A package can declare its desired outgoing canonical links and the helper will upsert missing links and remove stale ones.; Storage tests prove that stale links are removed deterministically and unrelated links remain untouched.; The SQLite backend has the indexes needed for symmetrical graph queries on both link endpoints.
  Capabilities: canonical-link-lifecycle
- req-003: The SQLite backend and in-memory test backend must support link removal and preserve referential integrity.
  Acceptance: A package can declare its desired outgoing canonical links and the helper will upsert missing links and remove stale ones.; Storage tests prove that stale links are removed deterministically and unrelated links remain untouched.; The SQLite backend has the indexes needed for symmetrical graph queries on both link endpoints.
  Capabilities: canonical-link-lifecycle
- req-004: The storage contract must expose link removal in addition to upsert and listing.
  Acceptance: A package can declare its desired outgoing canonical links and the helper will upsert missing links and remove stale ones.; Storage tests prove that stale links are removed deterministically and unrelated links remain untouched.; The SQLite backend has the indexes needed for symmetrical graph queries on both link endpoints.
  Capabilities: canonical-link-lifecycle
- req-005: Canonical link projection must run as part of normal canonical persistence so links stay in sync with current state.
  Acceptance: After persisting representative records, canonical links exist for the relationships those records already describe in package state.; Link updates on package mutations remove stale edges as well as creating new ones.; The chosen link kinds are consistent enough that adapters can traverse the graph without package-specific folklore.
  Capabilities: cross-package-link-projection
- req-006: Projection must preserve current typed aggregate payloads; the graph is added as canonical structure, not by deleting useful package-local detail yet.
  Acceptance: After persisting representative records, canonical links exist for the relationships those records already describe in package state.; Link updates on package mutations remove stale edges as well as creating new ones.; The chosen link kinds are consistent enough that adapters can traverse the graph without package-specific folklore.
  Capabilities: cross-package-link-projection
- req-007: Stores for constitution, research, initiatives, specs, plans, tickets, workers, critique, Ralph, and docs must define which existing references become canonical links in phase 1.
  Acceptance: After persisting representative records, canonical links exist for the relationships those records already describe in package state.; Link updates on package mutations remove stale edges as well as creating new ones.; The chosen link kinds are consistent enough that adapters can traverse the graph without package-specific folklore.
  Capabilities: cross-package-link-projection
- req-008: Initiative ticket membership sync must complete before the initiative write resolves.
  Acceptance: Canonical link projection does not depend on best-effort asynchronous side effects to remain truthful.; Read/write flows leave package payload linkage and canonical links consistent for the implemented cases.; The identified defects are fixed with targeted tests.
  Capabilities: graph-integrity-hardening
- req-009: Plan unlink flows must remove ticket-side external refs so descriptive linkage cannot lie after the canonical graph changes.
  Acceptance: Canonical link projection does not depend on best-effort asynchronous side effects to remain truthful.; Read/write flows leave package payload linkage and canonical links consistent for the implemented cases.; The identified defects are fixed with targeted tests.
  Capabilities: graph-integrity-hardening
- req-010: Regression tests must cover these integrity paths.
  Acceptance: Canonical link projection does not depend on best-effort asynchronous side effects to remain truthful.; Read/write flows leave package payload linkage and canonical links consistent for the implemented cases.; The identified defects are fixed with targeted tests.
  Capabilities: graph-integrity-hardening
- req-011: Worker async APIs must not double-persist the same state mutation.
  Acceptance: Canonical link projection does not depend on best-effort asynchronous side effects to remain truthful.; Read/write flows leave package payload linkage and canonical links consistent for the implemented cases.; The identified defects are fixed with targeted tests.
  Capabilities: graph-integrity-hardening

## Clarifications
(none)
