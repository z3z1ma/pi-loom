---
id: add-workspace-backed-manager-worker-substrate
title: "Add workspace-backed manager-worker substrate"
status: specified
created-at: 2026-03-15T23:56:44.247Z
updated-at: 2026-03-28T00:10:55.844Z
research:
  - assess-vendoring-the-oh-my-pi-task-subagent-executor-into-pi-ralph
  - evaluate-pi-control-surfaces-for-long-lived-workers
  - prepare-manager-worker-architecture-from-pi-supervisor-and-pi-extension-interfaces
  - ralph-backed-worker-manager-architecture-cutover
initiatives:
  - workspace-backed-manager-worker-coordination
capabilities:
  - worker-ralph-binding
  - manager-facing-worker-state
  - manager-owned-worktree-intent
  - headless-cutover-surface
---

## Design Notes
This spec replaces the older idea of workers as a peer execution substrate with their own runtime abstraction. Pi Loom is an internal-only toolset, so full cutover is preferred over compatibility layers as long as SQLite-backed Loom state remains correct. The simplest truthful model is: one worker is a durable assignment wrapper, one active Ralph run is attached to that worker, Ralph performs exactly one bounded iteration inside an isolated git worktree, persists useful state to SQLite, and exits. The manager then decides the next step between iterations. Worktree ownership belongs to the higher-level orchestrator or manager boundary, not to a worker-local runtime abstraction. Worker records should therefore keep only manager-facing and assignment-facing state that is not already represented more truthfully in Ralph.

## Capability Map
- worker-ralph-binding: Worker-to-Ralph binding
- manager-facing-worker-state: Manager-facing worker state
- manager-owned-worktree-intent: Manager-owned worktree intent
- headless-cutover-surface: Headless worker control surface

## Requirements
- req-001: A worker may retain prior Ralph run references for history, but successor runs must be created through explicit durable manager action rather than hidden replacement.
  Acceptance: A reader can inspect a worker record and identify its active linked Ralph run, its ticket context, and its current manager-facing status without reconstructing runtime-local details.; Replacing a worker's active Ralph run is an explicit durable transition rather than an implicit side effect of resume.; Worker records do not need a parallel runtime session object to explain what is executing.
  Capabilities: worker-ralph-binding
- req-002: Each worker must link at least one ticket and exactly one active Ralph run at a time.
  Acceptance: A reader can inspect a worker record and identify its active linked Ralph run, its ticket context, and its current manager-facing status without reconstructing runtime-local details.; Replacing a worker's active Ralph run is an explicit durable transition rather than an implicit side effect of resume.; Worker records do not need a parallel runtime session object to explain what is executing.
  Capabilities: worker-ralph-binding
- req-003: Worker state must remain meaningful without replaying runtime transcripts because the canonical execution truth for the worker lives in linked Ralph state plus worker manager-facing records.
  Acceptance: A reader can inspect a worker record and identify its active linked Ralph run, its ticket context, and its current manager-facing status without reconstructing runtime-local details.; Replacing a worker's active Ralph run is an explicit durable transition rather than an implicit side effect of resume.; Worker records do not need a parallel runtime session object to explain what is executing.
  Capabilities: worker-ralph-binding
- req-004: Any worker-facing checkpoint or summary fields must complement Ralph's durable iteration outputs rather than compete with them as a second progress ledger.
  Acceptance: A newcomer can distinguish worker assignment metadata from Ralph execution metadata by reading the two records side by side.; Worker reads show enough information for a manager to decide what to do next even when the active Ralph iteration is not currently running.; Worker state does not expose obsolete executor details like direct runtime command lines or process ids as canonical truth.
  Capabilities: manager-facing-worker-state
- req-005: Worker records must not duplicate low-level execution fields that belong more truthfully to Ralph, such as worker-local runtime commands, pids, or prompt-local execution metadata.
  Acceptance: A newcomer can distinguish worker assignment metadata from Ralph execution metadata by reading the two records side by side.; Worker reads show enough information for a manager to decide what to do next even when the active Ralph iteration is not currently running.; Worker state does not expose obsolete executor details like direct runtime command lines or process ids as canonical truth.
  Capabilities: manager-facing-worker-state
- req-006: Worker state must preserve title, objective, summary, linked ticket/plan/spec/research/initiative refs, manager inbox state, approval state, consolidation state, and target branch/worktree intent.
  Acceptance: A newcomer can distinguish worker assignment metadata from Ralph execution metadata by reading the two records side by side.; Worker reads show enough information for a manager to decide what to do next even when the active Ralph iteration is not currently running.; Worker state does not expose obsolete executor details like direct runtime command lines or process ids as canonical truth.
  Capabilities: manager-facing-worker-state
- req-007: Portable worker state must remain valid even when the actual local worktree path changes across machines or sessions.
  Acceptance: A manager can provision a worktree from the durable worker metadata and invoke Ralph inside it.; Canonical worker state contains worktree intent but no clone-local absolute path requirements.; Moving the same Loom state to another clone does not invalidate the worker record because the runtime path is not canonical truth.
  Capabilities: manager-owned-worktree-intent
- req-008: The higher-level manager or orchestrator must be able to create an isolated git worktree for a worker before invoking Ralph in that workspace.
  Acceptance: A manager can provision a worktree from the durable worker metadata and invoke Ralph inside it.; Canonical worker state contains worktree intent but no clone-local absolute path requirements.; Moving the same Loom state to another clone does not invalidate the worker record because the runtime path is not canonical truth.
  Capabilities: manager-owned-worktree-intent
- req-009: Worker records must preserve logical worktree intent such as repository root, base ref, target branch, and workspace key without storing clone-local absolute paths in canonical state.
  Acceptance: A manager can provision a worktree from the durable worker metadata and invoke Ralph inside it.; Canonical worker state contains worktree intent but no clone-local absolute path requirements.; Moving the same Loom state to another clone does not invalidate the worker record because the runtime path is not canonical truth.
  Capabilities: manager-owned-worktree-intent
- req-010: The worker command and tool surfaces must create, read, list, message, approve, reject, consolidate, retire, and inspect workers without direct file editing.
  Acceptance: An AI or human manager can supervise workers entirely through durable worker and Ralph state without hand-editing artifacts.; Ticket linkage remains mandatory and visible across the cutover.; Worker launch or resume flows route through the linked Ralph run and do not expose a separate worker runtime contract.
  Capabilities: headless-cutover-surface
- req-011: Tickets remain the canonical live execution ledger; worker updates may enrich tickets with manager-facing milestones but must not replace ticket truth.
  Acceptance: An AI or human manager can supervise workers entirely through durable worker and Ralph state without hand-editing artifacts.; Ticket linkage remains mandatory and visible across the cutover.; Worker launch or resume flows route through the linked Ralph run and do not expose a separate worker runtime contract.
  Capabilities: headless-cutover-surface
- req-012: Worker launch/resume semantics must delegate to linked Ralph execution instead of launching an unrelated worker-local runtime.
  Acceptance: An AI or human manager can supervise workers entirely through durable worker and Ralph state without hand-editing artifacts.; Ticket linkage remains mandatory and visible across the cutover.; Worker launch or resume flows route through the linked Ralph run and do not expose a separate worker runtime contract.
  Capabilities: headless-cutover-surface
