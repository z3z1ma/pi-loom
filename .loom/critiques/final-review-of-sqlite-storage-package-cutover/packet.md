---
id: final-review-of-sqlite-storage-package-cutover
title: "Final review of SQLite storage package cutover"
status: resolved
verdict: pass
target: workspace:pi-loom-storage-cutover
focus:
  - architecture
  - correctness
  - maintainability
  - process
created-at: 2026-03-17T00:20:02.202Z
updated-at: 2026-03-17T00:52:35.915Z
fresh-context-required: true
scope:
  - CONSTITUTION.md
  - packages/pi-constitution
  - packages/pi-critique
  - packages/pi-docs
  - packages/pi-initiatives
  - packages/pi-plans
  - packages/pi-ralph
  - packages/pi-research
  - packages/pi-specs
  - packages/pi-storage
  - packages/pi-ticketing
  - packages/pi-workers
  - README.md
---

## Review Target
Workspace review target: pi-loom-storage-cutover at packages/

## Review Question
After the SQLite-first storage migration, do the operational Loom layers now use shared storage as canonical truth with only deliberate markdown projections and accepted local runtime carve-outs remaining, or are there still stale file-canonical assumptions and misleading persisted artifacts?

## Focus Areas
architecture, correctness, maintainability, process

## Scope Paths
- CONSTITUTION.md
- packages/pi-constitution
- packages/pi-critique
- packages/pi-docs
- packages/pi-initiatives
- packages/pi-plans
- packages/pi-ralph
- packages/pi-research
- packages/pi-specs
- packages/pi-storage
- packages/pi-ticketing
- packages/pi-workers
- README.md

## Non-Goals
- Do not request roadmap redesign; review the implemented package cutover state.
- Do not review external provider quotas or unrelated SDK-runtime behavior.

## Fresh Context Protocol
- Start from a fresh reviewer context instead of inheriting the executor session.
- Load .loom/critiques/final-review-of-sqlite-storage-package-cutover/packet.md before reasoning about the target.
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
- t-0054 [ready] Cut remaining package tools over and remove stale file-canonical assumptions — Finish the migration by rewiring any remaining package tools/commands to the shared storage contract, cleaning up obsolete file-canonical assumptions, and re-running a full critique over the package-level cutover.

## Existing Runs
- run-001 [verification/pass] Verified the package-level SQLite cutover after removing persisted dashboard artifacts, shifting plan async operations off state.json writes, and preserving only the accepted fresh-process projection-ingestion seam for docs, critique, and Ralph. Full workspace verification now passes: 69/69 test files, 185/185 tests, and typecheck. No blocking stale file-canonical assumptions remain outside the explicitly accepted fresh-process ingestion seam documented in the finalized storage spec.

## Existing Open Findings
(none)
