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
capabilities:
  - durable-inbox-protocol
  - inbox-driven-worker-turns
  - manager-control-surface
  - runtime-abstraction
  - sdk-first-live-workers
  - bounded-manager-scheduler
  - recovery-and-observability-alignment
---

## Design Notes
## Architectural intent
This change is a successor phase on top of the implemented `pi-workers` package. It does not replace the existing worker ledger or re-open the core question of whether workers should exist. Instead, it revises the worker control plane so that manager-worker coordination becomes more useful and less manual. The current substrate already persists workers, messages, checkpoints, telemetry, approval, and consolidation. This phase upgrades the protocol and runtime assumptions around those records.

## Core design stance
The next phase should optimize for usefulness before transport sophistication. That means the first hardening steps are durable inbox semantics, inbox-driven worker turns, and an explicit manager control surface. The runtime abstraction and SDK-backed live workers should be introduced in service of that protocol. A sidecar event broker or actor mesh is not the starting point; it is a later acceleration option if the simpler architecture proves insufficient.

## Durable inbox protocol
Worker messages need stronger semantics than today’s mostly append-only note stream. The durable message plane should explicitly model:
- manager instruction messages
- worker acknowledgments
- worker resolutions
- worker escalations
- worker completion notices
- bounded broadcast where applicable
Each message should have lifecycle semantics such as `pending`, `acknowledged`, `resolved`, and optionally a later `superseded` state. The important invariant is that manager-originated instructions must not remain silently ignored. Workers should either acknowledge them, resolve them, or respond with a blocker/escalation.

## Inbox-driven worker turn semantics
A worker run should become inbox-aware. When a worker is launched or resumed, it should consume unresolved inbox state as part of the turn contract. The run should:
1. load unresolved manager messages and any relevant broadcast backlog
2. act on them in causal order
3. write acknowledgments, resolutions, escalations, and checkpoints as needed
4. re-check inbox state before stopping
A worker may stop only when a legitimate bounded stop condition is reached: inbox empty, blocked on manager input, requesting review/approval, or explicit policy budget reached. This still permits bounded turns and does not require an always-on daemon.

## Manager orchestration surface
The manager should stop being only an implicit chat behavior. A dedicated `/manager` command family and `manager_*` tools should expose operations such as:
- list workers and summarize queue state
- inspect unresolved inbox and pending approvals across workers
- supervise one or many workers from compact state
- send instructions or unblock messages
- resume workers whose inbox or telemetry says they need another run
- process completion approvals and consolidation readiness
The manager remains a role, not a memory layer. The manager surface is a control plane over durable worker state.

## Runtime abstraction
The worker runtime should be abstracted so that subprocess execution is one implementation rather than the architecture itself. The runtime interface should be able to support:
- subprocess worker runtime (existing baseline)
- SDK-backed worker runtime (preferred next implementation)
- RPC-backed worker runtime (fallback where process separation is needed)
This change should isolate runtime concerns from worker domain state so the rest of the manager-worker protocol does not depend on whether the worker turn was executed through a subprocess, SDK session, or RPC session.

## SDK-backed workers
The provisional preferred live-worker direction is SDK-backed runtime. The Pi SDK offers direct session control and event subscriptions without RPC framing overhead. If used, the SDK-backed runtime should still preserve worker portability and durable truth by persisting important state transitions, messages, and checkpoints back into the worker ledger. An SDK worker host should not become a hidden in-memory truth silo.

## RPC fallback
RPC remains a supported fallback path rather than the default semantic center. It is appropriate when stronger process separation or external hosting is required. The spec should ensure that RPC-backed workers still satisfy the same worker contract: inbox semantics, acknowledgment rules, checkpoints, telemetry, approvals, and durable launch/recovery state must remain consistent with SDK-backed and subprocess-backed workers.

## Scheduler loop
The manager scheduler loop should be bounded and polling-driven in this phase. Its job is to make the AI manager materially more useful without requiring a live event broker. It should periodically scan workers, inspect inbox and telemetry state, apply supervision policy, resume workers that have actionable inbox state, and drain pending approvals. The loop should remain durable and auditable: important scheduling decisions and manager actions must still become worker/ticket-visible state, not hidden scheduler memory.

## Recovery and observability
The current worker dashboard and telemetry surface should be extended to represent inbox backlog, acknowledgment lag, active runtime kind, scheduler visibility, and manager queue summaries. Recovery semantics must stay truthful across runtime kinds: after interruption, a manager or replacement host should reconstruct worker truth from durable records plus runtime descriptors, not from opaque transport state.

## Deferred scope
The following remain out of scope for this spec:
- unrestricted worker-to-worker chat
- mandatory long-lived daemon workers
- multi-repository coordination
- networked event buses or WebSocket fabrics
- turning Ralph into a control-plane scheduler
- replacing tickets with worker state
These may become later research/spec topics if the inbox-driven manager surface still proves inadequate.

## Capability Map
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
