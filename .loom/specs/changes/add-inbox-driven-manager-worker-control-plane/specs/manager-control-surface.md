---
id: manager-control-surface
title: "Manager control surface"
change: add-inbox-driven-manager-worker-control-plane
updated-at: 2026-03-16T02:39:16.175Z
source-changes:
  - add-inbox-driven-manager-worker-control-plane
---

## Summary
Expose a first-class manager orchestration surface so managers can intentionally supervise and drive many workers without raw worker CRUD choreography.

## Requirements
- Manager actions that materially change worker state or routing SHALL remain durable and auditable through worker or ticket-visible records rather than hidden command-only state.
- Manager surfaces SHALL support manager-to-worker messaging, worker supervision over compact state, approval processing, and bounded resume/escalation operations without hand-editing worker artifacts.
- The package SHALL expose a `/manager` command family and `manager_*` tools for inspecting worker fleets, unresolved inbox state, pending approvals, supervision outputs, and resume candidates.

## Scenarios
- A headless manager run can summarize queue state and act on it without interactive UI.
- A manager inspects all active workers, sees two blocked workers and one pending approval, sends one unblock message, approves one completion request, and resumes another worker in one orchestration pass.
