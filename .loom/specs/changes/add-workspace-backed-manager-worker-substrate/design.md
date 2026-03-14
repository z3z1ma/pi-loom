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
capabilities:
  - workspace-backed-worker-records
  - workspace-lifecycle-and-runtime-attachments
  - durable-manager-worker-messaging
  - checkpoint-telemetry-and-observability
  - out-of-band-supervisory-control
  - completion-approval-and-consolidation
  - loom-boundary-and-provenance-integration
  - headless-operator-surface-and-recovery
---

## Design Notes
## Architectural intent
This change introduces a dedicated worker substrate, likely shipped as a new package such as `packages/pi-workers`, that persists durable worker records under `.loom/workers/` while using runtime-only launch descriptors for clone-local workspace attachments. The package exists to make 'worker as ephemeral workspace' truthful in the repository instead of approximating it through session branching or generic task spawning.

## Layer boundaries
The new worker substrate must compose with existing Loom layers rather than replacing them. Tickets remain the live execution ledger. Plans remain execution strategy. Ralph remains bounded orchestration that may launch or observe worker-manager execution at run boundaries. Critique remains the durable review layer. Docs remain post-completion explanation. The worker package owns workspace-backed execution records, worker messaging, checkpoints, approval flow, and consolidation outcomes. Manager remains a role carried by an operator or orchestration surface, not a new top-level memory layer.

## Durable layout
A v1 worker directory should persist canonical state such as:
- `.loom/workers/<worker-id>/state.json`
- `.loom/workers/<worker-id>/worker.md`
- `.loom/workers/<worker-id>/messages.jsonl`
- `.loom/workers/<worker-id>/checkpoints.jsonl`
- `.loom/workers/<worker-id>/dashboard.json`
- `.loom/workers/<worker-id>/launch.json` (runtime-only, not canonical, analogous to Ralph/critique/docs launch descriptors)
The committed artifacts should preserve worker identity, objective, relationships, message/checkpoint history, approval status, and consolidation outcomes. Any absolute worktree path, process id, or machine-local attachment data belongs only in runtime-only descriptors.

## Worker domain model
Worker state should model at least: stable worker id; human title/objective; manager source ref (`kind` + `ref` + optional session/runtime metadata); attached ticket ids plus optional plan/spec/research/initiative/critique/ralph refs; target branch or consolidation target; portable workspace descriptor; lifecycle status; current checkpoint summary; latest telemetry; completion request state; approval decision; consolidation outcome; and timestamps. A worker is the durable anchor. Workspace metadata is carried inside worker state because the user-facing concept is the worker, but the workspace attachment must remain explicit and inspectable.

## Workspace model
The portable workspace descriptor should record intended repository root, base ref, target branch naming, workspace strategy (`git-worktree` in v1, extensible later), and logical labels. Clone-local absolute paths and live attachment details must stay in `launch.json` or equivalent runtime state so committed records remain portable across machines. V1 should explicitly prefer Git worktrees as the runtime backing for worker isolation.

## Messaging model
Workers need a durable message stream rather than ad hoc transcript archaeology. A single append-only `messages.jsonl` stream should preserve direction (`manager_to_worker`, `worker_to_manager`, `broadcast`), message kind, related refs, timestamps, delivery status, and optional causal links to earlier messages. Default routing is manager-mediated. V1 should not introduce unrestricted worker-to-worker chat. The only peer-style surface in scope is bounded broadcast for urgent shared information, with manager visibility preserved.

## Checkpoints and telemetry
Workers should periodically append structured checkpoints summarizing current understanding, recent changes, validation run status, blockers, next intended action, and whether manager input is needed. Separate lightweight telemetry or heartbeat snapshots should tell the manager whether the worker is busy, idle, blocked, waiting for review, or finished. The key supervision pattern from `pi-supervisor` is reused here: the manager should inspect compact worker state plus recent deltas, not the full transcript.

