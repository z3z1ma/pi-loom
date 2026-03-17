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
capabilities: []
---

## Overview
## Overview
Evolve the implemented worker substrate from a durable, subprocess-backed foundation into a more useful manager-worker control plane centered on durable inbox semantics, inbox-driven worker turns, an explicit manager orchestration surface, and a worker runtime abstraction that can support SDK-backed live workers while preserving RPC as a fallback. The change is intentionally bounded: it extends the existing `pi-workers` package and surrounding Loom integrations without replacing tickets as the live execution ledger, without turning Ralph into a worker graph, and without prematurely committing the system to a full sidecar/event-mesh architecture.

The problem this spec addresses is practical rather than purely architectural. The current worker substrate solved the truth problem: workers are now real workspace-backed execution units with durable messages, checkpoints, telemetry, approval, and consolidation records. But operationally, workers still behave mostly like resumable subprocess turns. Durable messages exist, yet the system does not define a strong inbox contract, workers are not obligated to drain unresolved manager messages before stopping, the manager remains mostly an implicit role using `worker_*` directly, and one-shot subprocess execution is still embedded as the dominant runtime assumption. This leaves the system useful but still too manual and too close to 'durable subagent turns' for the intended long-horizon manager-worker operating model.

The new research establishes the boundary for a better next phase. Pi exposes three relevant control surfaces: one-shot CLI/JSON subprocesses, long-lived stdio RPC, and in-process SDK sessions. No first-class workspace-aware worker daemon or network RPC worker service was found. That means Pi Loom still owns worker semantics, inbox policy, approvals, and worktree lifecycle. Pi itself remains the agent engine. The main strategic implication is that Pi Loom should not race toward a custom actor mesh before its durable message protocol and manager loop are explicit. Instead, it should first strengthen the control plane around the existing worker substrate, then add a runtime abstraction in which SDK-backed workers become the preferred next implementation for same-runtime live control, with RPC preserved as the strongest documented cross-process fallback.

This spec therefore formalizes five closely related evolutions as one bounded change set. First, it defines a durable inbox protocol with explicit message lifecycle, acknowledgment, and resolution semantics so workers cannot silently ignore manager instructions. Second, it makes worker turns inbox-driven: a worker run must consume unresolved inbox state, act on it, checkpoint its work, and only stop at an explicit stop condition. Third, it introduces a first-class manager command/tool surface so the AI manager can supervise multiple workers intentionally rather than improvisationally through raw worker CRUD. Fourth, it introduces a worker runtime abstraction that preserves the current subprocess runner while adding a same-process SDK-backed live worker implementation and leaving room for RPC-backed live workers where stronger process separation is needed. Fifth, it adds a bounded manager scheduler loop that can poll durable worker state, route interventions, resume inbox-backed workers, and drain pending approvals without requiring a human between every turn.

Just as important as what this spec adds is what it defers. It does not claim unrestricted worker-to-worker chat, multi-repo orchestration, a mandatory sidecar daemon, WebSocket-based event transport, or a general workflow engine. Sidecars and actor-style meshes remain explicitly later-horizon acceleration ideas to consider only if the simpler combination of durable inbox semantics, manager polling, and runtime abstraction proves insufficient. The design remains guided by the same principles that shaped the first substrate: tickets remain the live execution ledger, plans remain execution strategy, Ralph remains bounded orchestration, worker canonical state stays portable and repo-visible, and runtime-only attachments or live transport details do not become canonical Loom truth.

## Capabilities
- durable-inbox-protocol: Durable inbox protocol
- inbox-driven-worker-turns: Inbox-driven worker turns
- manager-control-surface: Manager control surface
- runtime-abstraction: Worker runtime abstraction
- sdk-first-live-workers: SDK-first live workers with RPC fallback
- bounded-manager-scheduler: Bounded manager scheduler
- recovery-and-observability-alignment: Recovery and observability alignment

