---
id: capability-worker-fleet-workspace
title: "Fleet and worker workspace with manager oversight"
change: design-widget-first-workers-ux
updated-at: 2026-03-17T05:59:05.301Z
source-changes:
  - design-widget-first-workers-ux
---

## Summary
The workers subsystem provides a persistent fleet widget plus focused fleet, worker-detail, inbox, checkpoint, and approval views for human supervision of workspace-backed workers.

## Requirements
- Focused views must support fleet scanning, worker master-detail inspection, inbox/message review, checkpoint history, approval/consolidation review, and manager-side supervision or scheduling views.
- The design must preserve the boundaries between workers, managers, and tickets so the UI does not lie about where execution truth lives.
- The home widget must summarize active workers, blocked workers, inbox backlog, approval pressure, and the most valuable next supervision actions.
- The UI must support creating or linking workers, launching/resuming work, reviewing worker state, resolving or escalating inbox items, and acting on approvals without relying on tool-mirroring slash commands.
- The workspace must make worker fleet health and per-worker resumability legible enough that a human can supervise multiple workers confidently.

## Scenarios
- A manager opens a supervision view, reviews fleet state, resumes one worker, and clears another approval from the same subsystem experience.
- A user inspects a worker in master-detail view while keeping its linked ticket and execution status visible without falling back to raw slash commands.
- A user opens workers and sees two active workers, one blocked worker with unresolved inbox, and one approval waiting, then drills into the blocked worker's message and checkpoint history.
