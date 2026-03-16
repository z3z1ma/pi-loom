# @pi-loom/pi-workers

Workspace-backed manager-worker execution substrate for pi.

This package adds a first-class worker layer under `.loom/workers/` so Pi Loom can model workers as durable execution units backed by ephemeral workspaces instead of overloading session branching, generic task spawning, or Ralph run state. It also exposes the manager-side control plane used to supervise worker fleets, drain inbox backlog, and coordinate bounded resume/approval behavior.

## Capabilities

- `/worker` command surface for creating, listing, inspecting, messaging, checkpointing, launching, resuming, approving, consolidating, and retiring workers
- `/manager` command surface for fleet overview, supervision, manager-side inbox resolution, approvals, scheduling passes, and bounded resume operations
- `worker_*` tools for AI-facing worker workflows
- `manager_*` tools for AI-facing manager orchestration workflows
- durable worker records with `state.json`, `worker.md`, `messages.jsonl`, `checkpoints.jsonl`, `dashboard.json`, and runtime-only `launch.json`
- durable inbox semantics with explicit pending/acknowledged/resolved lifecycle, unresolved backlog visibility, manager-side inbox resolution, and inbox-aware packets
- portable workspace intent modeled separately from clone-local runtime attachment details
- worker runtime abstraction supporting the current subprocess path, an SDK-backed live-worker path, and an RPC fallback seam
- bounded manager scheduler passes over unresolved inbox, telemetry, and approvals, with durable scheduler observations and manager-side inbox resolution support
- durable manager-worker messaging, checkpoints, telemetry, approvals, and consolidation outcomes
- system-prompt guidance that keeps workers distinct from tickets, plans, Ralph, and generic subagents

## Design boundaries

`pi-workers` is intentionally a bounded execution substrate.

- workers are workspace-backed execution units, not session branches or plain task subprocesses
- manager is a role, not a new top-level Loom memory layer
- the manager control plane is polling-driven and bounded in this phase; it is not yet a full actor mesh or mandatory sidecar daemon
- tickets remain the live execution ledger
- plans remain the execution-strategy layer
- Ralph remains bounded orchestration and may launch or observe worker activity, but does not become the worker graph
- v1 uses manager-mediated coordination by default; unrestricted peer meshes are out of scope

## Artifact policy

- commit canonical worker state: `state.json`, `worker.md`, `messages.jsonl`, `checkpoints.jsonl`, and `dashboard.json`
- treat stored paths in canonical worker state as workspace-root-relative or logical descriptors, never clone-local absolute paths
- do not commit `launch.json`; it is a runtime-only descriptor for local workspace attachment and subprocess execution
- runtime worktree directories belong under ignored runtime paths and are not canonical Loom state

## Current control-plane semantics

- manager instructions become durable inbox items rather than transient chat-only nudges
- workers are expected to process unresolved inbox backlog as part of their runs and record acknowledgments, resolutions, escalations, and checkpoints durably
- manager scheduling remains bounded and auditable; it can resume workers and apply supervision decisions without becoming a hidden execution ledger
- SDK-backed workers are the preferred live-worker direction for same-runtime control, while RPC remains a bounded fallback seam rather than the domain model

## Layout

```text
.loom/
  workers/
    <worker-id>/
      state.json
      worker.md
      messages.jsonl
      checkpoints.jsonl
      dashboard.json
      launch.json
```

## Local use

```bash
cd packages/pi-workers
omp -e .
```
