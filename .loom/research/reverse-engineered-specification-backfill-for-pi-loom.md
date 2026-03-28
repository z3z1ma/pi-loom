---
id: reverse-engineered-specification-backfill-for-pi-loom
title: "Reverse-engineered specification backfill for pi-loom"
status: synthesized
created-at: 2026-03-28T03:43:25.060Z
tags:
  - architecture
  - reverse-engineering
  - specification
source-refs:
  - CONSTITUTION.md
  - constitution/index.ts
  - critique/index.ts
  - DATA_PLANE.md
  - docs/index.ts
  - docs/README.md
  - initiatives/index.ts
  - plans/index.ts
  - plans/README.md
  - ralph/index.ts
  - ralph/README.md
  - README.md
  - research/index.ts
  - specs/index.ts
  - specs/README.md
  - storage/contract.ts
  - storage/projections.ts
  - storage/README.md
  - ticketing/index.ts
  - ticketing/README.md
---

## Question
How can pi-loom's current codebase be translated into durable, high-fidelity behavior-first specifications without duplicating existing finalized specs or misrepresenting implementation details as the contract?

## Objective
Establish a reusable evidence base for backfilling missing Loom specifications from the current repository state, capturing subsystem boundaries, canonical-vs-derived storage rules, lifecycle semantics, fail-closed scope behaviors, and the major behavior slices that should become finalized specs.

## Status Summary
The first-pass reverse-engineering effort is complete. Ten new finalized subsystem specs now cover canonical storage, constitution, research, initiatives, spec lifecycle, plans, tickets, critique, Ralph orchestration, and bounded documentation maintenance, while existing finalized specs continue to own multi-repository spaces and documentation governance.

## Scope
- Derive candidate bounded spec slices for the remaining major systems: storage substrate, constitution, research, initiatives, spec lifecycle, plans, tickets, critique, Ralph orchestration, and docs maintenance.
- Identify which major subsystem contracts already have finalized coverage and which remain missing.
- Reverse-engineer current behavior from README, CONSTITUTION.md, DATA_PLANE.md, storage contract/docs, layer READMEs, representative index/store/tool files, and durable memory state.

## Non-Goals
- Do not duplicate existing finalized specs for multi-repository spaces, workspace projections, or curated documentation governance.
- Do not redesign Loom architecture beyond what current durable code and docs support.
- Do not turn specs into implementation task lists or migration plans.

## Methodology
- Cross-check derived subsystem boundaries against durable storage and projection rules before drafting specs.
- Inspect constitutional memory and existing spec corpus first to avoid forking strategic truth.
- Prefer behavior-first statements that remain true if implementation details change, while still grounding every claim in current code or documentation evidence.
- Read repository-level docs plus subsystem READMEs and representative source files for each layer.

## Keywords
- behavior-contracts
- canonical-storage
- loom-layers
- reverse-engineering
- spec-backfill

## Conclusions
- One broad behavior-first spec per missing major subsystem provided strong initial coverage while still leaving room for future narrower superseding specs if deeper decomposition becomes useful.
- The current repository supported a truthful first-pass subsystem spec backfill without duplicating the existing finalized specs for multi-repository spaces or documentation governance.

## Recommendations
- Open follow-up research or narrower superseding specs only when a future body of work needs more detailed bounded contracts than the first-pass subsystem specs provide.
- Use the new finalized specs as the default upstream contract source before future planning, ticketing, or refactoring work touches these subsystems.

## Open Questions
- Which subsystem areas, if any, should next be decomposed into second-pass narrower specs once future execution work reveals pressure on the current broad contracts?

## Linked Work
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

- initiative:subsystem-specification-backfill

## Hypotheses
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

- hyp-001 [supported/medium] The current repository already exposes sufficiently stable layer boundaries, storage rules, lifecycle semantics, and fail-closed behaviors to support a first-pass set of subsystem-level specifications that remain truthful even if local implementation details later change.
  Evidence: Constitutional brief and README define a stable nine-layer Loom stack with explicit role boundaries.; Existing finalized specs already cover cross-cutting areas such as multi-repository spaces and documentation governance, leaving clear gaps for the remaining subsystems rather than a fragmented partial overlap.; Layer READMEs and index.ts entrypoints consistently reinforce SQLite-backed canonical state, derived review surfaces, session_start ledger initialization, and before_agent_start prompt augmentation.
  Results: Subsystem contracts are stable enough to draft behavior-first specs for storage, constitution, research, initiatives, spec lifecycle, plans, tickets, critique, Ralph orchestration, and docs maintenance.

## Artifacts
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

- artifact-001 [summary] Initial subsystem source map for spec backfill (hyp-001)
- artifact-002 [summary] First-pass subsystem spec inventory (hyp-001)
- artifact-003 [summary] Execution-layer evidence for first-pass subsystem specs (hyp-001) — agent://2-ExecutionLayers
- artifact-004 [summary] Ralph runtime and scope evidence for subsystem specs (hyp-001) — agent://3-RalphRuntime
- artifact-005 [summary] Preparation-layer evidence for subsystem specs (hyp-001) — agent://1-PreparationLayers
- artifact-006 [summary] Foundational storage and projection evidence for subsystem specs (hyp-001) — agent://0-FoundationalLayers
