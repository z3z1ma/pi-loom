---
id: canonical-graph-cutover-phase-1
title: "Canonical graph cutover phase 1"
status: finalized
created-at: 2026-03-19T01:07:20.929Z
updated-at: 2026-03-19T07:28:32.294Z
research:
  - sqlite-data-plane-audit-and-enrichment-opportunities
initiatives:
  - canonical-shared-data-plane
capabilities:
  - canonical-link-lifecycle
  - cross-package-link-projection
  - graph-integrity-hardening
---

## Design Notes
## Problem framing
Pi Loom's current SQLite schema already includes `entities`, `links`, `events`, and `runtime_attachments`, but almost all packages use only `entities` and treat the system as a typed blob store. Cross-package relationships are therefore duplicated inside package-specific payload arrays, ticket frontmatter, or rendered markdown references. That makes read-time materialization rich for one package at a time, but weak for graph queries, adapter portability, and integrity checks.

## Phase 1 objective
Phase 1 turns the dormant `links` table into a live canonical graph without forcing every package to normalize all nested sub-records immediately. The goal is to preserve today's typed aggregate payloads while projecting the relationships they already describe into first-class canonical links. The phase also fixes the integrity defects that would make that graph untrustworthy.

## Architectural approach
1. Extend the storage contract so links can be removed, synchronized deterministically, and queried efficiently.
2. Add shared storage helpers that:
   - resolve related entities by display id and kind
   - compute desired link sets from a package's canonical state
   - upsert missing links and remove stale links
   - tolerate unresolved targets without fabricating placeholder entities
3. Update package stores so every canonical persist path also synchronizes its canonical links.
4. Fix known integrity issues discovered in the audit that would otherwise create stale or duplicated graph truth.
5. Leave lifecycle-wide event projection and runtime-attachment cutover to later milestones; this phase is about trustworthy shared graph truth first.

## Link semantics for phase 1
- `depends_on` for execution dependencies such as ticket -> ticket deps.
- `blocks` for inverse ticket blocker edges derived from dependencies when appropriate is deferred; phase 1 stores canonical dependency direction only.
- `belongs_to` for containment or membership relationships such as ticket -> initiative, ticket -> plan, ticket child -> parent, worker -> plan, or spec -> initiative when the target is the organizing context.
- `references` for looser upstream/downstream associations such as research -> ticket/spec/initiative, docs -> related context, constitution -> linked work, Ralph -> linked specs/tickets/docs, and plan -> referenced context.
- `implements` for execution entities materially carrying out another artifact's work, such as worker -> ticket and spec change -> ticket if projection must express execution mapping directly.
- `documents` for documentation pointing at the source artifact it explains.
- `critiques` for critique -> target and Ralph -> critique relationships.
- `spawned_from` is reserved for orchestration/runtime lineage and is not the main focus of this phase.

## Scope boundaries
In scope:
- storage-substrate link lifecycle support
- canonical link projection from existing package state
- bug fixes required to keep projected links truthful
- targeted tests proving link projection and integrity behavior

Out of scope for this phase:
- turning every nested array into a first-class entity family
- complete lifecycle event projection across every package
- eliminating all rendered markdown from canonical payloads
- full runtime-attachment migration for workers and Ralph launches

## Verification strategy
- shared storage tests must prove deterministic link upsert/removal behavior
- package tests must prove the expected canonical links appear after create/update/link/unlink flows
- integrity bug fixes must have targeted regression tests
- critique review must evaluate whether the cutover leaves any package with stale graph truth or hidden runtime leakage

## Capability Map
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
