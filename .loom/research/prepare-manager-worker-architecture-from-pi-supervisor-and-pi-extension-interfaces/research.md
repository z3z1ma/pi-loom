---
id: prepare-manager-worker-architecture-from-pi-supervisor-and-pi-extension-interfaces
title: "Prepare manager-worker architecture from pi-supervisor and Pi extension interfaces"
status: synthesized
created-at: 2026-03-15T23:44:27.983Z
updated-at: 2026-03-16T02:37:06.183Z
initiatives:
  - workspace-backed-manager-worker-coordination
specs:
  - add-inbox-driven-manager-worker-control-plane
  - add-workspace-backed-manager-worker-substrate
tickets: []
capabilities: []
artifacts:
  - artifact-001
---

## Question
How should Pi Loom evolve toward a manager-worker architecture grounded in ephemeral workspaces while borrowing the strongest ideas from pi-supervisor's lightweight supervision model?

## Objective
Produce source-backed architectural guidance for a manager-worker operating model that fits Pi Loom's constitutional boundaries, workspace-centric worker abstraction, and current Pi extension/runtime capabilities.

## Status Summary
Research synthesized. pi-supervisor, Pi runtime surfaces, and pi-loom Ralph boundaries were compared to derive a bounded manager-worker direction centered on workspace-backed workers and out-of-band supervision.

## Scope
- .agents/resources/pi-supervisor
- .loom/constitution
- CONSTITUTION.md
- packages/pi-*/extensions
- README.md
- related reference resources under .agents/resources

## Non-Goals
- Claim runtime capabilities not supported by current Pi or repository code
- Design a full generic workflow engine that erases current Loom layer boundaries
- Implement the architecture

## Methodology
- Compare findings against desired manager-worker model and derive bounded recommendations
- Inspect constitutional and repository guidance first
- Study Pi extension interface and nearby examples for supported hooks/runtime surfaces
- Study pi-supervisor design and source implementation

## Keywords
- extension interface
- manager-worker
- orchestration
- pi-supervisor
- workspace
- worktree

## Hypotheses
- hyp-001 [supported/high] A lightweight out-of-band supervisor session can monitor and steer a worker effectively without sharing the worker's full context window, as long as it observes compact session artifacts plus recent conversation deltas.
  Evidence: .agents/resources/pi-supervisor/README.md:23-27; .agents/resources/pi-supervisor/src/engine.ts:111-221; .agents/resources/pi-supervisor/src/index.ts:69-145; .agents/resources/pi-supervisor/src/model-client.ts:25-47
  Results: pi-supervisor uses a fresh in-memory agent session with no tools/extensions and small snapshot inputs, yet can steer mid-run or idle by injecting targeted messages.
- hyp-002 [supported/high] Current Pi extension and task/session runtime surfaces are sufficient for bounded subprocess/session orchestration, but they do not yet provide an explicit workspace-backed worker abstraction or Git-worktree lifecycle.
  Evidence: .agents/resources/oh-my-pi/docs/extensions.md:129-164; .agents/resources/oh-my-pi/docs/session-operations-export-share-fork-resume.md:138-238; .agents/resources/oh-my-pi/docs/session-tree-plan.md:64-105; .agents/resources/oh-my-pi/docs/task-agent-discovery.md:170-203
  Results: Existing primitives cover message injection, session fork/branch/switch, and bounded subprocess spawning, but documented semantics stay at session/process level and keep cwd unchanged for forked sessions.
- hyp-003 [supported/high] Manager-worker support should be modeled as a new workspace-aware execution mechanism that Ralph may invoke and observe at run boundaries, rather than by turning Ralph itself into a general workflow engine.
  Evidence: packages/pi-plans/README.md:12-13,19-21; packages/pi-ralph/extensions/domain/runtime.ts:126-197; packages/pi-ralph/README.md:20-25; packages/pi-ralph/README.md:31,35
  Results: Ralph is explicitly bounded, run-centric, and single-subprocess today; plans/tickets already own execution strategy and live execution state.

## Conclusions
- Current Pi runtime surfaces support extension-based observation, message injection, bounded subprocess/task spawning, and session branch/fork flows, but they do not currently provide an explicit workspace/worktree-backed worker abstraction.
- Pi Loom’s current constitutional and package boundaries explicitly keep Ralph bounded and tickets as the live execution ledger. Manager-worker should therefore be introduced as a new workspace-aware execution mechanism that Ralph or plans may invoke and observe, not by turning Ralph into a general workflow engine.
- pi-supervisor demonstrates a reusable lightweight oversight pattern: supervise a worker from a separate in-memory Pi session using compact session snapshots, intervention history, and recent deltas rather than sharing full worker context.

## Recommendations
- Add explicit workspace lifecycle and worker messaging contracts rather than overloading current session fork/tree primitives, which are conversation-log operations and keep cwd unchanged.
- Design worker communication to be durable and headless-safe: inbox/outbox/broadcast records and structured telemetry should be canonical, with UI widgets as optional views rather than required control surfaces.
- Keep fan-out/fan-in accountable through existing Loom boundaries: plans remain execution strategy, tickets remain live execution state, Ralph remains bounded loop orchestration, and manager-worker supplies workspace execution plus consolidation.
- Model worker identity around an ephemeral workspace plus Pi session, inbox/outbox, ticket attachment, and durable telemetry instead of around session-tree branching alone.
- Reuse pi-supervisor’s outside-observer pattern for manager oversight: a manager should monitor compact worker telemetry and recent message deltas, intervene differently when a worker is busy vs idle, and avoid living inside the worker’s context window.

## Open Questions
- What structured telemetry and merge/review contract must a worker expose so a manager can approve completion and safely consolidate work from multiple workspaces?
- Which Loom layer or package should own workspace records and worker inbox/outbox state so that manager-worker stays truthful without duplicating ticket or Ralph responsibilities?

## Linked Work
- initiative:workspace-backed-manager-worker-coordination
- spec:add-inbox-driven-manager-worker-control-plane
- spec:add-workspace-backed-manager-worker-substrate

## Artifacts
- artifact-001 [summary] Manager-worker architecture prep synthesis (hyp-001, hyp-002, hyp-003)
