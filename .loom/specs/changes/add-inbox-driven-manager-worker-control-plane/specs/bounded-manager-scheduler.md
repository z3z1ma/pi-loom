---
id: bounded-manager-scheduler
title: "Bounded manager scheduler"
change: add-inbox-driven-manager-worker-control-plane
updated-at: 2026-03-16T02:39:16.175Z
source-changes:
  - add-inbox-driven-manager-worker-control-plane
---

## Summary
Automate the manager’s polling and orchestration loop enough to reduce manual babysitting without introducing a mandatory sidecar or full actor mesh.

## Requirements
- Scheduler decisions that materially affect worker progress SHALL remain durable and auditable rather than hidden in ephemeral scheduler memory.
- The manager control plane SHALL support a bounded scheduler loop that scans workers, evaluates unresolved inbox state and telemetry, and decides whether to message, resume, escalate, or process approval for each worker.
- The scheduler SHALL respect worker busy/idle/blocked/review states and SHALL preserve the manager as the authority for approval and consolidation boundaries.

## Scenarios
- A bounded manager pass scans five workers, resumes two, escalates one repeated blocker, and surfaces one pending approval for explicit manager action.
- A scheduler loop continues making progress for several passes without requiring a human between every worker turn.
