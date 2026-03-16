---
id: add-workspace-backed-manager-worker-substrate
title: "Add workspace-backed manager-worker substrate"
status: finalized
created-at: 2026-03-15T23:56:44.247Z
updated-at: 2026-03-16T02:19:49.118Z
research:
  - evaluate-pi-control-surfaces-for-long-lived-workers
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

## Overview
Introduce a new workspace-backed execution substrate for Pi Loom in which workers are durable, ticket-attached abstractions over ephemeral workspaces and managers act as out-of-band supervisors and consolidators rather than as transcript-bound copilots. The change formalizes how manager-worker coordination fits into the existing Loom stack without overloading current session branching, task spawning, or Ralph orchestration semantics.

The motivating problem is that long-horizon execution needs stronger parallelism, isolation, and recoverability than a single transcript or bounded subagent call can provide. Current Pi runtime primitives are useful but incomplete: extension hooks can observe and steer work, task spawning can launch bounded subprocesses, and session branching can create fresh conversational context, but none of those surfaces truthfully model a worker as a persistent execution unit rooted in an ephemeral Git worktree or comparable workspace. At the same time, Pi Loom’s current constitutional boundaries require that tickets remain the live execution ledger, plans remain execution strategy, and Ralph remain bounded rather than expanding into a vague general workflow engine.

This spec therefore defines a new manager-worker substrate whose core job is to turn a bounded work slice into a workspace-backed worker lifecycle with durable records, portable metadata, message channels, checkpoints, telemetry, completion approval, and consolidation semantics. A worker is not merely a child session or a task subprocess: it is an execution unit with a stable worker identity, a workspace contract, an attached objective, explicit ticket relationships, durable communication history, and observable progress that can survive process turnover. A manager is not a new all-purpose memory layer; it is a role performed by an operator, plan-oriented agent, Ralph-launched process, or future orchestration surface that supervises workers from outside their context windows, allocates work, keeps workers unstuck, grants completion approval, and fans completed changes back into the target branch or execution stream.

The design draws heavily from the strongest ideas in `.agents/resources/pi-supervisor/`: a lightweight out-of-band overseer using compact snapshots, phase-aware intervention policy, append-only supervision history, and anti-stagnation rules. The manager-worker substrate should reuse those patterns at worker granularity. Managers should reason from compact worker telemetry, recent checkpoints, intervention history, and message deltas rather than from full worker transcript replay. Managers should also distinguish sharply between a busy worker, which should rarely be interrupted, and an idle or blocked worker, which should never be allowed to wait indefinitely without approval, redirection, or unblocking.

The spec intentionally keeps broader coordination bounded. It does not claim unrestricted peer meshes, multi-repository orchestration, or role-specialized model-routing as current Pi Loom truth. Instead it defines a repo-truthful v1 centered on one repository, one workspace root, many ephemeral worker workspaces, manager-mediated coordination by default, optional bounded broadcast for urgent team-wide signals, and explicit fan-in semantics that preserve tickets as the high-fidelity source of live execution truth. Ralph may eventually invoke or observe manager-worker execution at run boundaries, but this spec does not turn Ralph itself into the worker graph or execution ledger.

## Capabilities
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

## Clarifications
- 2026-03-15T23:57:01.917Z Is this spec expanding Ralph into a general multi-worker workflow engine? -> No. Ralph remains a bounded orchestration layer over plans, tickets, critique, and docs. This spec defines a separate workspace-backed manager-worker substrate that Ralph may invoke, observe, or link to at run boundaries, but Ralph does not become the canonical worker graph, worker message bus, or execution ledger.
- 2026-03-15T23:57:01.923Z Are workers equivalent to session branches, session forks, or current task-tool subagents? -> No. Session branching and forking are conversation-log operations, and current task-tool agents are bounded subprocess/session launches. A worker in this spec is a durable execution unit backed by an ephemeral workspace, with stable worker identity, attached objective, ticket relationships, durable checkpoints/messages, and explicit completion/consolidation semantics.
- 2026-03-15T23:57:01.926Z Does this spec introduce a new top-level Loom manager memory layer? -> No. Manager is a role, not a new top-level durable memory layer. A manager may be a human-led session, a plan-oriented orchestrator, a Ralph-launched process, or another bounded control surface. The new first-class durable substrate is the workspace-backed worker contract plus the records needed to supervise, message, checkpoint, approve, and consolidate worker execution truthfully.
- 2026-03-15T23:57:01.931Z Which Loom layer remains the canonical source of live execution truth when workers are introduced? -> Tickets remain the live execution ledger. Workers may carry rich local state, checkpoints, and telemetry, but the substrate must not displace tickets, plans, critique, or Ralph from their existing roles. Manager-worker execution should link into those layers and feed them, not replace them.
- 2026-03-15T23:57:01.934Z How should the design handle ephemeral worktree paths while preserving Pi Loom’s durable portable-path constraint? -> Durable worker records must store portable workspace intent and stable metadata such as worker id, branch/base refs, ticket attachments, and relative or logical workspace descriptors. Clone-local absolute worktree paths belong only in runtime-only launch or attachment descriptors and must not become committed canonical Loom truth.
- 2026-03-15T23:59:42.202Z Does v1 support unrestricted direct worker-to-worker communication? -> No. V1 defaults to manager-mediated coordination. The only peer-style surface in scope is bounded broadcast for urgent shared signals, and those broadcasts must remain durable and manager-visible. Unrestricted direct peer meshes are explicitly out of scope for this spec version.
- 2026-03-15T23:59:42.213Z What runtime form should v1 prefer for launching workers? -> V1 should prefer explicit subprocess-backed Pi runtimes launched with cwd set to a provisioned workspace, typically a Git worktree. This matches current Pi runtime strengths and avoids pretending that session fork/tree or in-process cwd mutation are sufficient workspace abstractions.
- 2026-03-15T23:59:42.220Z Who owns the decision to fan worker changes back into the target branch or execution stream? -> The manager owns consolidation authority. Workers may submit completion requests and evidence, but only a manager may approve work for consolidation and record the chosen fan-in outcome. This preserves a single accountable point for non-parallelizable merge and validation decisions.
- 2026-03-15T23:59:42.225Z What first-class package and command/tool surface should this spec assume? -> The spec assumes a dedicated worker package, likely `packages/pi-workers`, with a `/worker` command namespace and `worker_*` tools. The package owns workspace-backed worker records, messaging, checkpoints, approval flow, dashboards, and runtime launch descriptors while integrating with the surrounding Loom layers through explicit links.
