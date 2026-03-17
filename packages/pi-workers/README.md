# @pi-loom/pi-workers

Workspace-backed manager-worker execution substrate for pi.

This package adds a first-class worker layer so Pi Loom can model workers as durable execution units with ephemeral runtime workspaces instead of overloading session branching, generic task spawning, or Ralph run state. It also exposes the manager-side control plane used to supervise worker fleets, drain inbox backlog, and coordinate bounded resume/approval behavior. Worker state is persisted durably in SQLite via pi-storage; local runtime workspaces remain ephemeral. Tickets remain the shared durable execution ledger.

## Capabilities

- `/worker` command surface for creating, listing, inspecting, messaging, checkpointing, launching, resuming, approving, consolidating, and retiring workers
- SQLite-backed durable worker records with worker state, metadata, message history, checkpoint history, and audit trail; dashboard views are computed on demand
- ephemeral runtime workspaces for worker execution and local work directories
- durable inbox semantics with explicit pending/acknowledged/resolved lifecycle, unresolved backlog visibility, manager-side inbox resolution, and inbox-aware packets
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

- worker state is persisted durably in SQLite via pi-storage; this is the canonical truth for all worker data including state, metadata, message history, checkpoint history, and inbox state
- dashboards and other rendered views are computed on demand from SQLite data; they are read models, not canonical durable files
- worker runtime workspaces (`.loom/runtime/`) are ephemeral execution environments for the local clone; they are runtime-local, not durable, and should not be committed
- workspace attachment and runtime descriptors are workspace-root-relative or logical descriptors, never clone-local absolute paths
- a clone can resume supervision and worker context from SQLite without requiring any file-backed worker records

## Current control-plane semantics

- manager instructions become durable inbox items rather than transient chat-only nudges
- workers are expected to process unresolved inbox backlog as part of their runs and record acknowledgments, resolutions, escalations, and checkpoints durably
- manager scheduling remains bounded and auditable; it can resume workers and apply supervision decisions without becoming a hidden execution ledger
- SDK-backed workers are the preferred live-worker direction for same-runtime control, while RPC remains a bounded fallback seam rather than the domain model

## Common execution flow

For the basic case, keep the flow simple and explicit:

1. create or read the ticket that will remain the live execution ledger
2. create the worker with that ticket id in `linkedRefs.ticketIds`
3. launch the worker (or resume it later) without forcing a runtime override so it uses the default SDK-backed path

Only force `subprocess` or `rpc` when you intentionally need those runtimes. Do not create orphan workers that are not linked to a ticket, and do not skip directly to manager scheduling when the straightforward ticket -> worker -> launch path is sufficient.

## Layout

Worker state is persisted durably in SQLite via pi-storage. Local runtime workspaces are ephemeral execution environments scoped to the current clone:

```text
.loom/
  runtime/
    <worker-id>/      # ephemeral working directory for worker execution; not durable
```

All durable worker records (state, metadata, message history, checkpoints, inbox items) are stored in SQLite. The filesystem worktree under `.loom/runtime/` is only a local execution environment.

## Local use

```bash
cd packages/pi-workers
omp -e .
```
