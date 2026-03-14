# @pi-loom/pi-workers

Workspace-backed manager-worker execution substrate for pi.

This package adds a first-class worker layer under `.loom/workers/` so Pi Loom can model workers as durable execution units backed by ephemeral workspaces instead of overloading session branching, generic task spawning, or Ralph run state.

## Capabilities

- `/worker` command surface for creating, listing, inspecting, messaging, checkpointing, launching, resuming, approving, consolidating, and retiring workers
- `worker_*` tools for AI-facing worker workflows
- durable worker records with `state.json`, `worker.md`, `messages.jsonl`, `checkpoints.jsonl`, `dashboard.json`, and runtime-only `launch.json`
- portable workspace intent modeled separately from clone-local runtime attachment details
- subprocess-backed worker launch and resume support rooted in provisioned Git worktrees
- durable manager-worker messaging, checkpoints, telemetry, approvals, and consolidation outcomes
- system-prompt guidance that keeps workers distinct from tickets, plans, Ralph, and generic subagents

## Design boundaries

`pi-workers` is intentionally a bounded execution substrate.

- workers are workspace-backed execution units, not session branches or plain task subprocesses
- manager is a role, not a new top-level Loom memory layer
- tickets remain the live execution ledger
- plans remain the execution-strategy layer
- Ralph remains bounded orchestration and may launch or observe worker activity, but does not become the worker graph
- v1 uses manager-mediated coordination by default; unrestricted peer meshes are out of scope

## Artifact policy

- commit canonical worker state: `state.json`, `worker.md`, `messages.jsonl`, `checkpoints.jsonl`, and `dashboard.json`
- treat stored paths in canonical worker state as workspace-root-relative or logical descriptors, never clone-local absolute paths
- do not commit `launch.json`; it is a runtime-only descriptor for local workspace attachment and subprocess execution
- runtime worktree directories belong under ignored runtime paths and are not canonical Loom state

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
