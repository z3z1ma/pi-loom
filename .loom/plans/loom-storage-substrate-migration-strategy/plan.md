# Loom storage substrate migration strategy

## Purpose / Big Picture
Track the full multi-phase storage migration, not just the foundational storage package slice, and keep package-level cutover work explicit until all Loom packages stop treating neighboring file-backed `.loom` state as canonical truth.

## Progress
- [x] Ticket t-0044 — Update policy and extract storage contract (policy-and-contract)
- [x] Ticket t-0045 — Introduce global IDs and ownership metadata (identity-migration)
- [x] Ticket t-0046 — Implement SQLite backend and deterministic projections (sqlite-backend-and-projections)
- [x] Ticket t-0047 — Design reserved-branch export and hydration (sync-hydration)
- [x] Ticket t-0048 — Separate durable worker history from local runtime state (worker-runtime-carveout)
- [x] Ticket t-0049 — Validate backend portability and prepare PostgreSQL path (postgres-portability)
- [x] Ticket t-0050 — Migrate constitution, research, and initiative stores to shared storage (upstream-package-cutover)
- [x] Ticket t-0051 — Migrate specs, plans, and ticketing stores to shared storage (execution-package-cutover)
- [x] Ticket t-0052 — Migrate critique, Ralph, and docs stores to shared storage (review-docs-package-cutover)
- [x] Ticket t-0053 — Migrate worker package and tool surfaces onto shared storage (worker-package-cutover)
- [x] Ticket t-0054 — Cut remaining package tools over and remove stale file-canonical assumptions (final-cutover-and-critique)

## Surprises & Discoveries
- Observation: The first closed ticket set implemented only the shared storage substrate, not package-level cutover.
  Evidence: No existing package imports `@pi-loom/pi-storage`; representative stores still reopen `.loom/...` files directly.

- Observation: Foundation verification and critique were valuable, but package migrations remain the dominant remaining work.
  Evidence: Closed tickets t-0044 through t-0049 plus critique `storage-migration-implementation-review` cover substrate behavior only.

## Decision Log
- Decision: Treat tickets t-0044 through t-0049 as foundational substrate work rather than the complete migration.
  Rationale: Verification after implementation showed all current Loom packages still use file-backed stores directly, so claiming completion of the full migration would be false.
  Date/Author: 2026-03-16 / assistant

## Outcomes & Retrospective
No retrospective recorded yet.

## Context and Orientation
The finalized spec remains valid, but verification after the first implementation slice shows the initial ticket set was only the substrate/bootstrap phase: policy updates, shared storage package, SQLite catalog, sync bundle, runtime carve-out, and backend-neutral tests. The existing Loom packages still reopen `.loom/...` files directly and have not yet been rewired to the new storage contract. This plan must therefore remain active until package migrations and canonical cutover are complete.

Source target: initiative:loom-storage-substrate-migration

Scope paths: CONSTITUTION.md, packages/pi-constitution/, packages/pi-critique/, packages/pi-docs/, packages/pi-initiatives/, packages/pi-plans/, packages/pi-ralph/, packages/pi-research/, packages/pi-specs/, packages/pi-storage/, packages/pi-ticketing/, packages/pi-workers/, README.md

Roadmap: item-008
Initiatives: loom-storage-substrate-migration
Research: sqlite-first-storage-substrate-and-sync-architecture
Specs: sqlite-first-canonical-storage-substrate
Critiques: storage-migration-implementation-review

## Plan of Work
Phase 1 (complete) established the foundation: policy updates plus `@pi-loom/pi-storage` with IDs, SQLite catalog, sync export/import, runtime carve-out, and backend-neutral tests. Phase 2 must migrate package stores by dependency order so they stop treating repo files as canonical operational state. Phase 3 must cut package tools/commands over to the shared storage contract while preserving repo-materialized constitution/docs/spec markdown bodies and deliberate projections. Phase 4 can then harden projection cleanup, reserved-branch workflows, and broader adoption.

## Concrete Steps
1. Keep the foundation slice as a reusable substrate, but do not treat it as full migration completion.
2. Migrate upstream layers first: constitution, research, initiatives, specs, plans, tickets.
3. Migrate critique, Ralph, and docs onto the contract with their markdown carve-outs preserved.
4. Migrate workers carefully so durable worker history uses shared storage while clone-local runtime attachments remain local.
5. Rewire package tools and commands to use the shared storage contract rather than neighboring file reads.
6. Remove stale assumptions that repo `.loom` JSON metadata is canonical once package cutover lands.
7. Re-run critique after package migration, not just after substrate creation.

## Validation and Acceptance
The foundation slice is verified. Remaining migration must be validated package-by-package: each migrated package needs focused tests proving it reads/writes shared storage truthfully, preserves repo-materialized markdown carve-outs where intended, and no longer depends on neighboring file-backed stores for canonical state.

## Tickets
- t-0044 [closed] Update policy and extract storage contract — policy-and-contract
- t-0045 [closed] Introduce global IDs and ownership metadata — identity-migration
- t-0046 [closed] Implement SQLite backend and deterministic projections — sqlite-backend-and-projections
- t-0047 [closed] Design reserved-branch export and hydration — sync-hydration
- t-0048 [closed] Separate durable worker history from local runtime state — worker-runtime-carveout
- t-0049 [closed] Validate backend portability and prepare PostgreSQL path — postgres-portability
- t-0050 [closed] Migrate constitution, research, and initiative stores to shared storage — upstream-package-cutover
- t-0051 [closed] Migrate specs, plans, and ticketing stores to shared storage — execution-package-cutover
- t-0052 [closed] Migrate critique, Ralph, and docs stores to shared storage — review-docs-package-cutover
- t-0053 [closed] Migrate worker package and tool surfaces onto shared storage — worker-package-cutover
- t-0054 [closed] Cut remaining package tools over and remove stale file-canonical assumptions — final-cutover-and-critique

## Risks and open questions
The main risk is false completion: a shared storage package existing does not mean the migration is done. Until package stores, tools, and commands are rewired, the system remains mostly file-backed in practice. Open questions remain about package migration batching, projection cleanup timing, and exactly when auxiliary `.loom` metadata should stop being committed.