## Requirements
- req-001: Each manager-originated actionable message SHALL move through explicit durable lifecycle states such as `pending`, `acknowledged`, and `resolved`, with durable evidence of who changed the state and when.
  Acceptance: A worker with unresolved manager instructions is visibly distinguishable from a worker whose inbox is already drained.; Tests prove manager messages cannot be left in an ambiguous consumed-but-unrecorded state.; Tool and command surfaces can query unresolved inbox state directly rather than forcing transcript archaeology.
  Capabilities: durable-inbox-protocol
- req-002: The worker message model SHALL distinguish manager instructions, worker acknowledgments, worker resolutions, worker escalations, and bounded broadcast notices through explicit durable message kinds rather than generic note-like prose alone.
  Acceptance: A worker with unresolved manager instructions is visibly distinguishable from a worker whose inbox is already drained.; Tests prove manager messages cannot be left in an ambiguous consumed-but-unrecorded state.; Tool and command surfaces can query unresolved inbox state directly rather than forcing transcript archaeology.
  Capabilities: durable-inbox-protocol
- req-003: Worker summaries, dashboards, and read surfaces SHALL expose unresolved inbox backlog clearly enough that a manager can identify which workers still owe action on manager messages without transcript reconstruction.
  Acceptance: A worker with unresolved manager instructions is visibly distinguishable from a worker whose inbox is already drained.; Tests prove manager messages cannot be left in an ambiguous consumed-but-unrecorded state.; Tool and command surfaces can query unresolved inbox state directly rather than forcing transcript archaeology.
  Capabilities: durable-inbox-protocol
- req-004: A worker run SHALL load unresolved manager messages and relevant broadcast backlog before beginning substantive work, and SHALL record acknowledgment, resolution, or escalation outcomes before stopping.
  Acceptance: A test worker run with multiple pending manager instructions drains them durably until a legitimate stop condition is reached.; Completion-requesting workers show both implementation progress and inbox state clearly.; Workers that stop because of a policy budget still leave durable evidence of what remains unresolved in the inbox.
  Capabilities: inbox-driven-worker-turns
- req-005: A worker run SHALL re-check durable inbox state before ending and SHALL only stop when the inbox is empty, the worker is blocked on manager input, the worker is explicitly requesting review/approval, or an explicit bounded policy budget has been reached.
  Acceptance: A test worker run with multiple pending manager instructions drains them durably until a legitimate stop condition is reached.; Completion-requesting workers show both implementation progress and inbox state clearly.; Workers that stop because of a policy budget still leave durable evidence of what remains unresolved in the inbox.
  Capabilities: inbox-driven-worker-turns
- req-006: Worker checkpoint records SHALL reflect inbox-processing progress in addition to implementation progress so the manager can tell whether messages were acted on during the run.
  Acceptance: A test worker run with multiple pending manager instructions drains them durably until a legitimate stop condition is reached.; Completion-requesting workers show both implementation progress and inbox state clearly.; Workers that stop because of a policy budget still leave durable evidence of what remains unresolved in the inbox.
  Capabilities: inbox-driven-worker-turns
- req-007: Manager actions that materially change worker state or routing SHALL remain durable and auditable through worker or ticket-visible records rather than hidden command-only state.
  Acceptance: An AI or human manager can supervise multiple workers without manually stitching together low-level `worker_*` calls for every state inspection.; Tests prove manager actions persist durable evidence and do not bypass worker/ticket truth.; The manager surface remains headless-safe and useful in non-interactive contexts.
  Capabilities: manager-control-surface
- req-008: Manager surfaces SHALL support manager-to-worker messaging, worker supervision over compact state, approval processing, and bounded resume/escalation operations without hand-editing worker artifacts.
  Acceptance: An AI or human manager can supervise multiple workers without manually stitching together low-level `worker_*` calls for every state inspection.; Tests prove manager actions persist durable evidence and do not bypass worker/ticket truth.; The manager surface remains headless-safe and useful in non-interactive contexts.
  Capabilities: manager-control-surface
