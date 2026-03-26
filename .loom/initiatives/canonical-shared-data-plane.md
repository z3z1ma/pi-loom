---
id: canonical-shared-data-plane
title: "Canonical shared data plane"
status: completed
created-at: 2026-03-19T01:05:58.604Z
updated-at: 2026-03-19T15:54:17.415Z
owners:
  - pi
tags:
  - canonical-storage
  - data-plane
  - sqlite
research:
  - sqlite-data-plane-audit-and-enrichment-opportunities
spec-changes:
  - canonical-data-plane-completion
  - canonical-graph-cutover-phase-1
tickets:
  - pl-0064
  - pl-0065
  - pl-0066
  - pl-0067
  - pl-0068
  - pl-0069
  - pl-0070
  - pl-0071
capabilities: []
roadmap-refs:
  - item-001
---

## Objective
Turn Pi Loom's SQLite substrate into a true shared coordination plane where entities remain richly typed, links carry cross-layer graph truth, events carry lifecycle truth, and runtime attachments isolate clone-local execution state.

## Outcomes
- Canonical lifecycle and mutation events are active for the completed write flows.
- Canonical links are active across the targeted package stores.
- DATA_PLANE.md now documents the accepted adapter-facing contract.
- Research artifacts, critique findings, Ralph iterations, and worker checkpoints are first-class canonical artifact entities.
- Worker launch/process state is isolated in runtime attachments.

## Scope
- Context and execution package stores that participate in the current cutover
- Storage contract/helpers in packages/pi-storage
- Top-level data-plane documentation and verification suite

## Non-Goals
- Broadening the same contract to every possible child-record family beyond the completed first wave.
- Postgres backend work or external harness adapter implementation.

## Success Metrics
- Changed-file static checks passed.
- Final critique resolved with verdict pass.
- Targeted integration tests passed.
- Targeted unit tests passed.

## Status Summary
The internal data-plane completion milestone is finished: the canonical entity/link/event/runtime/artifact contract is implemented, verified, and critiqued.

## Risks
- Future work still needs to decide which later child-record families become first-class canonical records versus remain embedded projections.

## Linked Roadmap
- item-001 [now/completed] Canonical data plane cutover milestone — The first major cutover milestone is complete: Pi Loom now treats SQLite-backed entities, links, events, runtime attachments, and selected artifact projections as canonical truth across the implemented packages.

## Milestones
- milestone-001: Phase 1 graph cutover [completed]
  Description: Project canonical links from existing package payloads, fix known integrity bugs, and leave a verified foundation for later event-plane and runtime-boundary work.
  Specs: canonical-graph-cutover-phase-1
  Tickets: pl-0064, pl-0065, pl-0066, pl-0067
- milestone-002: Phase 1 graph cutover [in_progress]
  Description: Project canonical links from existing package payloads, fix known integrity bugs, and leave a validated plan/ticket/critique trail for the next data plane milestones.

## Strategic Decisions
(none)
