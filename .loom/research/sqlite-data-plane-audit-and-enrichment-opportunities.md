---
id: sqlite-data-plane-audit-and-enrichment-opportunities
title: "SQLite data plane audit and enrichment opportunities"
status: synthesized
created-at: 2026-03-19T00:42:16.587Z
tags:
  - canonical-storage
  - data-plane
  - sqlite
source-refs:
  - critique:data-plane-completion-final-review
  - DATA_PLANE.md
  - plan:data-plane-completion-execution-plan
---

## Question
What is Pi Loom's current SQLite-backed data model across all packages, where is information rich or thin, and what structural changes would most improve linkage, correctness, and adapter portability?

## Objective
Produce a durable inventory of the current canonical storage model and use it to identify enrichment, correctness, and cross-layer linkage improvements for the Loom data plane.

## Status Summary
The audit has now been fully executed downstream: phase 1 and the completion cutover both landed, and the accepted contract is entity snapshots plus canonical links, canonical events, runtime attachments, and selected artifact child entities.

## Scope
- All package store persistence models
- Cross-package links, events, runtime attachments, and child projections
- Pi Loom storage substrate

## Non-Goals
- External adapter implementations
- Postgres migration execution

## Methodology
- Audit each package's canonical storage usage and field model.
- Define phased cutover slices and then execute them.
- Identify correctness defects and underused substrate primitives.

## Keywords
- artifacts
- canonical-storage
- data-plane
- events
- links
- runtime-attachments
- sqlite

## Conclusions
- Correctness work during the completion cutover focused on link/event compensation, critique durable-write boundaries, and truthful runtime separation.
- Pi Loom no longer behaves only as a family of package-local entity blobs; the canonical graph, event, runtime, and artifact planes are now active for the implemented slice.
- The highest-leverage first-wave child projections were research artifacts, critique findings, Ralph iterations, and worker checkpoints.

## Recommendations
- Treat DATA_PLANE.md as the adapter-facing contract for the completed internal cutover.
- Use future specs to broaden event and artifact coverage only where adapters gain real leverage rather than normalizing everything reflexively.

## Open Questions
- Which later child-record families should become first-class canonical records versus remain embedded projections?

## Linked Work
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

- initiative:canonical-shared-data-plane
- spec:canonical-data-plane-completion
- spec:canonical-graph-cutover-phase-1
- ticket:pl-0064
- ticket:pl-0065
- ticket:pl-0066
- ticket:pl-0067
- ticket:pl-0068
- ticket:pl-0069
- ticket:pl-0070
- ticket:pl-0071

## Hypotheses
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)

## Artifacts
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)