## Supervisory control loop
Manager oversight should be event-driven and phase-aware. Busy workers may be interrupted only on high-confidence drift or explicit danger conditions. Idle, blocked, waiting-for-review, or completion-requesting workers must always receive a prompt manager decision: approve, reject, unblock, redirect, escalate, or retire. Manager interventions must be durable. Anti-stagnation rules should detect repeated no-progress checkpoints, repeated identical blockers, repeated failed validations, or repeated ineffective interventions and then force escalation or reassignment instead of endless steering.

## Completion and consolidation
Workers do not self-declare done by prose alone. They submit a structured completion request that includes claimed scope completed, validation evidence, remaining risks, and branch/workspace state. The manager then approves, rejects for further work, or escalates. Only approved workers may enter consolidation. Consolidation should support fan-in by merge, cherry-pick, patch application, or other explicit strategy, with durable outcome records capturing success, conflicts, validation failures, and rollback needs. The manager is the single point of consolidation because fan-in is where non-parallelizable truth must be decided.

## Runtime model
Because current Pi runtime surfaces do not provide truthful in-process workspace switching and reserve session control for command contexts, v1 should prefer explicit subprocess-backed worker launches. Each worker runtime should start a Pi process with its cwd set to the workspace path, load the relevant extension surface, and attach to the worker inbox/outbox/checkpoint contract. This is closer to existing Ralph/critique/docs launch patterns and avoids pretending that session fork/tree are workspace operations.

## Operator surface
The package should expose `/worker` commands and `worker_*` tools for creating, reading, listing, messaging, checkpointing, approving, rejecting, launching, resuming, retiring, and inspecting workers. Manager tooling must be headless-safe: structured artifacts, not widgets, are canonical. Widgets or dashboards may exist as convenience views, but correctness must flow through durable state and tool results.

## Recovery and auditability
After process interruption, a manager or replacement runtime must be able to reconstruct worker truth from durable state, message history, checkpoints, and the latest runtime descriptor. Dashboards and markdown summaries should surface worker status, stale heartbeats, pending approvals, blockers, and consolidation outcomes at a glance. The repository should make it obvious why a worker is active, blocked, waiting, rejected, approved, or retired without requiring transcript reconstruction.

## Scope boundaries for v1
In scope: single-repository workspace-backed workers, manager-mediated coordination, bounded broadcast, durable messaging/checkpoints, structured approval, and explicit consolidation. Out of scope: multi-repository coordination, unrestricted peer meshes, automatic merge swarms, model-routing policy systems, and any attempt to replace tickets or Ralph with a generic workflow engine.

## Capability Map
- workspace-backed-worker-records: Workspace-backed worker records
- workspace-lifecycle-and-runtime-attachments: Workspace lifecycle and runtime attachments
- durable-manager-worker-messaging: Durable manager-worker messaging
- checkpoint-telemetry-and-observability: Checkpoint telemetry and observability
- out-of-band-supervisory-control: Out-of-band supervisory control
- completion-approval-and-consolidation: Completion approval and consolidation
- loom-boundary-and-provenance-integration: Loom boundary and provenance integration
- headless-operator-surface-and-recovery: Headless operator surface and recovery

## Requirements
- req-001: Canonical worker state SHALL preserve only portable metadata and logical workspace descriptors; clone-local absolute paths, process ids, and machine-specific workspace attachments SHALL remain runtime-only and excluded from committed canonical state.
  Acceptance: Committed worker artifacts contain no clone-local absolute paths even when the runtime used a Git worktree outside the repo root.; Creating a worker writes the expected artifact set with stable worker identity and portable metadata.; Reading worker state after process interruption reconstructs objective, relationships, current status, and the latest durable checkpoint without needing runtime-only files.
  Capabilities: workspace-backed-worker-records
- req-002: Each worker SHALL have a stable worker id plus persisted objective, attached ticket ids, optional linked plan/spec/research/initiative/critique/ralph refs, source manager reference, and consolidation target metadata.
  Acceptance: Committed worker artifacts contain no clone-local absolute paths even when the runtime used a Git worktree outside the repo root.; Creating a worker writes the expected artifact set with stable worker identity and portable metadata.; Reading worker state after process interruption reconstructs objective, relationships, current status, and the latest durable checkpoint without needing runtime-only files.
  Capabilities: workspace-backed-worker-records
