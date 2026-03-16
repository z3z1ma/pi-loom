---
id: out-of-band-supervisory-control
title: "Out-of-band supervisory control"
change: add-workspace-backed-manager-worker-substrate
updated-at: 2026-03-16T02:19:49.118Z
source-changes:
  - add-workspace-backed-manager-worker-substrate
---

## Summary
Reuse pi-supervisor’s strongest ideas at worker granularity so managers supervise compact worker state from outside the worker context window.

## Requirements
- Managers SHALL supervise workers from compact telemetry, recent checkpoints, recent message deltas, and intervention history rather than from full worker transcript context.
- The substrate SHALL persist interventions and enforce anti-stagnation policies that escalate, reassign, approve, or retire work after repeated no-progress checkpoints, repeated identical blockers, or repeated ineffective interventions.
- The supervisory policy SHALL distinguish busy execution from idle, blocked, waiting, or completion-requesting states and apply stricter interruption thresholds during active work than during idle or blocked phases.

## Scenarios
- A worker becomes idle after asking for approval, and the manager must respond with approval, rejection, or a redirect instead of waiting indefinitely.
- A worker is actively editing and testing, so the manager defers interruption until a clear drift signal appears.
- A worker loops on the same blocker three checkpoints in a row and the manager escalates rather than repeating the same instruction.
