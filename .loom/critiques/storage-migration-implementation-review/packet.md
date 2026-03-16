---
id: storage-migration-implementation-review
title: "Storage migration implementation review"
status: resolved
verdict: pass
target: workspace:sqlite-first-canonical-storage-substrate
focus:
  - architecture
  - correctness
  - maintainability
  - roadmap_alignment
created-at: 2026-03-16T18:43:24.034Z
updated-at: 2026-03-16T18:56:46.422Z
fresh-context-required: true
scope:
  - CONSTITUTION.md
  - packages/pi-storage/
  - README.md
---

## Review Target
Workspace review target: sqlite-first-canonical-storage-substrate at packages/pi-storage

## Review Question
Does the implemented SQLite-first storage package, sync bundle flow, runtime carve-out, and policy update truthfully satisfy tickets t-0044 through t-0049 without hiding important gaps or unsafe assumptions?

## Focus Areas
architecture, correctness, maintainability, roadmap_alignment

## Scope Paths
- CONSTITUTION.md
- packages/pi-storage/
- README.md

## Non-Goals
- Do not require a PostgreSQL backend implementation yet; review readiness and semantic portability only.
- Do not review unrelated packages that have not yet migrated to the new storage contract.

## Fresh Context Protocol
- Start from a fresh reviewer context instead of inheriting the executor session.
- Load .loom/critiques/storage-migration-implementation-review/packet.md before reasoning about the target.
- Judge the work against its contract, linked context, and likely failure modes; do not trust plausible output.
- Persist the result with critique_run and critique_finding so findings survive the session.

## Constitutional Context
Project: Pi Loom
Strategic direction: Turn Pi Loom into a repo-truthful, composable, local operating system for long-horizon technical work by grounding every layer in durable constitutional policy, explicit graph relationships, observable artifacts, and bounded orchestration.
Current focus: Deepen Ralph’s bounded verifier and critique loop without erasing the surrounding Loom layer boundaries.; Derive constitutional memory directly from the root constitution, README, and shipped repository behavior instead of maintaining a thin summary that drifts from source truth.; Harden the observable graph across constitution, research, initiatives, specs, plans, tickets, workers, critique, Ralph, and docs so state is recoverable from durable artifacts.
Open constitutional questions: How much explicit hypothesis and rejected-path structure should the research layer carry before it becomes ceremony?; What verifier and policy contracts should Ralph support before any broader orchestration is considered?; When, if ever, should broader worker coordination or multi-repository execution become first-class in Pi Loom?; Which external sync or publishing surfaces are worth adding after local-first durability is complete?; Which process-memory concerns deserve first-class Loom artifacts rather than remaining in AGENTS, critique, or documentation?

## Roadmap Items
- item-008 [active/now] Migrate Loom storage to a shared database substrate with repo projection sync — Replace per-repo file-backed canonical state with a local shared database substrate that supports cross-repo Loom coordination, repo/worktree-aware execution, deterministic repo projection, and future PostgreSQL backends.

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

## Existing Runs
- run-001 [verification/needs_revision] Fresh review initially found four correctness/architecture concerns in the storage migration slice: dropped ticket dependency links on import, skipped durable worker history, unscoped sync projection files across repositories, and clone-local worktree paths leaking into canonical storage.
- run-002 [verification/pass] All four critique findings were fixed: ticket `deps:` links now import, durable worker history imports while launch/runtime attachments remain local, sync bundle projection files are repository-scoped, and canonical worktree records no longer leak absolute checkout paths. Focused storage-package verification passes after the fixes.

## Existing Open Findings
(none)