- req-003: The system SHALL create one durable worker record under `.loom/workers/<worker-id>/` with canonical state, markdown summary, append-only messages and checkpoints, dashboard state, and a runtime-only launch descriptor.
  Acceptance: Committed worker artifacts contain no clone-local absolute paths even when the runtime used a Git worktree outside the repo root.; Creating a worker writes the expected artifact set with stable worker identity and portable metadata.; Reading worker state after process interruption reconstructs objective, relationships, current status, and the latest durable checkpoint without needing runtime-only files.
  Capabilities: workspace-backed-worker-records
- req-004: The workspace descriptor SHALL record intended repository root, base ref, branch strategy, and workspace strategy, with `git-worktree` treated as the required v1 backing strategy and future strategies remaining additive.
  Acceptance: A worker can be created before a live workspace exists and later transition through provisioning and ready states once the runtime attachment is materialized.; Launch and resume behavior can reconstruct the necessary runtime attachment from durable metadata plus runtime-only descriptors without rewriting canonical state.; The durable record distinguishes logical workspace intent from clone-local runtime attachment details.
  Capabilities: workspace-lifecycle-and-runtime-attachments
- req-005: V1 runtime launches SHALL prefer explicit subprocess-backed Pi sessions with cwd set to the workspace attachment rather than mutating the current session cwd or relying on session fork/tree semantics as a surrogate for workspace isolation.
  Acceptance: A worker can be created before a live workspace exists and later transition through provisioning and ready states once the runtime attachment is materialized.; Launch and resume behavior can reconstruct the necessary runtime attachment from durable metadata plus runtime-only descriptors without rewriting canonical state.; The durable record distinguishes logical workspace intent from clone-local runtime attachment details.
  Capabilities: workspace-lifecycle-and-runtime-attachments
- req-006: Worker lifecycle SHALL include explicit workspace-oriented states such as requested, provisioning, ready, active, blocked, waiting_for_review, completion_requested, approved_for_consolidation, completed, retired, and failed rather than inferring lifecycle from prose.
  Acceptance: A worker can be created before a live workspace exists and later transition through provisioning and ready states once the runtime attachment is materialized.; Launch and resume behavior can reconstruct the necessary runtime attachment from durable metadata plus runtime-only descriptors without rewriting canonical state.; The durable record distinguishes logical workspace intent from clone-local runtime attachment details.
  Capabilities: workspace-lifecycle-and-runtime-attachments
- req-007: Each worker SHALL maintain an append-only durable message stream that records manager-to-worker instructions, worker-to-manager updates, and bounded broadcast messages with direction, kind, timestamps, and causal links.
  Acceptance: A manager can inspect the full durable conversation relevant to a worker without reopening the worker's transient runtime transcript.; A worker can request help, clarification, or approval through structured messages that remain visible after process restart.; Broadcast messages appear durably with explicit scope and do not create invisible side channels outside manager visibility.
  Capabilities: durable-manager-worker-messaging
- req-008: Manager-mediated routing SHALL be the default coordination mode; unrestricted worker-to-worker peer chat SHALL be out of scope for v1, with only optional bounded broadcast supported for urgent team-wide signals that still remain visible to the manager.
  Acceptance: A manager can inspect the full durable conversation relevant to a worker without reopening the worker's transient runtime transcript.; A worker can request help, clarification, or approval through structured messages that remain visible after process restart.; Broadcast messages appear durably with explicit scope and do not create invisible side channels outside manager visibility.
  Capabilities: durable-manager-worker-messaging
- req-009: Messages SHALL link to related worker ids, ticket/spec/plan refs, and delivery or resolution status instead of flattening coordination into anonymous prose blobs.
  Acceptance: A manager can inspect the full durable conversation relevant to a worker without reopening the worker's transient runtime transcript.; A worker can request help, clarification, or approval through structured messages that remain visible after process restart.; Broadcast messages appear durably with explicit scope and do not create invisible side channels outside manager visibility.
  Capabilities: durable-manager-worker-messaging
