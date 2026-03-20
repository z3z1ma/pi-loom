# @pi-loom/pi-workers

Ralph-backed manager-worker execution substrate for pi.

This package adds a first-class worker layer so Pi Loom can model workers as durable assignment and supervision records around linked Ralph runs instead of maintaining a second execution runtime beside Ralph. It also exposes the manager-side control plane used to supervise worker fleets, drain inbox backlog, provision isolated git worktrees, launch one Ralph iteration at a time, and coordinate bounded approval/consolidation behavior. Worker state is persisted durably in SQLite via pi-storage; local runtime workspaces remain ephemeral. Tickets remain the shared durable execution ledger.

## Capabilities

- manager and worker tool surfaces for creating, listing, inspecting, messaging, checkpointing, launching, resuming, approving, consolidating, and retiring Ralph-backed workers
- SQLite-backed durable worker records with worker state, metadata, message history, checkpoint history, and audit trail; dashboard views are computed on demand
- ephemeral runtime workspaces for running linked Ralph iterations in isolated local work directories
- durable inbox semantics with explicit pending/acknowledged/resolved lifecycle, unresolved backlog visibility, manager-side inbox resolution, and inbox-aware packets
- durable manager-worker messaging, checkpoints, telemetry, approvals, and consolidation outcomes
- system-prompt guidance that keeps workers distinct from tickets, plans, Ralph, and generic subagents

## Design boundaries

`pi-workers` is intentionally a bounded manager-facing execution substrate.

- workers are durable assignment wrappers over linked Ralph runs, not session branches, plain task subprocesses, or a parallel execution engine
- manager is a role, not a new top-level Loom memory layer
- the manager control plane is polling-driven and bounded in this phase; it is not yet a full actor mesh or mandatory sidecar daemon
- tickets remain the live execution ledger
- plans remain the execution-strategy layer
- Ralph remains the canonical bounded iteration engine under workers; `pi-workers` does not replace Ralph with a second runtime model
- v1 uses manager-mediated coordination by default; unrestricted peer meshes are out of scope

## Artifact policy

- worker state is persisted durably in SQLite via pi-storage; this is the canonical truth for all worker data including state, metadata, message history, checkpoint history, and inbox state
- dashboards and other rendered views are computed on demand from SQLite data; they are read models, not canonical durable files
- worker runtime workspaces are ephemeral execution environments for the local clone where linked Ralph iterations run; they are runtime-local, not durable, and should not be committed
- workspace attachment and runtime descriptors are workspace-root-relative or logical descriptors, never clone-local absolute paths
- a clone can resume supervision and worker context from SQLite without requiring any file-backed worker records

## Current control-plane semantics

- manager instructions become durable inbox items rather than transient chat-only nudges
- workers are expected to process unresolved inbox backlog as part of their runs and record acknowledgments, resolutions, escalations, and checkpoints durably
- manager scheduling remains bounded and auditable; it resumes workers by launching the next linked Ralph iteration and applying supervision decisions between iterations rather than becoming a hidden execution ledger
- steerability happens through durable worker and Ralph state between iterations, not through intra-iteration runtime control

## Common execution flow

For the basic case, keep the flow simple and explicit:

1. create or read the ticket that will remain the live execution ledger
2. create the worker with that ticket id in `linkedRefs.ticketIds`
3. let the manager or higher-level orchestrator provision an isolated git worktree for the worker when needed
4. launch the worker (or resume it later) so it prepares and runs the next linked Ralph iteration inside that worktree

Do not create orphan workers that are not linked to a ticket, and do not treat workers as a standalone runtime abstraction separate from Ralph. The straightforward ticket -> worker -> Ralph iteration flow is the default.

## Runtime environment

Worker state is persisted durably in SQLite via pi-storage. Local runtime workspaces are ephemeral execution environments scoped to the current clone. All durable worker records (state, metadata, message history, checkpoints, inbox items, linked Ralph refs, approvals, consolidation outcomes) are stored in SQLite; the runtime workspace directory is only a local execution environment.

## Local use

```bash
cd packages/pi-workers
omp -e .
```
