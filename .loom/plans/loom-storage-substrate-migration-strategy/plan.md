# Loom storage substrate migration strategy

## Purpose / Big Picture
Turn the finalized storage spec into a staged migration sequence and initial ticket set that can be implemented without losing correctness, reviewability, or cross-repo flexibility.

## Progress
- [x] Ticket t-0044 — Update policy and extract storage contract (policy-and-contract)
- [x] Ticket t-0045 — Introduce global IDs and ownership metadata (identity-migration)
- [x] Ticket t-0046 — Implement SQLite backend and deterministic projections (sqlite-backend-and-projections)
- [x] Ticket t-0047 — Design reserved-branch export and hydration (sync-hydration)
- [x] Ticket t-0048 — Separate durable worker history from local runtime state (worker-runtime-carveout)
- [x] Ticket t-0049 — Validate backend portability and prepare PostgreSQL path (postgres-portability)

## Surprises & Discoveries
- Observation: The migration requires package-boundary redesign because current stores reopen neighboring `.loom` files directly and treat repo-relative paths as identity and truth.
  Evidence: README.md; packages/pi-ticketing/extensions/domain/store.ts; packages/pi-plans/extensions/domain/store.ts; packages/pi-workers/extensions/domain/store.ts

- Observation: SQLite WAL, backup, and session changesets help local operation but do not provide the merge-aware git sync surface needed by the user or the backend portability needed for PostgreSQL.
  Evidence: https://sqlite.org/wal.html ; https://sqlite.org/backup.html ; https://sqlite.org/sessionintro.html

## Decision Log
- Decision: Use one user-level shared catalog as the default canonical topology instead of one database per repo.
  Rationale: Tickets, initiatives, and plans must span repositories, making repo-scoped canonical databases the wrong default boundary.
  Date/Author: 2026-03-16 / assistant

- Decision: Keep docs authoritative in repos and treat other human-facing artifacts as deterministic projections from canonical operational state.
  Rationale: Docs derive their value from living with code review, while most operational Loom records benefit from shared queryable storage.
  Date/Author: 2026-03-16 / assistant

- Decision: Use deterministic reserved-branch exports for sync/hydration instead of syncing raw SQLite files.
  Rationale: Git mergeability and future PostgreSQL compatibility require a textual projection surface rather than backend-specific binary state.
  Date/Author: 2026-03-16 / assistant

## Outcomes & Retrospective
No retrospective recorded yet.

## Context and Orientation
The finalized spec `sqlite-first-canonical-storage-substrate` now defines seven capabilities and six sequenced implementation tasks. The migration changes project policy: operational Loom truth moves to a shared local database while docs remain repo-authoritative and selected review artifacts become deterministic projections. The current codebase still hard-codes file-backed stores under `<cwd>/.loom/...`, so the strategy must change policy and package boundaries before backend cutover.

Source target: initiative:loom-storage-substrate-migration

Scope paths: CONSTITUTION.md, packages/pi-constitution/, packages/pi-critique/, packages/pi-docs/, packages/pi-initiatives/, packages/pi-plans/, packages/pi-ralph/, packages/pi-research/, packages/pi-specs/, packages/pi-ticketing/, packages/pi-workers/, README.md

Roadmap: item-008
Initiatives: loom-storage-substrate-migration
Research: sqlite-first-storage-substrate-and-sync-architecture
Specs: sqlite-first-canonical-storage-substrate

## Plan of Work
Phase 1 rewrites policy and extracts the backend-agnostic storage contract, including spaces/projects, repositories, worktrees, global IDs, and projection semantics. Phase 2 migrates core operational state onto SQLite while keeping deterministic repo projections and import of current `.loom` artifacts. Phase 3 adds the reserved sync-branch export/hydration system and conflict handling. Phase 4 hardens the worker runtime carve-out and backend-portability test matrix so PostgreSQL can later satisfy the same contract.

## Concrete Steps
1. Update constitutional and README policy so repo-visible `.loom` files are no longer assumed canonical for operational state.
2. Define the backend-agnostic storage contract and stop cross-package direct file reads.
3. Introduce stable global IDs, ownership metadata, and version semantics for all durable entities.
4. Implement the SQLite backend plus deterministic projection generation and import from current file artifacts.
5. Add reserved-branch export/import, artifact manifests, and explicit conflict handling.
6. Separate durable worker history from clone-local runtime/worktree control-plane state with leases or equivalent liveness semantics.
7. Add backend-neutral contract tests and document PostgreSQL as the multi-machine path.

## Validation and Acceptance
For planning, validate against scenario packets: single repo, multiple worktrees of one repo, multiple unrelated repos, one cross-repo initiative with tickets in two repos, fresh-machine hydration from the reserved branch, non-conflicting sync merge, conflicting sync import, and stale worker-runtime recovery. For implementation, every ticket should prove both contract-level behavior and deterministic projection/output stability where relevant.

## Tickets
- t-0044 [closed] Update policy and extract storage contract — policy-and-contract
- t-0045 [closed] Introduce global IDs and ownership metadata — identity-migration
- t-0046 [closed] Implement SQLite backend and deterministic projections — sqlite-backend-and-projections
- t-0047 [closed] Design reserved-branch export and hydration — sync-hydration
- t-0048 [closed] Separate durable worker history from local runtime state — worker-runtime-carveout
- t-0049 [closed] Validate backend portability and prepare PostgreSQL path — postgres-portability

## Risks and open questions
Highest-risk edges remain policy drift, global-ID migration bugs, reviewability loss if projections are removed instead of demoted, overuse of SQLite-only semantics, and worker stale-running state if canonical liveness is under-specified. Open questions remain around the default space topology, the exact export format (snapshot, event, or hybrid), and how much durable worker history belongs in shared storage versus local runtime.