- req-010: Worker dashboards and packets SHALL make stale heartbeats, pending approvals, blockers, latest checkpoints, and consolidation readiness visible at a glance.
  Acceptance: A manager can tell which workers are actively making progress, which are stale, and which are waiting for decisions from dashboard state alone.; A worker checkpoint contains enough information for a new manager session to continue supervision without reconstructing the whole transcript.; Observable worker state stays useful in headless mode through durable artifacts and tool responses rather than depending on interactive UI.
  Capabilities: checkpoint-telemetry-and-observability
- req-011: Workers SHALL append structured checkpoints summarizing current understanding, recent changes, validation state, blockers, next intended action, and whether manager input is required.
  Acceptance: A manager can tell which workers are actively making progress, which are stale, and which are waiting for decisions from dashboard state alone.; A worker checkpoint contains enough information for a new manager session to continue supervision without reconstructing the whole transcript.; Observable worker state stays useful in headless mode through durable artifacts and tool responses rather than depending on interactive UI.
  Capabilities: checkpoint-telemetry-and-observability
- req-012: Workers SHALL expose compact telemetry or heartbeat state sufficient to distinguish busy, idle, blocked, waiting_for_review, and finished phases without requiring full transcript replay.
  Acceptance: A manager can tell which workers are actively making progress, which are stale, and which are waiting for decisions from dashboard state alone.; A worker checkpoint contains enough information for a new manager session to continue supervision without reconstructing the whole transcript.; Observable worker state stays useful in headless mode through durable artifacts and tool responses rather than depending on interactive UI.
  Capabilities: checkpoint-telemetry-and-observability
- req-013: Managers SHALL supervise workers from compact telemetry, recent checkpoints, recent message deltas, and intervention history rather than from full worker transcript context.
  Acceptance: A busy worker is not interrupted on every heartbeat, but an idle or blocked worker does not remain unattended indefinitely.; Intervention history survives runtime turnover and can be audited to explain why a manager redirected or escalated work.; The system detects stagnation and records an explicit escalation or reassignment path instead of nudging forever.
  Capabilities: out-of-band-supervisory-control
- req-014: The substrate SHALL persist interventions and enforce anti-stagnation policies that escalate, reassign, approve, or retire work after repeated no-progress checkpoints, repeated identical blockers, or repeated ineffective interventions.
  Acceptance: A busy worker is not interrupted on every heartbeat, but an idle or blocked worker does not remain unattended indefinitely.; Intervention history survives runtime turnover and can be audited to explain why a manager redirected or escalated work.; The system detects stagnation and records an explicit escalation or reassignment path instead of nudging forever.
  Capabilities: out-of-band-supervisory-control
- req-015: The supervisory policy SHALL distinguish busy execution from idle, blocked, waiting, or completion-requesting states and apply stricter interruption thresholds during active work than during idle or blocked phases.
  Acceptance: A busy worker is not interrupted on every heartbeat, but an idle or blocked worker does not remain unattended indefinitely.; Intervention history survives runtime turnover and can be audited to explain why a manager redirected or escalated work.; The system detects stagnation and records an explicit escalation or reassignment path instead of nudging forever.
  Capabilities: out-of-band-supervisory-control
- req-016: Approved workers SHALL enter an explicit consolidation flow that records chosen fan-in strategy, validation outcome, merge or patch result, conflict state, and any rollback or follow-up requirement durably.
  Acceptance: A worker cannot reach completed state without an explicit approval decision and recorded consolidation outcome.; Consolidation failures such as merge conflicts or failed post-merge validation remain durable and do not silently disappear into chat history.; Managers can consolidate multiple workers into a target branch while preserving which worker changes were accepted, deferred, or rejected.
  Capabilities: completion-approval-and-consolidation
