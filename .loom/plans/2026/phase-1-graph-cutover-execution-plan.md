# Phase 1 graph cutover execution plan

## Purpose / Big Picture

Deliver a complete first milestone of the canonical data plane program. This plan turns Pi Loom's dormant `links` table into a live canonical graph for existing package relationships, fixes defects that would make that graph untrustworthy, and leaves a verified foundation for later event and runtime-attachment cutovers.

## Progress

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- [x] (2026-03-19T01:06:00.000Z) Created the canonical data plane initiative, finalized the phase-1 graph cutover spec, projected execution tickets, and wrote the bounded execution plan.
- [x] (2026-03-20T00:24:35.000Z) Completed the storage, context, and execution cutover work and validated it with passing unit, integration, targeted static, and targeted lint bundles.

Linked ticket snapshot from the live execution ledger:
- [x] Ticket pl-0064 — Add storage link lifecycle support (storage substrate)
- [x] Ticket pl-0065 — Project canonical links for context layers (context layer projection)
- [x] Ticket pl-0066 — Project canonical links for execution layers and fix integrity defects (execution layer projection)
- [x] Ticket pl-0067 — Verify and critique the phase-1 cutover (verification and critique)

## Surprises & Discoveries

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Observation: The audited codebase already has the right physical substrate (`entities`, `links`, `events`, `runtime_attachments`), so the highest-leverage first milestone is turning `links` into live graph truth rather than redesigning every package payload first.
  Evidence: DATA_PLANE.md repository-wide audit

- Observation: Ticket deletion and worker durability semantics were the highest-friction execution issues because they exposed where cross-entity writes were only partially coordinated.
  Evidence: The final implementation work had to harden delete cleanup, scheduler sequencing, and snapshot-specific worker durability.

## Decision Log

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Decision: Scope the first implementation milestone around canonical links plus integrity hardening, leaving full event projection and runtime-attachment migration to later milestones.
  Rationale: This is the largest slice that can be completed end-to-end now without leaving partial execution or destabilizing worker runtime behavior.
  Date/Author: 2026-03-19 / pi

- Decision: Keep phase 1 additive by preserving existing typed aggregate payloads while projecting canonical links into the shared graph.
  Rationale: This unlocked shared graph truth without forcing a simultaneous normalization of every nested record family.
  Date/Author: 2026-03-20 / pi

## Outcomes & Retrospective

Phase 1 successfully converted Pi Loom from a blob-dominant entity store into a system with live canonical link projection across the targeted packages. The most valuable design outcome was keeping aggregate payloads intact while making cross-entity relationships queryable. The most difficult engineering work was hardening the write ordering around initiative membership, plan-ticket coordination, ticket deletion cleanup, and worker durability semantics. Later milestones should focus on event projection and runtime-local boundary cleanup rather than relitigating link infrastructure.

## Context and Orientation

Pi Loom already persists canonical entities in SQLite, but almost every package had treated the shared catalog as a document store over `entities.attributes_json`. Phase 1 changes that by making canonical links part of normal persistence across the targeted packages, while preserving rich aggregate payloads and derived review surfaces. The implementation also hardened link lifecycle behavior, initiative membership sequencing, plan-ticket linkage truth, ticket deletion cleanup, and worker durability semantics.

## Projection Context

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Status: completed
- Source target: spec:canonical-graph-cutover-phase-1
- Scope paths: https-github-com-z3z1ma-pi-loom-git:DATA_PLANE.md, https-github-com-z3z1ma-pi-loom-git:packages/pi-constitution, https-github-com-z3z1ma-pi-loom-git:packages/pi-critique, https-github-com-z3z1ma-pi-loom-git:packages/pi-docs, https-github-com-z3z1ma-pi-loom-git:packages/pi-initiatives, https-github-com-z3z1ma-pi-loom-git:packages/pi-plans, https-github-com-z3z1ma-pi-loom-git:packages/pi-ralph, https-github-com-z3z1ma-pi-loom-git:packages/pi-research, https-github-com-z3z1ma-pi-loom-git:packages/pi-specs, https-github-com-z3z1ma-pi-loom-git:packages/pi-storage, https-github-com-z3z1ma-pi-loom-git:packages/pi-ticketing, https-github-com-z3z1ma-pi-loom-git:packages/pi-workers
- Roadmap: item-001
- Initiatives: canonical-shared-data-plane
- Research: sqlite-data-plane-audit-and-enrichment-opportunities
- Specs: canonical-graph-cutover-phase-1
- Tickets: pl-0064, pl-0065, pl-0066, pl-0067

## Milestones

