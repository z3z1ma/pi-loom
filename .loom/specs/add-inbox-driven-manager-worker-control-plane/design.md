---
id: add-inbox-driven-manager-worker-control-plane
title: "Add inbox-driven manager-worker control plane"
status: specified
created-at: 2026-03-16T02:32:10.521Z
updated-at: 2026-03-21T06:05:11.410Z
research:
  - assess-vendoring-the-oh-my-pi-task-subagent-executor-into-pi-ralph
  - evaluate-pi-control-surfaces-for-long-lived-workers
  - prepare-manager-worker-architecture-from-pi-supervisor-and-pi-extension-interfaces
  - ralph-backed-worker-manager-architecture-cutover
initiatives:
  - workspace-backed-manager-worker-coordination
capabilities:
  - inter-iteration-inbox-control
  - manager-decision-loop
  - worktree-orchestration-boundary
  - headless-manager-surface
---

## Design Notes
This spec replaces the more complex runtime-abstraction direction. The manager's control point is between Ralph iterations, not during them. That means the control plane should optimize for durable inbox semantics, explicit between-iteration decisions, and clear headless orchestration rather than for live worker daemons, intra-iteration supervision, or multiple worker runtime implementations. Steerability comes from updating durable worker/Ralph context and then invoking the next Ralph iteration. Worktree creation belongs to the manager or higher-level orchestrator boundary, not to a worker-local executor abstraction.

## Capability Map
- inter-iteration-inbox-control: Inter-iteration inbox control
- manager-decision-loop: Manager decision loop
- worktree-orchestration-boundary: Worktree orchestration boundary
- headless-manager-surface: Headless manager surface

## Requirements
- req-001: Manager-originated instructions must remain durable with explicit pending, acknowledged, and resolved state so the next Ralph iteration can consume them truthfully.
  Acceptance: A manager can inspect a worker and tell whether unresolved steering or unblock instructions remain before launching another Ralph iteration.; After a Ralph iteration finishes, the durable state shows which manager messages were acknowledged, resolved, or escalated.; The system does not require transcript replay to understand whether inbox work remains.
  Capabilities: inter-iteration-inbox-control
- req-002: The control plane must make it obvious whether the next step is manager action, worker action through Ralph, or human escalation.
  Acceptance: A manager can inspect a worker and tell whether unresolved steering or unblock instructions remain before launching another Ralph iteration.; After a Ralph iteration finishes, the durable state shows which manager messages were acknowledged, resolved, or escalated.; The system does not require transcript replay to understand whether inbox work remains.
  Capabilities: inter-iteration-inbox-control
- req-003: Workers must surface unresolved manager instructions clearly before the next Ralph iteration begins and after it ends.
  Acceptance: A manager can inspect a worker and tell whether unresolved steering or unblock instructions remain before launching another Ralph iteration.; After a Ralph iteration finishes, the durable state shows which manager messages were acknowledged, resolved, or escalated.; The system does not require transcript replay to understand whether inbox work remains.
  Capabilities: inter-iteration-inbox-control
- req-004: After every Ralph iteration, the manager must be able to inspect durable worker and Ralph state and choose among continue, steer, escalate, approve, reject, consolidate, retire, or spawn additional workers.
  Acceptance: A manager can supervise multiple workers without improvising from raw transcripts or hidden runtime state.; Approval and consolidation are not silently inferred from a Ralph iteration claiming completion.; Each material manager decision is represented durably enough that a later session can explain why the next step happened.
  Capabilities: manager-decision-loop
- req-005: Approval and consolidation boundaries remain manager-owned even when the manager is automated.
  Acceptance: A manager can supervise multiple workers without improvising from raw transcripts or hidden runtime state.; Approval and consolidation are not silently inferred from a Ralph iteration claiming completion.; Each material manager decision is represented durably enough that a later session can explain why the next step happened.
  Capabilities: manager-decision-loop
- req-006: Manager decisions that materially affect progress must remain durable and auditable.
  Acceptance: A manager can supervise multiple workers without improvising from raw transcripts or hidden runtime state.; Approval and consolidation are not silently inferred from a Ralph iteration claiming completion.; Each material manager decision is represented durably enough that a later session can explain why the next step happened.
  Capabilities: manager-decision-loop
- req-007: Canonical records must preserve only portable worktree intent while runtime-local path details remain outside canonical truth.
  Acceptance: A manager can provision a fresh worktree and run the next Ralph iteration there without mutating canonical worker truth with clone-local paths.; A resumed manager session can tell which branch/workspace intent to recreate from durable records.; Worktree ownership is visible at the manager boundary rather than hidden inside a worker-local runtime abstraction.
  Capabilities: worktree-orchestration-boundary
- req-008: The control plane must support creating or selecting an isolated git worktree for a worker before invoking Ralph inside it.
  Acceptance: A manager can provision a fresh worktree and run the next Ralph iteration there without mutating canonical worker truth with clone-local paths.; A resumed manager session can tell which branch/workspace intent to recreate from durable records.; Worktree ownership is visible at the manager boundary rather than hidden inside a worker-local runtime abstraction.
  Capabilities: worktree-orchestration-boundary
- req-009: The manager must be able to resume orchestration after interruption using durable worker and Ralph state plus logical worktree metadata.
  Acceptance: A manager can provision a fresh worktree and run the next Ralph iteration there without mutating canonical worker truth with clone-local paths.; A resumed manager session can tell which branch/workspace intent to recreate from durable records.; Worktree ownership is visible at the manager boundary rather than hidden inside a worker-local runtime abstraction.
  Capabilities: worktree-orchestration-boundary
- req-010: Manager launch or resume actions must mean invoking the next Ralph iteration for the linked worker rather than starting a separate worker-local runtime.
  Acceptance: An AI or human manager can drive the full inter-iteration loop from durable tools and records alone.; Headless operation remains truthful after session interruption or process turnover.; Manager launch or resume semantics are consistent with the Ralph-backed worker model and do not expose obsolete runtime abstractions.
  Capabilities: headless-manager-surface
- req-011: The control plane must remain useful without a dedicated daemon UI or interactive widget surface.
  Acceptance: An AI or human manager can drive the full inter-iteration loop from durable tools and records alone.; Headless operation remains truthful after session interruption or process turnover.; Manager launch or resume semantics are consistent with the Ralph-backed worker model and do not expose obsolete runtime abstractions.
  Capabilities: headless-manager-surface
- req-012: The package must expose manager commands and tools for fleet overview, worker inspection, messaging, approval, consolidation, and bounded iteration launching without direct file editing.
  Acceptance: An AI or human manager can drive the full inter-iteration loop from durable tools and records alone.; Headless operation remains truthful after session interruption or process turnover.; Manager launch or resume semantics are consistent with the Ralph-backed worker model and do not expose obsolete runtime abstractions.
  Capabilities: headless-manager-surface
