---
id: human-editable-workspace-projections-for-canonical-loom-records
title: "Human-editable workspace projections for canonical Loom records"
status: active
created-at: 2026-03-26T06:10:22.353Z
tags:
  - architecture
  - brainstorm
  - projection
  - storage
  - ux
source-refs:
  - AGENTS.md
  - README.md
  - storage/artifacts.ts
  - storage/README.md
  - storage/sync.ts
---

## Question
How should Pi Loom expose human-readable and human-editable repository-visible surfaces for specs, plans, tickets, and related interactive-side artifacts while keeping SQLite/Postgres as canonical truth?

## Objective
Map the option space for derived repo-visible projections, import/export semantics, identity linkage, triggers, and conflict handling so later spec and plan work can choose a coherent projection architecture instead of ad hoc markdown exports.

## Status Summary
Architectural synthesis is active and ready to feed a future spec. The repository already treats packets and markdown as derived exports and has reusable sync primitives, but no durable design yet covers editable repo-visible projections for left-side interactive artifacts.

## Scope
- Human-readable and human-editable projections for specs, plans, tickets, and related left-side interactive Loom artifacts
- Identity, revision, and conflict semantics for bidirectional editing
- Interaction between canonical SQLite/Postgres state and repo-visible markdown or structured files
- Trigger models for export/import/autosync

## Non-Goals
- Changing packet semantics for Ralph, critique, or docs execution handoffs
- Designing a full UI implementation
- Replacing SQLite/Postgres as the canonical store
- Specifying exact storage migrations or final file tree names

## Methodology
- Inspect storage sync-bundle and projected-artifact primitives for reusable mechanisms
- Read constitutional brief and README guidance for canonical truth vs derived exports
- Search existing durable research/docs/plans for prior decisions
- Synthesize design branches and tradeoffs at the architecture level

## Keywords
- bidirectional sync
- canonical storage
- human UX
- markdown
- plans
- projection
- specs
- sync
- tickets
- workspace exports

## Conclusions
- Canonical storage should remain primary; repo-visible files should behave as projections anchored to canonical refs and revisions rather than as competing truth.
- Different Loom layers need different mutability semantics: specs may freeze, plans remain revisable, tickets are live ledgers, and critique/docs have their own revision rules, so one generic round-trip format is likely too coarse.
- The core gap is not packet generation; it is human introspectability and controlled editability for canonical records that currently live only in SQLite/Postgres.
- The safest near-term direction is explicit projection export/import for a narrow editable artifact set instead of immediate always-on bidirectional sync.

## Recommendations
- Create a first-class workspace projection subsystem distinct from execution packets.
- Delay always-on filesystem watchers or auto-sync until explicit export/import semantics, conflict UX, and audit behavior are proven.
- Start with editable projections for specs, plans, tickets, and possibly docs; keep critique and Ralph packets read-only handoff artifacts.
- Treat file imports as canonical mutations against a declared base revision; reject or stage conflicts rather than silently overwriting newer DB state.
- Use structured markdown or markdown plus machine-readable manifest carrying canonical ref, repository-qualified path identity, and base revision/version tokens.

## Open Questions
- How should multi-repository spaces materialize repository-qualified projections without confusing repository-local git workflows?
- Is pure markdown round-tripping sufficient, or do we need a sidecar manifest to avoid lossy parsing of structured child records and links?
- Should a conflicting disk edit create a proposed revision, a conflict record, or a follow-up ticket instead of a direct mutation?
- Should editable projections live under a single repo-visible namespace such as `.loom/`, or under artifact-family directories optimized for reviewability?
- What exact subset of each artifact should remain human-editable versus generated read-only sections derived from canonical child records?

## Linked Work
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)

## Hypotheses
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)

## Artifacts
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

- artifact-001 [summary] 
- artifact-002 [note] Operator refinements to projection scope and layout