1. Storage substrate can remove and synchronize canonical links. Completed.
2. Context-layer packages project canonical links from their existing references. Completed.
3. Execution-layer packages project canonical links and the known integrity defects are fixed. Completed.
4. Targeted verification passes and the addressed critique findings are incorporated. Completed.

## Plan of Work

Completed. The storage substrate was extended first, then context-layer and execution-layer stores were cut over to project canonical links, then targeted regressions and verification were used to close the remaining integrity gaps.

## Concrete Steps

Completed work included: shared link lifecycle support in `pi-storage`; canonical link projection in constitution, research, initiatives, specs, docs, plans, tickets, workers, critique, and Ralph; initiative research update support in models/commands/tools; transactional ticket writes; plan cleanup when tickets are deleted; and worker durability hardening for async APIs and scheduler flows.

## Validation and Acceptance

Observed proof of completion: `npm run test` passed with 19 files / 40 tests; targeted integration verification passed with 9 files / 29 tests; targeted static `tsc` over the changed files passed; targeted Biome checks over the changed files passed.

## Idempotence and Recovery

The cutover remains additive with respect to package payloads: canonical links are projected from existing state rather than replacing aggregate payloads. Re-running persistence converges managed link sets. Regression coverage now includes context-layer projection, execution-layer projection, initiative rollback/update semantics, plan cleanup for deleted tickets, and worker durability behaviors.

## Artifacts and Notes

Primary artifacts: `DATA_PLANE.md`, initiative `canonical-shared-data-plane`, spec `canonical-graph-cutover-phase-1`, plan `phase-1-graph-cutover-execution-plan`, and tickets `pl-0064` through `pl-0067`. The user explicitly directed stopping additional adversarial review cycles after the remaining findings were addressed, so completion relies on the passing verification bundle plus the fixes applied from prior critique findings.

## Interfaces and Dependencies

The milestone depends on `LoomCanonicalStorage`, package persist paths, and the new `syncProjectedEntityLinks` / `assertProjectedEntityLinksResolvable` helpers. The implemented graph now complements ticketing, plans, and workers instead of replacing those layers. Future milestones can build on this without revisiting the core link lifecycle substrate.

## Linked Tickets

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- pl-0064 [closed] Add storage link lifecycle support — storage substrate
- pl-0065 [closed] Project canonical links for context layers — context layer projection
- pl-0066 [closed] Project canonical links for execution layers and fix integrity defects — execution layer projection
- pl-0067 [closed] Verify and critique the phase-1 cutover — verification and critique

## Risks and Open Questions

Remaining strategic work is intentionally deferred outside this completed plan: event-plane expansion, runtime-attachment cleanup, and deciding which nested record families should become first-class canonical records. No additional phases exist inside this plan; later milestones should be captured in a new plan rather than pretending phase 1 included them.

## Revision Notes

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- 2026-03-19T01:06:00.000Z — Initial plan created.
  Reason: Translate the finalized phase-1 spec into a durable execution strategy linked to projected tickets.

- 2026-03-19T01:12:57.607Z — Created durable workplan scaffold from spec:canonical-graph-cutover-phase-1.
  Reason: Establish a self-contained execution-strategy artifact that can be resumed without prior chat context.

- 2026-03-19T01:13:10.865Z — Linked ticket pl-0067 as verification and critique.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-19T01:13:38.163Z — Linked ticket pl-0064 as storage substrate.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-19T01:13:45.943Z — Linked ticket pl-0065 as context layer projection.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-19T01:13:51.740Z — Linked ticket pl-0066 as execution layer projection.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-19T01:06:00.000Z — Initial plan created.
  Reason: Translate the finalized phase-1 spec into a durable execution strategy linked to projected tickets.

- 2026-03-19T01:12:57.607Z — Created durable workplan scaffold from spec:canonical-graph-cutover-phase-1.
  Reason: Establish a self-contained execution-strategy artifact that can be resumed without prior chat context.

- 2026-03-19T01:13:10.865Z — Linked ticket pl-0067 as verification and critique.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-19T01:13:38.163Z — Linked ticket pl-0064 as storage substrate.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-19T01:13:45.943Z — Linked ticket pl-0065 as context layer projection.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-19T01:13:51.740Z — Linked ticket pl-0066 as execution layer projection.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-20T00:24:35.000Z — Marked the phase-1 graph cutover complete.
  Reason: All bounded milestone work landed and the final verification bundle passed cleanly.

- 2026-03-19T07:26:37.596Z — Updated title, status, summary, purpose, context and orientation, milestones, plan of work, concrete steps, validation, idempotence and recovery, artifacts and notes, interfaces and dependencies, risks and open questions, outcomes and retrospective, scope paths, source target, context refs, progress, surprises and discoveries, decision log, revision notes.
  Reason: Keep the workplan aligned with the current execution strategy and observable validation story.
