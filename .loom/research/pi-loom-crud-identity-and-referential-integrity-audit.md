---
id: pi-loom-crud-identity-and-referential-integrity-audit
title: "Pi Loom CRUD, identity, and referential-integrity audit"
status: synthesized
created-at: 2026-03-22T19:22:08.881Z
tags:
  - governance
  - identity
  - integrity
  - workspace-audit
source-refs:
  - AGENTS.md
  - CONSTITUTION.md
  - README.md
---

## Question
How should Pi Loom unify CRUD capabilities, immutability boundaries, identifier strategy, referential integrity, and list/search ergonomics across all packages while remaining viable for shared Postgres and cross-SQLite import futures?

## Objective
Produce a package-by-package audit and a single cross-package governance plan covering constitution, research, initiatives, specs, plans, tickets, critique, Ralph, docs, and the shared storage substrate.

## Status Summary
Completed a full package-by-package audit. The main findings are inconsistent lifecycle truth, uneven strict-vs-advisory link semantics, weak or misleading mutability boundaries in several packages, and the need to separate canonical opaque ids from human-readable display ids across the stack.

## Scope
- packages/pi-constitution
- packages/pi-critique
- packages/pi-docs
- packages/pi-initiatives
- packages/pi-plans
- packages/pi-ralph-wiggum
- packages/pi-research
- packages/pi-specs
- packages/pi-storage
- packages/pi-ticketing

## Non-Goals
- Design full cross-repository sync/import protocols.
- Finalize the exact migration mechanics for every package.
- Implement the changes.

## Methodology
- Audit each package README, entrypoint, tool surface, store/model behavior, and shared storage contract.
- Compare current package semantics for CRUD, lifecycle, ids, link projection, and search behavior.
- Evaluate identifier strategy against shared-Postgres and cross-SQLite import futures, including the user preference for compact prefixed opaque ids instead of UUIDs.
- Read constitutional brief and repo architecture docs.

## Keywords
- crud
- display-id
- identifier-strategy
- immutability
- opaque-id
- referential-integrity
- search-ergonomics
- shared-postgres
- sqlite-import

## Conclusions
- A unified design should separate canonical opaque ids, human-readable display ids, and typed refs. Display ids stay discoverable and package-specific; canonical ids become collision-resistant storage keys.
- Compact prefixed opaque ids are preferable to UUIDs for ergonomics, but 5-6 random bytes are only comfortable for low-cardinality local child records; importable/shared canonical entities need a larger collision budget.
- List/search ergonomics are mostly good when tools explicitly recommend broad-first text search, but a few surfaces still over-promise ref formats or hide truth through exact filters/status mismatches.
- Most top-level package ids are human-readable title slugs or local numeric sequences. That is workable for single-user local SQLite, but brittle for shared backends and import/merge futures.
- Pi Loom already has broad CRUD coverage at the package level, but semantics are inconsistent: some packages auto-create on read, some histories are append-only, and others are mutable snapshots that look historical.
- The shared storage substrate has useful table-level foreign keys but still lacks critical identity guarantees, especially uniqueness on (space, kind, display_id) and true append-only event enforcement.

## Recommendations
- Adopt a cross-package identity contract with distinct canonical opaque ids, stable display ids, and typed refs.
- Classify relationships into strict foreign-key-like links, validated optional refs, and opaque annotations, then align package behavior and tool docs to those classes.
- Define a package-family immutability matrix: mutable current-state aggregates vs append-only historical children.
- Eliminate read-path auto-creation and tighten lifecycle guards so finalized/archived/closed states tell the truth.
- Start rollout at the storage substrate and shared identity helpers, then normalize packages package-by-package.

## Open Questions
- Whether constitution roadmap items should remain embedded or become first-class canonical records in the future.
- Whether plans and Ralph iterations should become more strictly append-only or remain revisable current-state checkpoints.
- Whether the project wants to accept the collision budget of 6-byte opaque ids for canonical top-level entities or prefers a slightly longer compact id for shared/imported state.

## Linked Work
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)

## Hypotheses
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)

## Artifacts
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)
