---
id: design-widget-first-workers-ux
title: "Design widget-first workers UX"
status: archived
created-at: 2026-03-17T05:56:14.921Z
updated-at: 2026-03-28T00:13:05.937Z
research: []
initiatives: []
capabilities:
  - capability-worker-fleet-workspace
---

## Design Notes
Workers are Loom's workspace-backed execution substrate, and their human-facing UX must balance worker detail with manager oversight. The home widget should surface active workers, blocked workers, inbox backlog, approvals waiting, and the next highest-leverage supervision actions. It should let a human instantly see fleet health without reading raw worker state.

Focused interaction should support both fleet-level and worker-level views: a worker list or board, worker master-detail, inbox/message history, checkpoint inspection, approval and consolidation flows, and manager-side scheduling or supervision views. The design must preserve the conceptual distinction between worker execution state, manager oversight, and linked ticket truth.

The surviving human verbs should center on opening the fleet, launching or resuming workers, reviewing inbox or approvals, and supervising the manager queue. Tool-mirroring verbs for every manager and worker tool should become obsolete once the UI makes those workflows direct.

## Capability Map
- capability-worker-fleet-workspace: Fleet and worker workspace with manager oversight

## Requirements
- req-001: Focused views must support fleet scanning, worker master-detail inspection, inbox/message review, checkpoint history, approval/consolidation review, and manager-side supervision or scheduling views.
  Acceptance: A reviewer can identify how a user would inspect fleet health, open one worker, review inbox and checkpoints, and approve or resume work from the subsystem UX alone.; The persistent widget and focused views together cover both fleet overview and single-worker deep inspection.; The workers spec preserves the distinction between manager-side and worker-side responsibilities instead of collapsing them into one opaque panel.
  Capabilities: capability-worker-fleet-workspace
- req-002: The design must preserve the boundaries between workers, managers, and tickets so the UI does not lie about where execution truth lives.
  Acceptance: A reviewer can identify how a user would inspect fleet health, open one worker, review inbox and checkpoints, and approve or resume work from the subsystem UX alone.; The persistent widget and focused views together cover both fleet overview and single-worker deep inspection.; The workers spec preserves the distinction between manager-side and worker-side responsibilities instead of collapsing them into one opaque panel.
  Capabilities: capability-worker-fleet-workspace
- req-003: The home widget must summarize active workers, blocked workers, inbox backlog, approval pressure, and the most valuable next supervision actions.
  Acceptance: A reviewer can identify how a user would inspect fleet health, open one worker, review inbox and checkpoints, and approve or resume work from the subsystem UX alone.; The persistent widget and focused views together cover both fleet overview and single-worker deep inspection.; The workers spec preserves the distinction between manager-side and worker-side responsibilities instead of collapsing them into one opaque panel.
  Capabilities: capability-worker-fleet-workspace
- req-004: The UI must support creating or linking workers, launching/resuming work, reviewing worker state, resolving or escalating inbox items, and acting on approvals without relying on tool-mirroring slash commands.
  Acceptance: A reviewer can identify how a user would inspect fleet health, open one worker, review inbox and checkpoints, and approve or resume work from the subsystem UX alone.; The persistent widget and focused views together cover both fleet overview and single-worker deep inspection.; The workers spec preserves the distinction between manager-side and worker-side responsibilities instead of collapsing them into one opaque panel.
  Capabilities: capability-worker-fleet-workspace
- req-005: The workspace must make worker fleet health and per-worker resumability legible enough that a human can supervise multiple workers confidently.
  Acceptance: A reviewer can identify how a user would inspect fleet health, open one worker, review inbox and checkpoints, and approve or resume work from the subsystem UX alone.; The persistent widget and focused views together cover both fleet overview and single-worker deep inspection.; The workers spec preserves the distinction between manager-side and worker-side responsibilities instead of collapsing them into one opaque panel.
  Capabilities: capability-worker-fleet-workspace
