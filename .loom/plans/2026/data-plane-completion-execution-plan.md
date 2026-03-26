# Data plane completion execution plan

## Purpose / Big Picture

Finish Pi Loom's internal-only data-plane cutover so the canonical substrate is no longer mostly a blob store with links, but a coherent entity/link/event/runtime/artifact system that another harness could consume directly.

## Progress

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- [x] (2026-03-19T07:55:00.000Z) Created the completion spec, linked it to the initiative/research/roadmap context, and generated execution tickets pl-0068 through pl-0071.
- [x] (2026-03-19T08:48:00.000Z) Implemented the remaining data-plane phases: lifecycle/link events, runtime-boundary cleanup, artifact-backed child projections, and top-level contract updates.
- [x] (2026-03-19T15:55:00.000Z) Completed the final critique cycle, fixed the recorded findings, and verified the finished cutover.

Linked ticket snapshot from the live execution ledger:
- [x] Ticket pl-0068 — Implement canonical event plane (Event plane and shared helper work)
- [x] Ticket pl-0069 — Move runtime-local and derived state out of canonical entities (Runtime-boundary and derived-view cleanup)
- [x] Ticket pl-0070 — Project high-value subrecords as artifact entities (Artifact-backed subrecord projection)
- [x] Ticket pl-0071 — Document and verify the final adapter contract (Contract documentation, verification, and final critique)

## Surprises & Discoveries

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Observation: Direct plan reads of documentation entities had to switch to the docs store after docs canonical storage moved from `{ record }` to `{ snapshot }` attributes.
  Evidence: packages/pi-plans/extensions/domain/store.ts safeReadDocAsync

- Observation: Critique mutation APIs needed to become async-only for durable writes once findings moved to projected artifact entities.
  Evidence: packages/pi-critique/extensions/domain/store.ts async mutator path and updated async callsites/tests

## Decision Log

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Decision: Use canonical artifact entities for the first wave of normalized subrecords instead of introducing many new entity kinds.
  Rationale: The shared storage contract already had an artifact entity kind. Reusing it kept the schema stable while still making subrecords first-class and queryable by subtype/tags/links.
  Date/Author: 2026-03-19 / assistant

- Decision: Keep ticket and constitution projected metadata links optional when they can legitimately point at not-yet-materialized upstream records.
  Rationale: These layers may reference durable context that is not yet canonically present in the current workspace; link projection should skip rather than fail those writes.
  Date/Author: 2026-03-19 / assistant

- Decision: Treat critique durable mutation APIs as async-only for canonical writes.
  Rationale: Once findings became projected artifact entities, the old sync write path could expose partially projected state and double-write before canonical validation. Async-only mutation flow keeps one durable write boundary.
  Date/Author: 2026-03-19 / assistant

## Outcomes & Retrospective

Pi Loom now behaves as a coherent shared data plane for the implemented slice rather than a loose collection of package-local entity blobs. The major qualitative shift is that adapters can traverse graph edges, tail event history, inspect runtime attachments when local execution matters, and query high-value child records directly through artifact entities.

## Context and Orientation

Phase 1 already activated canonical links and fixed several integrity defects. This completion plan executed DATA_PLANE.md phases 2-5. The key repository surfaces are the shared storage contract/helpers in packages/pi-storage, the package stores under packages/pi-*/extensions/domain/store.ts, the durable spec canonical-data-plane-completion, and the top-level audit in DATA_PLANE.md. The accepted design target is now implemented: entities remain portable typed snapshots; links remain graph truth; events provide timeline truth for the implemented flows; runtime_attachments isolate clone-local launch/process state; and selected subrecords exist as first-class artifact entities linked back to their owners.

## Projection Context

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Status: completed
- Source target: spec:canonical-data-plane-completion
- Scope paths: https-github-com-z3z1ma-pi-loom-git:DATA_PLANE.md, https-github-com-z3z1ma-pi-loom-git:packages/pi-constitution, https-github-com-z3z1ma-pi-loom-git:packages/pi-critique, https-github-com-z3z1ma-pi-loom-git:packages/pi-docs, https-github-com-z3z1ma-pi-loom-git:packages/pi-initiatives, https-github-com-z3z1ma-pi-loom-git:packages/pi-plans, https-github-com-z3z1ma-pi-loom-git:packages/pi-ralph, https-github-com-z3z1ma-pi-loom-git:packages/pi-research, https-github-com-z3z1ma-pi-loom-git:packages/pi-specs, https-github-com-z3z1ma-pi-loom-git:packages/pi-storage, https-github-com-z3z1ma-pi-loom-git:packages/pi-ticketing, https-github-com-z3z1ma-pi-loom-git:packages/pi-workers
- Roadmap: item-001
- Initiatives: canonical-shared-data-plane
- Research: sqlite-data-plane-audit-and-enrichment-opportunities
- Specs: canonical-data-plane-completion
- Tickets: pl-0068, pl-0069, pl-0070, pl-0071
- Critiques: data-plane-completion-final-review

## Milestones

1. Event plane: completed.
2. Runtime boundary cleanup: completed.
3. Artifact projections: completed.
4. Contract lock, verification, and final critique: completed.

## Plan of Work

The completed work first extended the shared storage/helper layer, then refactored the runtime-boundary-heavy packages, then cut over the selected child-record families to canonical artifact entities, and finally refreshed the top-level contract documentation and completed the final critique cycle.

## Concrete Steps