- req-009: The package SHALL expose a `/manager` command family and `manager_*` tools for inspecting worker fleets, unresolved inbox state, pending approvals, supervision outputs, and resume candidates.
  Acceptance: An AI or human manager can supervise multiple workers without manually stitching together low-level `worker_*` calls for every state inspection.; Tests prove manager actions persist durable evidence and do not bypass worker/ticket truth.; The manager surface remains headless-safe and useful in non-interactive contexts.
  Capabilities: manager-control-surface
- req-010: Runtime descriptors and durable worker state SHALL record which runtime kind executed the worker so debugging and recovery remain truthful.
  Acceptance: Tests show runtime-specific metadata is visible without changing worker canonical semantics.; The package does not need to duplicate manager/worker domain logic per runtime kind.; The worker package can execute the same worker contract through the existing subprocess runtime and at least one additional runtime implementation.
  Capabilities: runtime-abstraction
- req-011: The runtime abstraction SHALL preserve the same worker contract across runtime kinds: durable inbox processing, checkpoints, telemetry, approval requests, and recovery semantics must not drift by runtime implementation.
  Acceptance: Tests show runtime-specific metadata is visible without changing worker canonical semantics.; The package does not need to duplicate manager/worker domain logic per runtime kind.; The worker package can execute the same worker contract through the existing subprocess runtime and at least one additional runtime implementation.
  Capabilities: runtime-abstraction
- req-012: Worker execution SHALL be driven through a runtime abstraction that treats the current subprocess implementation as one runtime strategy rather than the architecture itself.
  Acceptance: Tests show runtime-specific metadata is visible without changing worker canonical semantics.; The package does not need to duplicate manager/worker domain logic per runtime kind.; The worker package can execute the same worker contract through the existing subprocess runtime and at least one additional runtime implementation.
  Capabilities: runtime-abstraction
- req-013: If an RPC-backed worker runtime is introduced in this phase, it SHALL satisfy the same durable worker contract and be clearly documented as a fallback transport path rather than the primary domain model.
  Acceptance: At least one SDK-backed live-worker path exists and is exercised by tests or equivalent runtime validation.; If RPC support lands in this phase, tests or fixtures show contract parity with the other runtime paths.; SDK-backed worker execution persists the same durable state transitions required by the worker contract.
  Capabilities: sdk-first-live-workers
- req-014: The package SHALL keep the current subprocess runtime available as a baseline or compatibility path while SDK-backed workers are introduced incrementally.
  Acceptance: At least one SDK-backed live-worker path exists and is exercised by tests or equivalent runtime validation.; If RPC support lands in this phase, tests or fixtures show contract parity with the other runtime paths.; SDK-backed worker execution persists the same durable state transitions required by the worker contract.
  Capabilities: sdk-first-live-workers
- req-015: The worker package SHALL add an SDK-backed worker runtime implementation that can host a live worker session while preserving durable worker truth outside the session.
  Acceptance: At least one SDK-backed live-worker path exists and is exercised by tests or equivalent runtime validation.; If RPC support lands in this phase, tests or fixtures show contract parity with the other runtime paths.; SDK-backed worker execution persists the same durable state transitions required by the worker contract.
  Capabilities: sdk-first-live-workers
- req-016: Scheduler decisions that materially affect worker progress SHALL remain durable and auditable rather than hidden in ephemeral scheduler memory.
  Acceptance: Approval and consolidation decisions remain manager-owned even when the scheduler is driving the loop.; Repeated unresolved backlog or stagnation still triggers explicit escalation instead of silent churn.; Tests prove the scheduler can make useful progress across multiple workers without devolving into infinite no-op polling.
  Capabilities: bounded-manager-scheduler
- req-017: The manager control plane SHALL support a bounded scheduler loop that scans workers, evaluates unresolved inbox state and telemetry, and decides whether to message, resume, escalate, or process approval for each worker.
  Acceptance: Approval and consolidation decisions remain manager-owned even when the scheduler is driving the loop.; Repeated unresolved backlog or stagnation still triggers explicit escalation instead of silent churn.; Tests prove the scheduler can make useful progress across multiple workers without devolving into infinite no-op polling.
  Capabilities: bounded-manager-scheduler
