---
id: sdk-first-live-workers
title: "SDK-first live workers with RPC fallback"
change: add-inbox-driven-manager-worker-control-plane
updated-at: 2026-03-16T02:39:16.175Z
source-changes:
  - add-inbox-driven-manager-worker-control-plane
---

## Summary
Add a same-runtime SDK-backed worker host as the preferred next live-worker direction while preserving RPC as a transport fallback when stronger process isolation is needed.

## Requirements
- If an RPC-backed worker runtime is introduced in this phase, it SHALL satisfy the same durable worker contract and be clearly documented as a fallback transport path rather than the primary domain model.
- The package SHALL keep the current subprocess runtime available as a baseline or compatibility path while SDK-backed workers are introduced incrementally.
- The worker package SHALL add an SDK-backed worker runtime implementation that can host a live worker session while preserving durable worker truth outside the session.

## Scenarios
- A deployment that prefers process isolation uses an RPC-backed worker path without changing worker semantics.
- A manager resumes a worker through an SDK-backed live session and still sees durable inbox/checkpoint state update correctly.