1. Extended the storage contract/helpers for lifecycle events, graph events, entity removal, and projected artifact synchronization.
2. Updated core stores to emit lifecycle and representative mutation events.
3. Refactored worker/critique/Ralph/docs canonical shapes so derived packet/dashboard/launch surfaces are rebuilt on read, with worker launch/runtime state moved to runtime attachments.
4. Added artifact projection/rebuild logic for research artifacts, critique findings, Ralph iterations, and worker checkpoints.
5. Expanded the storage helper tests and package-level integration coverage.
6. Refreshed DATA_PLANE.md to describe the final adapter-facing contract.
7. Ran the final critique cycle, fixed the recorded findings, and closed the plan.

## Validation and Acceptance

Observed verification evidence:
- `npm run test` -> 21 files / 42 tests passed
- targeted integration suite -> 18 files / 78 tests passed
- targeted changed-file `tsc` -> passed
- targeted Biome checks -> passed
- critique `data-plane-completion-final-review` -> resolved/pass after fixing recorded findings

## Idempotence and Recovery

The implemented helpers now reconcile managed links and artifact child entities while compensating their own failure paths, so retries do not leave graph history or child projections lying about the final canonical state. Worker launch attachments remain removable without corrupting canonical worker state. Aggregate reads rehydrate selected child collections from artifact entities rather than maintaining a second canonical representation.

## Artifacts and Notes

Primary artifacts: DATA_PLANE.md, canonical-data-plane-completion spec, this plan, tickets pl-0068..pl-0071, critique data-plane-completion-final-review, and the package tests covering storage/event/runtime/artifact flows.

## Interfaces and Dependencies

Key interface boundaries are LoomCanonicalStorage plus the entity/link/event/runtime attachment records, projected artifact conventions, and package read models that re-materialize from the canonical plane. The final contract documented in DATA_PLANE.md is now the adapter-facing truth for this milestone.

## Linked Tickets

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- pl-0068 [closed] Implement canonical event plane — Event plane and shared helper work
- pl-0069 [closed] Move runtime-local and derived state out of canonical entities — Runtime-boundary and derived-view cleanup
- pl-0070 [closed] Project high-value subrecords as artifact entities — Artifact-backed subrecord projection
- pl-0071 [closed] Document and verify the final adapter contract — Contract documentation, verification, and final critique

## Risks and Open Questions

The completion milestone intentionally stops at the current internal cutover. Future work can broaden event/artifact coverage further, but that is not unfinished work inside this plan. The main remaining strategic question is where later child-record families should become first-class canonical records versus stay embedded projections.

## Revision Notes

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- 2026-03-19T07:55:00.000Z — Created the data-plane completion execution plan for phases 2-5 after phase 1 had already been completed separately.
  Reason: The user directed that all remaining phases be executed to completion before the final critique.

- 2026-03-19T07:55:42.742Z — Created durable workplan scaffold from spec:canonical-data-plane-completion.
  Reason: Establish a self-contained execution-strategy artifact that can be resumed without prior chat context.

- 2026-03-19T07:55:55.584Z — Linked ticket pl-0071 as Contract documentation, verification, and final critique.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-19T07:56:31.397Z — Linked ticket pl-0068 as Event plane and shared helper work.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-19T07:56:45.178Z — Linked ticket pl-0069 as Runtime-boundary and derived-view cleanup.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-19T07:56:48.909Z — Linked ticket pl-0070 as Artifact-backed subrecord projection.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-19T07:56:52.592Z — Linked ticket pl-0071 as Contract documentation, verification, and final critique.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-19T08:49:00.000Z — Recorded that implementation is complete and only the final critique cycle remains.
  Reason: The user asked that all phases complete before one final critique cycle.

- 2026-03-19T08:49:01.685Z — Updated title, status, summary, purpose, context and orientation, milestones, plan of work, concrete steps, validation, idempotence and recovery, artifacts and notes, interfaces and dependencies, risks and open questions, outcomes and retrospective, scope paths, source target, context refs, progress, surprises and discoveries, decision log, revision notes.
  Reason: Keep the workplan aligned with the current execution strategy and observable validation story.

- 2026-03-19T07:55:00.000Z — Created the data-plane completion execution plan for phases 2-5 after phase 1 had already been completed separately.
  Reason: The user directed that all remaining phases be executed to completion before the final critique.

- 2026-03-19T08:49:00.000Z — Recorded that implementation is complete and only the final critique cycle remains.
  Reason: The user asked that all phases complete before one final critique cycle.

- 2026-03-19T15:07:49.848Z — Updated title, status, summary, purpose, context and orientation, milestones, plan of work, concrete steps, validation, idempotence and recovery, artifacts and notes, interfaces and dependencies, risks and open questions, outcomes and retrospective, scope paths, source target, context refs, progress, surprises and discoveries, decision log, revision notes.
  Reason: Keep the workplan aligned with the current execution strategy and observable validation story.

- 2026-03-19T07:55:00.000Z — Created the data-plane completion execution plan for phases 2-5 after phase 1 had already been completed separately.
  Reason: The user directed that all remaining phases be executed to completion before the final critique.

- 2026-03-19T08:49:00.000Z — Recorded that implementation was complete and only the final critique cycle remained.
  Reason: The user asked that all phases complete before one final critique cycle.

- 2026-03-19T15:55:00.000Z — Marked the plan completed after the final critique findings were fixed and the verification bundle passed.
  Reason: The user required the entire multi-phase plan to be implemented end to end before stopping.

- 2026-03-19T15:53:41.108Z — Updated title, status, summary, purpose, context and orientation, milestones, plan of work, concrete steps, validation, idempotence and recovery, artifacts and notes, interfaces and dependencies, risks and open questions, outcomes and retrospective, scope paths, source target, context refs, progress, surprises and discoveries, decision log, revision notes.
  Reason: Keep the workplan aligned with the current execution strategy and observable validation story.