- req-017: Managers SHALL record explicit approve, reject_for_revision, or escalate decisions, and worker completion SHALL NOT imply automatic merge or fan-in.
  Acceptance: A worker cannot reach completed state without an explicit approval decision and recorded consolidation outcome.; Consolidation failures such as merge conflicts or failed post-merge validation remain durable and do not silently disappear into chat history.; Managers can consolidate multiple workers into a target branch while preserving which worker changes were accepted, deferred, or rejected.
  Capabilities: completion-approval-and-consolidation
- req-018: Workers SHALL request completion through a structured completion payload that records claimed scope complete, validation evidence, remaining risks, and workspace/branch state rather than by prose alone.
  Acceptance: A worker cannot reach completed state without an explicit approval decision and recorded consolidation outcome.; Consolidation failures such as merge conflicts or failed post-merge validation remain durable and do not silently disappear into chat history.; Managers can consolidate multiple workers into a target branch while preserving which worker changes were accepted, deferred, or rejected.
  Capabilities: completion-approval-and-consolidation
- req-019: Every worker SHALL link to at least one ticket and MAY link to plans, specs, research, initiatives, critiques, Ralph runs, and docs through explicit references instead of copied summaries.
  Acceptance: A reader can trace a worker from ticket to plan/spec/initiative context and back without guessing from prose.; Ralph can launch or observe manager-worker execution while remaining bounded and run-centric.; Worker artifacts do not become a shadow ticket system that competes with ticket status or dependency truth.
  Capabilities: loom-boundary-and-provenance-integration
- req-020: Ralph, plans, critique, and docs SHALL interact with workers through links, packets, launch descriptors, and evidence references rather than by absorbing worker internals into their own records.
  Acceptance: A reader can trace a worker from ticket to plan/spec/initiative context and back without guessing from prose.; Ralph can launch or observe manager-worker execution while remaining bounded and run-centric.; Worker artifacts do not become a shadow ticket system that competes with ticket status or dependency truth.
  Capabilities: loom-boundary-and-provenance-integration
- req-021: Tickets SHALL remain the canonical live execution ledger; worker state SHALL complement tickets with workspace execution details and SHALL be able to feed key checkpoints, approvals, or outcomes back into ticket history without replacing ticket truth.
  Acceptance: A reader can trace a worker from ticket to plan/spec/initiative context and back without guessing from prose.; Ralph can launch or observe manager-worker execution while remaining bounded and run-centric.; Worker artifacts do not become a shadow ticket system that competes with ticket status or dependency truth.
  Capabilities: loom-boundary-and-provenance-integration
- req-022: All critical manager-worker flows SHALL be headless-safe and structured; interactive UI, widgets, or dashboards MAY assist operators but MUST NOT be required for correctness or recoverability.
  Acceptance: A headless manager process can create, supervise, and consolidate workers using only tools and durable state.; An interrupted worker can be resumed or retired after inspecting durable records without depending on the original interactive session.; The package surface is rich enough that operators do not need to hand-edit JSON or markdown to keep workers moving.
  Capabilities: headless-operator-surface-and-recovery
- req-023: Recovery after interruption SHALL rehydrate from durable worker state, messages, checkpoints, and runtime descriptors rather than from a monolithic transcript or hidden in-memory state.
  Acceptance: A headless manager process can create, supervise, and consolidate workers using only tools and durable state.; An interrupted worker can be resumed or retired after inspecting durable records without depending on the original interactive session.; The package surface is rich enough that operators do not need to hand-edit JSON or markdown to keep workers moving.
  Capabilities: headless-operator-surface-and-recovery
- req-024: The package SHALL expose `/worker` commands and `worker_*` tools for creating, reading, listing, messaging, checkpointing, approving, rejecting, launching, resuming, retiring, and inspecting workers without direct file editing.
  Acceptance: A headless manager process can create, supervise, and consolidate workers using only tools and durable state.; An interrupted worker can be resumed or retired after inspecting durable records without depending on the original interactive session.; The package surface is rich enough that operators do not need to hand-edit JSON or markdown to keep workers moving.
  Capabilities: headless-operator-surface-and-recovery
