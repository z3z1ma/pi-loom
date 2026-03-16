---
id: checkpoint-telemetry-and-observability
title: "Checkpoint telemetry and observability"
change: add-workspace-backed-manager-worker-substrate
updated-at: 2026-03-16T02:19:49.118Z
source-changes:
  - add-workspace-backed-manager-worker-substrate
---

## Summary
Make worker progress observable through compact checkpoints and telemetry that enable supervision without sharing full worker context windows.

## Requirements
- Worker dashboards and packets SHALL make stale heartbeats, pending approvals, blockers, latest checkpoints, and consolidation readiness visible at a glance.
- Workers SHALL append structured checkpoints summarizing current understanding, recent changes, validation state, blockers, next intended action, and whether manager input is required.
- Workers SHALL expose compact telemetry or heartbeat state sufficient to distinguish busy, idle, blocked, waiting_for_review, and finished phases without requiring full transcript replay.

## Scenarios
- A long-running worker emits periodic checkpoints that allow a fresh manager process to resume oversight after restart.
- A team dashboard highlights one worker as stale because its heartbeat has not advanced while others remain active.
- A worker requests completion and includes the validation summary that the manager needs for approval.
