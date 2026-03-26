---
id: workspace-backed-manager-worker-coordination
title: "Workspace-backed manager-worker coordination"
status: completed
created-at: 2026-03-15T23:55:42.572Z
updated-at: 2026-03-16T05:14:25.711Z
owners: []
tags:
  - architecture
  - manager-worker
  - orchestration
  - workspace
research:
  - evaluate-pi-control-surfaces-for-long-lived-workers
  - prepare-manager-worker-architecture-from-pi-supervisor-and-pi-extension-interfaces
spec-changes:
  - add-inbox-driven-manager-worker-control-plane
  - add-workspace-backed-manager-worker-substrate
tickets:
  - pl-0015
  - pl-0016
  - pl-0017
  - pl-0018
  - pl-0019
  - pl-0020
  - pl-0021
  - pl-0022
  - pl-0023
  - pl-0024
  - pl-0025
  - pl-0026
  - pl-0031
  - pl-0032
  - pl-0033
  - pl-0034
  - pl-0035
  - pl-0036
  - pl-0037
  - pl-0038
  - pl-0039
capabilities: []
roadmap-refs:
  - item-007
---

## Objective
Develop a truthful manager-worker operating model for Pi Loom in which workers are ephemeral workspaces, managers supervise and consolidate bounded execution across those workspaces, and the resulting system composes cleanly with plans, tickets, Ralph, critique, and documentation.

## Outcomes
- Broader coordination surfaces are introduced only through bounded, repo-truthful primitives that preserve tickets as the live execution ledger and keep Ralph bounded.
- Future implementation work can proceed from a finalized spec rather than from chat-only reasoning or overloaded session/task abstractions.
- Pi Loom evolves beyond one-shot subprocess workers toward a more useful manager-worker control plane informed by SDK/RPC runtime research without prematurely overcommitting to a full actor mesh.
- Pi Loom has a durable architectural contract for workspace-backed workers, manager oversight, worker-manager messaging, checkpoints, and consolidation.

## Scope
- Constrain optional peer broadcast so it remains bounded and does not replace manager-mediated coordination.
- Define manager responsibilities for assignment, supervision, unblock/escalation, approval, and fan-in/merge.
- Define the durable records and layer boundaries needed to integrate manager-worker execution with tickets, plans, Ralph, critique, and docs.
- Define workers as ephemeral workspace-backed execution units rather than as session branches or generic subagents.
- Evaluate and plan the next runtime/control-plane evolution for inbox-driven, more autonomous manager-worker operation.

## Non-Goals
- Claim multi-repository coordination, model-routing systems, or unrestricted peer meshes as current Pi Loom truth.
- Implement the runtime in this initiative record.
- Turn Ralph into a general workflow engine.

## Success Metrics
- A comprehensive spec is finalized with detailed capabilities, requirements, tasks, and acceptance criteria for the manager-worker substrate.
- A durable next-phase plan exists that sequences the move from one-shot workers toward a more useful inbox-aware manager-worker control plane, grounded in documented Pi SDK/RPC surfaces.
- The initiative remains explicitly linked to constitutional roadmap item-007 so broader coordination stays framed as a later bounded expansion rather than current core truth.
- The resulting bounded design is clear enough that future tickets can be projected without reopening first-principles architectural questions.

## Status Summary
Completed. Pi Loom now has both the foundational worker substrate and the inbox-driven manager-worker control plane implemented, linked to durable research/spec/plan context and verified under lint, typecheck, tests, and critique.

## Risks
- Jumping to a sidecar/event mesh before the durable inbox protocol and manager loop are solid would add runtime complexity faster than it adds trustworthy behavior.
- Letting Ralph absorb worker state or execution truth would violate existing package and constitutional boundaries.
- Overloading session fork/tree or task spawning semantics instead of introducing a truthful workspace abstraction would bake in a false model.
- Under-specifying manager oversight, worker telemetry, or consolidation contracts would produce a superficially parallel system that is difficult to supervise safely over long horizons.

## Linked Roadmap
(none)

## Milestones
- milestone-001: Finalize manager-worker substrate spec [in_progress]
  Description: Create the durable initiative and a comprehensive specification that defines the workspace-backed manager-worker substrate and its boundaries.

## Strategic Decisions
(none)
