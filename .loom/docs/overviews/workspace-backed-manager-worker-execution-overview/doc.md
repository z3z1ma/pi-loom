---
id: workspace-backed-manager-worker-execution-overview
title: "Workspace-backed manager-worker execution overview"
status: active
type: overview
section: overviews
audience:
  - ai
  - human
source: spec:add-workspace-backed-manager-worker-substrate
updated-at: 2026-03-16T00:46:28.139Z
topics: []
outputs:
  - AGENTS.md
  - packages/pi-workers/README.md
  - README.md
---

# Workspace-backed manager-worker execution overview

## Why this layer exists
Pi Loom now includes a dedicated worker substrate because long-horizon execution needed a truthful representation of parallel work that was stronger than transcript branching, generic task subprocesses, or Ralph run state. Workers are durable execution units backed by ephemeral workspaces, typically Git worktrees, and are supervised by managers from outside the worker context window.

## What is a worker
A worker is not a session branch, not a generic subagent, and not a Ralph run. A worker is a durable record under `.loom/workers/<worker-id>/` that captures:
- stable worker identity
- objective and summary
- manager source reference
- linked ticket/spec/plan/research/initiative/critique/Ralph/doc refs
- portable workspace intent
- durable messages and checkpoints
- telemetry and heartbeat state
- completion request, approval, and consolidation outcomes

Canonical worker artifacts are:
- `state.json`
- `worker.md`
- `messages.jsonl`
- `checkpoints.jsonl`
- `dashboard.json`

`launch.json` is runtime-only and not canonical committed truth.

## Workspace model
V1 uses Git worktrees as the runtime backing strategy. Canonical worker state stores portable workspace intent such as base ref, branch, strategy, and logical runtime path. Clone-local absolute workspace paths are runtime-only and are kept out of committed worker state.

## Manager role
Manager is a role, not a new Loom memory layer. A manager may be a human-led session or another orchestration surface. Managers:
- allocate work to workers
- supervise from compact telemetry, checkpoints, and recent messages
- intervene differently when a worker is busy versus idle or blocked
- approve or reject completion requests
- own fan-in and consolidation decisions

The supervision loop deliberately borrows from `pi-supervisor`: compact state, out-of-band oversight, busy/idle distinction, and anti-stagnation rules.

## Relationship to the rest of Loom
The worker substrate complements existing layers instead of replacing them:
- tickets remain the live execution ledger
- plans remain execution strategy
- Ralph remains bounded orchestration and may launch or observe worker activity without becoming the worker graph
- critique remains the durable review layer
- docs remain the post-completion explanation layer

Workers update linked ticket history and add worker external refs so execution can be traced without duplicating ticket truth.

## Operator surface
The package ships:
- `/worker` commands
- `worker_*` tools
- prompt guidance that teaches the worker/manager boundaries

The operator surface is headless-safe. Durable state and tool outputs are canonical; UI affordances are optional conveniences.

## Runtime and recovery
Workers can be provisioned, launched, resumed, supervised, approved, consolidated, and retired through the worker package. Recovery is based on durable worker state plus runtime-only descriptors, not on a monolithic transcript. If a local worktree disappears, the worker can be reprovisioned without changing its durable identity.

## Architectural boundary to protect
Do not treat workers as a replacement ticket ledger or as a backdoor way to turn Ralph into a general workflow engine. The worker layer exists to make workspace-backed execution truthful and durable while preserving the responsibilities of the surrounding Loom layers.
