---
id: add-workspace-backed-manager-worker-substrate
title: "Add workspace-backed manager-worker substrate"
status: finalized
created-at: 2026-03-15T23:56:44.247Z
updated-at: 2026-03-16T00:03:16.511Z
research:
  - prepare-manager-worker-architecture-from-pi-supervisor-and-pi-extension-interfaces
initiatives:
  - workspace-backed-manager-worker-coordination
---

## Task Graph
- task-001: Scaffold pi-workers package and worker ledger
  Summary: Create the new extension package, README, index wiring, prompt guidance hooks, and `.loom/workers/` ledger bootstrap so the worker substrate has a truthful home in the repository.
  Requirements: req-001, req-002, req-003
  Capabilities: workspace-backed-worker-records
  Acceptance: `packages/pi-workers/` follows existing package conventions and initializes `.loom/workers/` on session start.; Creating a worker writes the canonical artifact skeleton plus a runtime-only launch descriptor path that is ignored from committed truth.; Package guidance teaches the agent that workers are workspace-backed execution units, not session branches or generic subagents.
- task-002: Model worker state and portable workspace descriptors
  Summary: Implement canonical worker models, normalization, rendering, and store behavior for stable worker identity, linked refs, lifecycle states, objectives, and portable workspace metadata.
  Requirements: req-001, req-002, req-004, req-006, req-019
  Capabilities: loom-boundary-and-provenance-integration, workspace-backed-worker-records, workspace-lifecycle-and-runtime-attachments
  Dependencies: task-001
  Acceptance: Logical workspace descriptors remain portable while runtime-only attachments can vary per machine.; Rendered worker markdown and state views expose enough information to inspect assignment and lifecycle without opening raw JSON.; Worker state persists stable identity, linked refs, lifecycle status, and workspace intent without clone-local absolute paths.
- task-003: Implement workspace provisioning and runtime attachment adapters
  Summary: Add workspace lifecycle operations and subprocess-backed runtime launch/resume support for Git-worktree-backed workers while keeping machine-local attachment details out of canonical state.
  Requirements: req-004, req-005, req-006, req-023
  Capabilities: headless-operator-surface-and-recovery, workspace-lifecycle-and-runtime-attachments
  Dependencies: task-001, task-002
  Acceptance: A worker can transition from requested to provisioned and ready once a Git worktree attachment is materialized.; Launch and resume adapters can reconstruct runtime attachment from durable metadata plus runtime-only descriptor state.; No implementation path treats session fork/tree as the primary workspace isolation mechanism.
- task-004: Persist durable message streams and broadcast semantics
  Summary: Implement append-only worker messaging with manager-to-worker, worker-to-manager, and bounded broadcast records, including causal links, delivery status, and related Loom refs.
  Requirements: req-007, req-008, req-009
  Capabilities: durable-manager-worker-messaging
  Dependencies: task-001, task-002
  Acceptance: Broadcast messages are durably recorded with explicit scope and manager visibility.; Managers and workers can exchange structured messages that survive process restart and remain inspectable in durable records.; Message records preserve related ticket/spec/plan refs and disposition state rather than anonymous prose.
- task-005: Add checkpoints telemetry and worker dashboards
  Summary: Implement checkpoint recording, heartbeat/telemetry summaries, dashboard generation, and worker packets that expose progress, blockers, approvals, and stale-state detection.
  Requirements: req-010, req-011, req-012
  Capabilities: checkpoint-telemetry-and-observability
  Dependencies: task-001, task-002, task-004
  Acceptance: A fresh manager session can understand worker progress from durable checkpoint and dashboard state without replaying the transcript.; Dashboards and packets show stale heartbeats, pending approvals, blockers, and consolidation readiness at a glance.; Workers append structured checkpoints with recent changes, validation state, blockers, and next intended actions.
- task-006: Build the manager supervisory control engine
  Summary: Implement the out-of-band supervision policy that evaluates compact worker telemetry, distinguishes busy versus idle phases, persists interventions, and enforces anti-stagnation rules.
  Requirements: req-013, req-014, req-015
  Capabilities: out-of-band-supervisory-control
  Dependencies: task-004, task-005
  Acceptance: Busy workers are not interrupted indiscriminately, while idle or blocked workers always receive timely approval, redirection, or escalation.; Manager interventions persist durably and can be audited later.; Repeated no-progress or repeated-blocker patterns trigger explicit escalation, reassignment, retirement, or other anti-stagnation outcomes instead of endless steering loops.
- task-007: Implement completion requests and approval workflow
  Summary: Add structured completion payloads, explicit manager approval/rejection/escalation actions, and worker state transitions around completion_requested and approved_for_consolidation.
  Requirements: req-017, req-018
  Capabilities: completion-approval-and-consolidation
  Dependencies: task-005, task-006
  Acceptance: Managers can approve, reject for revision, or escalate with durable rationale.; Worker lifecycle records make it obvious whether a worker is waiting for approval, approved for fan-in, or sent back for more work.; Workers cannot become complete by prose alone and must submit structured completion evidence.