- req-018: The scheduler SHALL respect worker busy/idle/blocked/review states and SHALL preserve the manager as the authority for approval and consolidation boundaries.
  Acceptance: Approval and consolidation decisions remain manager-owned even when the scheduler is driving the loop.; Repeated unresolved backlog or stagnation still triggers explicit escalation instead of silent churn.; Tests prove the scheduler can make useful progress across multiple workers without devolving into infinite no-op polling.
  Capabilities: bounded-manager-scheduler
- req-019: Recovery flows SHALL reconstruct worker truth across runtime kinds from durable records plus runtime descriptors without depending on hidden in-memory scheduler or session state.
  Acceptance: A replacement manager session can recover queue state and decide what to do next without access to prior in-memory scheduler state.; Dashboards make it obvious which workers need attention because of unresolved inbox or scheduler-visible backlog.; Tests prove runtime-specific details do not leak into canonical committed worker state.
  Capabilities: recovery-and-observability-alignment
- req-020: The package SHALL preserve portable canonical worker state even as richer runtime details are added, keeping machine-local runtime specifics out of committed canonical artifacts.
  Acceptance: A replacement manager session can recover queue state and decide what to do next without access to prior in-memory scheduler state.; Dashboards make it obvious which workers need attention because of unresolved inbox or scheduler-visible backlog.; Tests prove runtime-specific details do not leak into canonical committed worker state.
  Capabilities: recovery-and-observability-alignment
- req-021: Worker dashboards and packets SHALL expose unresolved inbox counts, acknowledgment lag, active runtime kind, scheduler visibility, and review backlog in addition to existing telemetry and checkpoint summaries.
  Acceptance: A replacement manager session can recover queue state and decide what to do next without access to prior in-memory scheduler state.; Dashboards make it obvious which workers need attention because of unresolved inbox or scheduler-visible backlog.; Tests prove runtime-specific details do not leak into canonical committed worker state.
  Capabilities: recovery-and-observability-alignment

## Clarifications
- 2026-03-16T02:32:38.566Z Does this spec require a true always-on worker daemon or real-time event mesh from the start? -> No. The first obligation is to formalize the durable inbox protocol and inbox-driven worker turns. Workers may still operate as bounded runs that drain unresolved inbox state before stopping. Sidecars, actor meshes, or push-style event brokers remain explicitly deferred until the simpler control plane proves insufficient.
- 2026-03-16T02:32:38.572Z What does this spec mean by a manager surface? -> A manager surface is an explicit command/tool family that lets an AI or human manager supervise many workers intentionally: inspect worker state, evaluate inbox backlog and supervision signals, message workers, resume them, process approvals, and coordinate consolidation. It is not a new top-level Loom memory layer and it does not replace worker or ticket state as canonical truth.
- 2026-03-16T02:32:38.575Z Which live-worker runtime should the next implementation prefer? -> The provisional preference is SDK-backed worker runtime for same-process live control because the documented Pi SDK exposes direct session control and event subscriptions with less framing overhead than RPC. RPC should remain a supported fallback when stronger process separation or external hosting is required. The subprocess runtime remains as the current baseline and compatibility path.
- 2026-03-16T02:32:38.578Z Does this spec change ticket or Ralph ownership of execution truth? -> No. Tickets remain the live execution ledger and Ralph remains bounded orchestration. The new control plane extends how managers and workers coordinate around tickets and runtimes; it must not turn worker state into a shadow ticket system or let Ralph absorb worker internals into a general workflow engine.
- 2026-03-16T02:32:38.582Z When is an inbox-driven worker run allowed to stop? -> A worker run may stop only when a legitimate bounded stop condition is met: the unresolved inbox is empty, the worker is blocked on manager input, the worker is requesting approval/completion review, or policy has reached an explicit budget/turn boundary. A worker must not leave unresolved manager instructions unacknowledged and silently exit as though the inbox had been handled.

## Capabilities
(none)

## Requirements
(none)

## Clarifications
(none)
