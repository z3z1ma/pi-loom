# Loom storage substrate migration strategy Planning Packet



## Planning Target

loom-storage-substrate-migration [active] Loom storage substrate migration
Objective: Replace Pi Loom's file-backed canonical state with a shared local database substrate that supports cross-repo coordination, worktree-aware execution, deterministic repo projection, and future PostgreSQL backends.
Status summary: Verification after the initial implementation slice shows the closed tickets only cover the storage foundation (`@pi-loom/pi-storage`, policy updates, sync bundle, runtime carve-out, portability tests). The full migration is not complete because the existing Loom packages still …
Milestones: 1

## Current Plan Summary

Execution strategy for migrating Pi Loom from file backed repo .loom state to a shared SQLite first substrate with global IDs, repo native markdown carve outs, deterministic sync exports, and future PostgreSQL support.

## Planning Boundaries

- Keep `plan.md` deeply detailed at the execution-strategy layer; it should explain sequencing, rationale, risks, and validation without duplicating ticket-by-ticket live state.
- Use `pi-ticketing` to create, refine, or link tickets explicitly. Plans provide coordination context around those tickets, and linked tickets stay fully detailed and executable in their own right.
- Treat linked tickets as the live execution system of record for status, dependencies, verification, and checkpoints, and as self-contained units of work with their own acceptance criteria and execution context.
- Preserve truthful source refs, ticket roles, assumptions, risks, and validation intent so a fresh planner can resume from durable context.

## Linked Tickets

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

## Scope Paths

- CONSTITUTION.md
- packages/pi-constitution/
- packages/pi-critique/
- packages/pi-docs/
- packages/pi-initiatives/
- packages/pi-plans/
- packages/pi-ralph/
- packages/pi-research/
- packages/pi-specs/
- packages/pi-storage/
- packages/pi-ticketing/
- packages/pi-workers/
- README.md

## Constitutional Context

Project: Pi Loom
Strategic direction: (empty)
Current focus: none
Open constitutional questions: Capture the architectural and business constraints.; Capture the guiding decision principles.; Capture the strategic direction and roadmap.; Define the durable project vision.

## Roadmap Items

(none)

## Initiatives

- loom-storage-substrate-migration [active] Loom storage substrate migration — Replace Pi Loom's file-backed canonical state with a shared local database substrate that supports cross-repo coordination, worktree-aware execution, deterministic repo projection, and future PostgreSQL backends.

## Research

- sqlite-first-storage-substrate-and-sync-architecture [synthesized] SQLite-first storage substrate and sync architecture — conclusions: A single user-level Loom database should be the default, not one database per repo, because tickets/plans/initiatives must be able to span repositories.; Canonical identity must become globally unique and detached from repo paths or local slug sequences; human-friendly refs can remain as projections or aliases.; Docs should remain repo-native, human-reviewable files; most other Loom layer state can move into the database and emit repo projections as needed.; Future PostgreSQL support requires a backend-agnostic storage contract. SQLite-specific features such as session changesets may help sync, but they must not become the logical correctness boundary.; Git sync must not use raw SQLite files as the merge unit. Deterministic text exports or entity/event bundles should be projected onto a reserved branch and hydrated back into a local DB idempotently.; Repo/worktree identity should be modeled explicitly: logical spaces/projects for coordination, repositories for code ownership, and worktrees/checkouts as local execution attachments.

## Specs

- sqlite-first-canonical-storage-substrate [finalized] SQLite-first canonical storage substrate — reqs=28 tasks=6

## Tickets

- t-0044 [closed] Update policy and extract storage contract — Rewrite constitutional and README policy so canonical DB state, repo-materialized main constitution/docs/spec markdown carve-outs, and projection boundaries are explicit, then define the backend-agnostic storage contract for entities, links, events, projections, projects, reposi…
- t-0045 [closed] Introduce global IDs and ownership metadata — Add stable global IDs, ownership/project metadata, and version semantics to all durable entity types while preserving human-friendly local refs as aliases or projections.
- t-0046 [closed] Implement SQLite backend and deterministic projections — Build the SQLite adapter behind the storage contract, import current file-backed state, move metadata/state into the DB, and generate deterministic repo projections that preserve main constitution/docs/spec markdown bodies for grep/review during the cutover period.
- t-0047 [closed] Design reserved-branch export and hydration — Define and implement deterministic sync exports, content-addressed artifact manifests, hydration/import flows, and explicit conflict handling for SQLite users.
- t-0048 [closed] Separate durable worker history from local runtime state — Define and implement the boundary between canonical shared worker history and clone-local worktree/runtime control-plane state, including leases and heartbeats for any canonical worker liveness state.
- t-0049 [closed] Validate backend portability and prepare PostgreSQL path — Build backend-contract tests and backend-neutral semantics so PostgreSQL can later replace or complement SQLite without redesigning domain behavior.
- t-0050 [closed] Migrate constitution, research, and initiative stores to shared storage — Replace direct file-backed canonical reads/writes in `pi-constitution`, `pi-research`, and `pi-initiatives` with the shared storage contract while preserving repo-materialized constitution markdown bodies and any deliberate projections.
- t-0051 [closed] Migrate specs, plans, and ticketing stores to shared storage — Cut `pi-specs`, `pi-plans`, and `pi-ticketing` over to the shared storage contract while keeping the main spec markdown bodies and selected review projections repo-materialized.
- t-0052 [closed] Migrate critique, Ralph, and docs stores to shared storage — Move `pi-critique`, `pi-ralph`, and `pi-docs` onto the shared storage contract while preserving repo-materialized main docs markdown bodies and deliberate review packet/projection behavior.
- t-0053 [closed] Migrate worker package and tool surfaces onto shared storage — Rewire `pi-workers` so durable worker history uses the shared storage contract while clone-local runtime attachments remain local, then cut worker/manager tools over to the new canonical path.
- t-0054 [closed] Cut remaining package tools over and remove stale file-canonical assumptions — Finish the migration by rewiring any remaining package tools/commands to the shared storage contract, cleaning up obsolete file-canonical assumptions, and re-running a full critique over the package-level cutover.

## Critiques

- storage-migration-implementation-review [resolved/pass] Storage migration implementation review — open findings: 0

## Documentation

(none)
