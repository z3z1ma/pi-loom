---
id: add-inbox-driven-manager-worker-control-plane
title: "Add inbox-driven manager-worker control plane"
status: finalized
created-at: 2026-03-16T02:32:10.521Z
updated-at: 2026-03-16T02:39:16.175Z
research:
  - evaluate-pi-control-surfaces-for-long-lived-workers
  - prepare-manager-worker-architecture-from-pi-supervisor-and-pi-extension-interfaces
initiatives:
  - workspace-backed-manager-worker-coordination
---

## Task Graph
- task-001: Refactor worker messages into a durable inbox protocol
  Summary: Redesign worker message records, status transitions, and read surfaces so manager instructions, acknowledgments, resolutions, escalations, and bounded broadcast state form a real durable inbox rather than a generic append-only note stream.
  Requirements: req-001, req-002, req-003
  Capabilities: durable-inbox-protocol
  Acceptance: Manager instruction messages can be acknowledged or resolved explicitly and show those transitions in worker reads/dashboards.; Message/query tests prove unresolved inbox state is durable and directly inspectable.; No raw transcript scraping is needed to know whether a worker still owes action on manager messages.
- task-002: Make worker runs inbox-driven and stop-condition aware
  Summary: Change worker run semantics so launches/resumes consume unresolved inbox state, write acknowledgments and checkpoints as they work, re-check the inbox before stopping, and only exit at explicit bounded stop conditions.
  Requirements: req-004, req-005, req-006
  Capabilities: inbox-driven-worker-turns
  Dependencies: task-001
  Acceptance: Checkpoint rendering shows inbox-processing state alongside implementation state.; Stop-condition tests prove workers do not silently exit with unresolved manager instructions.; Worker runs leave durable inbox-processing evidence rather than acting like arbitrary one-shot prompts.
- task-003: Add first-class manager commands and tools
  Summary: Introduce `/manager` and `manager_*` surfaces so managers can inspect fleets, supervise workers, send messages, process approvals, and decide resume/escalation operations intentionally instead of stitching together raw worker operations ad hoc.
  Requirements: req-007, req-008, req-009
  Capabilities: manager-control-surface
  Dependencies: task-001
  Acceptance: A manager can perform common multi-worker orchestration operations from the new surface rather than stitching together many low-level worker commands manually.; Command/tool tests prove durability and headless-safe usage.; Manager actions remain visible in worker/ticket state.
- task-004: Introduce runtime abstraction for worker execution
  Summary: Refactor the current execution path behind a runtime abstraction so subprocess workers remain supported while the package gains room for additional live runtimes without rewriting worker domain semantics.
  Requirements: req-010, req-011, req-012
  Capabilities: runtime-abstraction
  Dependencies: task-002
  Acceptance: Runtime kind is durably visible without changing worker semantics.; Tests prove the worker contract is not duplicated or transport-specific.; The existing subprocess path still works behind the new runtime abstraction.
- task-005: Implement SDK-backed live worker runtime
  Summary: Add a same-process SDK-backed worker host that can run inbox-driven worker turns with direct session control while persisting all important worker-state transitions back into the durable ledger.
  Requirements: req-014, req-015
  Capabilities: runtime-abstraction, sdk-first-live-workers
  Dependencies: task-004
  Acceptance: SDK-backed runtime can launch/resume a worker while preserving durable worker semantics.; Tests or runtime validation prove parity with subprocess behavior where the worker contract overlaps.; The SDK path does not become a hidden truth silo.
- task-006: Add RPC fallback seam for live workers
  Summary: Add a bounded RPC-backed runtime seam or implementation so stronger process separation remains possible without letting RPC redefine the worker domain model.
  Requirements: req-013, req-014
  Capabilities: runtime-abstraction, sdk-first-live-workers
  Dependencies: task-004
  Acceptance: Documentation and tests, where applicable, preserve transport neutrality at the worker-contract layer.; Either a concrete RPC runtime or a clearly bounded fallback seam/documented stub exists without distorting the worker domain model.; RPC support does not become the default semantic center of the package.
- task-007: Build bounded manager scheduler loop
  Summary: Implement the manager polling loop that scans worker state, inbox backlog, telemetry, and approvals, then makes durable bounded decisions to message, resume, escalate, or surface approvals without requiring a human every turn.
  Requirements: req-016, req-017, req-018
  Capabilities: bounded-manager-scheduler, manager-control-surface
  Dependencies: task-003, task-005
  Acceptance: Manager authority over approvals and consolidation remains intact.; Scheduler tests prove bounded useful progress across multiple workers.; Stagnation and unresolved backlog still produce explicit escalation instead of silent churn.
- task-008: Extend recovery and observability for the new control plane
  Summary: Expand dashboards, packets, queue summaries, and recovery behavior so unresolved inbox state, runtime kind, scheduler visibility, and restart-safe reconstruction remain obvious across runtime implementations.
  Requirements: req-019, req-020, req-021
  Capabilities: recovery-and-observability-alignment
  Dependencies: task-001, task-004, task-007
  Acceptance: Dashboards and packets surface the new control-plane state clearly.; No runtime-specific machine-local leakage reaches canonical committed worker state.; Recovery tests prove restart-safe reconstruction across runtime kinds.
- task-009: Harden docs tests and neighboring integrations
  Summary: Update README, prompt guidance, manager/worker tests, and any affected neighboring package integrations so the stronger inbox protocol, manager surface, runtime abstraction, and scheduler behavior are documented and defended by automation.
  Requirements: req-001, req-009, req-011, req-015, req-017, req-021
  Capabilities: bounded-manager-scheduler, durable-inbox-protocol, inbox-driven-worker-turns, manager-control-surface, recovery-and-observability-alignment, runtime-abstraction, sdk-first-live-workers
  Dependencies: task-002, task-003, task-005, task-007, task-008
  Acceptance: Comprehensive tests cover inbox semantics, manager surfaces, runtime abstraction, scheduler behavior, and recovery.; Neighboring integrations remain truthful about ticket/Ralph/worker boundaries.; README and prompt guidance teach the new phase clearly without overstating actor-mesh capabilities.

## Traceability
- task-001 -> req-001, req-002, req-003
- task-002 -> req-004, req-005, req-006
- task-003 -> req-007, req-008, req-009
- task-004 -> req-010, req-011, req-012
- task-005 -> req-014, req-015
- task-006 -> req-013, req-014
- task-007 -> req-016, req-017, req-018
- task-008 -> req-019, req-020, req-021
- task-009 -> req-001, req-009, req-011, req-015, req-017, req-021