- task-008: Implement consolidation and fan-in outcomes
  Summary: Add the manager-owned consolidation flow that applies approved worker changes into the target branch or execution stream and records merge strategy, validation, conflict, and rollback outcomes durably.
  Requirements: req-016, req-017, req-018, req-021
  Capabilities: completion-approval-and-consolidation, loom-boundary-and-provenance-integration
  Dependencies: task-003, task-007
  Acceptance: Approved workers can be consolidated through explicit strategies such as merge, cherry-pick, or patch application.; Conflict, validation failure, rollback, or follow-up requirements are captured durably instead of disappearing into chat.; Tickets can be updated with key approval and consolidation outcomes without worker state replacing ticket truth.
- task-009: Integrate worker provenance with tickets plans Ralph critique and docs
  Summary: Wire worker records into surrounding Loom layers through explicit refs, packet content, and update hooks while preserving each layer’s canonical role.
  Requirements: req-019, req-020, req-021
  Capabilities: loom-boundary-and-provenance-integration
  Dependencies: task-002, task-005, task-008
  Acceptance: Plans and Ralph can observe or launch worker-manager execution without absorbing worker internals into their own state.; Ticket history remains the live execution ledger even when workers contribute checkpoints, approvals, and consolidation results.; Workers can link to tickets, plans, specs, initiatives, research, critiques, Ralph runs, and docs through explicit refs.
- task-010: Expose worker commands tools and prompt guidance
  Summary: Provide `/worker` commands, `worker_*` tools, and prompt guidance for creating, launching, messaging, approving, resuming, retiring, and inspecting workers in both interactive and headless flows.
  Requirements: req-022, req-024
  Capabilities: headless-operator-surface-and-recovery
  Dependencies: task-003, task-004, task-005, task-007
  Acceptance: Operators and agents can manage workers entirely through supported command and tool surfaces without hand-editing files.; Prompt guidance teaches the right boundaries: workers are workspace-backed units, managers supervise out-of-band, tickets remain execution truth, and Ralph stays bounded.; The surface works correctly in headless contexts where UI widgets are unavailable.
- task-011: Harden recovery resume and retirement flows
  Summary: Implement deterministic recovery behavior for interrupted workers, stale runtime attachments, retire/cleanup flows, and safe resume after process turnover.
  Requirements: req-022, req-023
  Capabilities: headless-operator-surface-and-recovery, workspace-lifecycle-and-runtime-attachments
  Dependencies: task-003, task-005, task-010
  Acceptance: A new manager session can inspect durable state and either resume or retire a worker without relying on the original transcript or live process.; Recovery paths work even when the previous machine-local worktree path is gone and must be reprovisioned.; Retirement and cleanup preserve durable worker history while making it clear that the runtime attachment is no longer active.
- task-012: Cover worker substrate with tests and operator documentation
  Summary: Add comprehensive tests for state persistence, path portability, launch/resume behavior, messaging, supervision, approval, consolidation, and neighboring-layer integration, then update package documentation to explain truthful usage.
  Requirements: req-001, req-005, req-014, req-016, req-021, req-024
  Capabilities: checkpoint-telemetry-and-observability, completion-approval-and-consolidation, durable-manager-worker-messaging, headless-operator-surface-and-recovery, loom-boundary-and-provenance-integration, out-of-band-supervisory-control, workspace-backed-worker-records, workspace-lifecycle-and-runtime-attachments
  Dependencies: task-006, task-008, task-009, task-010, task-011
  Acceptance: Automated tests prove portable-path handling, worker lifecycle transitions, supervision decisions, completion approvals, and consolidation outcomes.; Failure-mode coverage includes stale heartbeats, repeated blockers, lost runtime attachments, and merge conflicts.; Package README and prompt-guidance tests explain the new worker substrate and preserve truthful boundaries with tickets, plans, Ralph, critique, and docs.

## Traceability
- task-001 -> req-001, req-002, req-003
- task-002 -> req-001, req-002, req-004, req-006, req-019
- task-003 -> req-004, req-005, req-006, req-023
- task-004 -> req-007, req-008, req-009
- task-005 -> req-010, req-011, req-012
- task-006 -> req-013, req-014, req-015
- task-007 -> req-017, req-018
- task-008 -> req-016, req-017, req-018, req-021
- task-009 -> req-019, req-020, req-021
- task-010 -> req-022, req-024
- task-011 -> req-022, req-023
- task-012 -> req-001, req-005, req-014, req-016, req-021, req-024
