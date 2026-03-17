---
id: design-widget-first-workers-ux
title: "Design widget-first workers UX"
status: planned
created-at: 2026-03-17T05:56:14.921Z
updated-at: 2026-03-17T05:59:05.301Z
research: []
initiatives: []
capabilities:
  - capability-worker-fleet-workspace
---

## Overview
Define the human-facing workers and manager experience around a persistent fleet widget, focused worker/inbox/checkpoint/approval views, and direct supervision workflows that replace tool-mirroring manager and worker commands.

## Capabilities
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

## Clarifications
(none)
