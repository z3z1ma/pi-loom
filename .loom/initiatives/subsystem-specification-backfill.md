---
id: subsystem-specification-backfill
title: "Subsystem specification backfill"
status: completed
created-at: 2026-03-28T03:45:33.353Z
updated-at: 2026-03-28T03:59:13.542Z
owners:
  - "AI session"
tags:
  - architecture
  - durability
  - specification
research:
  - reverse-engineered-specification-backfill-for-pi-loom
spec-changes: []
tickets: []
capabilities: []
roadmap-refs: []
---

## Objective
Backfill durable, finalized, high-fidelity specifications for the major pi-loom subsystems by reverse-engineering the current codebase into behavior-first contracts that can later anchor regeneration, review, and future implementation work.

## Outcomes
- A materially broader finalized spec corpus now covers the major Loom subsystems not already captured by existing finalized specs.
- The repository now has durable parent contracts for the storage substrate, preparation layers, execution layers, critique, Ralph, and documentation maintenance.
- The subsystem backfill effort is now discoverable through linked initiative, research, and plan records rather than only through chat.

## Scope
- Create or refine subsystem-level specs for missing major contracts across storage, collaborative-preparation layers, execution-planning layers, critique, Ralph orchestration, and docs maintenance.
- Link the new specs to one strategic context so later expansion and follow-up work can remain coordinated.
- Use current code and repository docs as evidence, while avoiding overlap with existing finalized specs for multi-repository spaces and curated documentation governance.

## Non-Goals
- Do not create implementation tickets or redesign the architecture beyond what current accepted behavior already supports.
- Do not rewrite existing finalized specs unless evidence shows they are wrong.
- Do not treat this initiative as a replacement for future finer-grained specs where additional bounded contracts later deserve their own artifacts.

## Success Metrics
- Each new spec remains behavior-first, implementation-decoupled, and non-overlapping with existing finalized coverage.
- Future planning or execution work can link to a stable spec rather than reconstructing intent from code archaeology.
- The major missing subsystem contracts are represented by finalized specs with concrete capabilities, requirements, scenarios, and acceptance criteria.

## Status Summary
Completed the first-pass subsystem backfill with ten new finalized specs: canonical-loom-storage-substrate, constitutional-memory-management, research-knowledge-records, strategic-initiative-tracking, durable-specification-lifecycle, execution-planning-and-linked-rollout-strategy, ticket-execution-ledger, durable-adversarial-critique, ticket-bound-ralph-orchestration, and bounded-documentation-maintenance. Existing finalized specs for multi-repository spaces and documentation governance remain the adjacent boundaries for those cross-cutting topics.

## Risks
- Broad subsystem specs may still want narrower follow-up specs later when future work targets more detailed contracts.
- Future code changes can still drift from the new specs if later work stops treating them as the upstream contract.

## Linked Roadmap
(none)

## Milestones
- milestone-001: First-pass subsystem contract coverage [in_progress]
  Description: Create the first broad set of finalized subsystem specs for major pi-loom behavior not already covered by existing finalized specs.

## Strategic Decisions
- 2026-03-28T03:59:13.542Z [clarification] Why does the initiative record summarize the created subsystem spec inventory textually instead of exposing formal linked spec membership? -> The first-pass subsystem specs were finalized before attempting initiative/research membership updates. Under the current workflow, finalized specs reject later initiative or research link mutations, so the initiative preserves the created spec inventory in its status summary and milestone description instead of storing direct linked spec membership. This is a workflow limitation, not absence of created specs.
