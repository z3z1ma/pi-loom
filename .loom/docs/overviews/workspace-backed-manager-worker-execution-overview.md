---
id: workspace-backed-manager-worker-execution-overview
title: "Workspace-backed manager-worker execution overview"
status: active
type: overview
section: overviews
audience:
  - ai
  - human
source: spec:add-inbox-driven-manager-worker-control-plane
topics: []
outputs: []
upstream-path: null
---

# Workspace-backed manager-worker execution overview

## Why this layer exists
Pi Loom now includes a dedicated worker substrate because long-horizon execution needed a truthful representation of parallel work that was stronger than transcript branching, generic task subprocesses, or Ralph run state. Workers are durable execution units backed by ephemeral workspaces, typically Git worktrees, and are supervised by managers from outside the worker context window.

The initial worker rollout solved the foundation problem: workers became first-class durable records with runtime attachment, messaging, checkpoints, approval, and consolidation. The next control-plane phase made that substrate more useful by adding a durable inbox protocol, an explicit manager surface, runtime abstraction, SDK-backed live-worker support, an RPC fallback seam, and bounded manager scheduling.

## What is a worker
A worker is not a session branch, not a generic subagent, and not a Ralph run. A worker is a durable record under `.loom/workers/<worker-id>/` that captures:
- stable worker identity
- objective and summary
- manager source reference
- linked ticket/spec/plan/research/initiative/critique/Ralph/doc refs
- portable workspace intent
- durable inbox/messages and checkpoints
- telemetry and heartbeat state
- completion request, approval, and consolidation outcomes
- runtime kind and runtime-only launch descriptor state

Canonical worker artifacts are:
- `state.json`
- `worker.md`
- `messages.jsonl`
- `checkpoints.jsonl`
- `dashboard.json`

`launch.json` is runtime-only and not canonical committed truth.

## Durable inbox protocol
Manager instructions are now durable inbox items rather than transient chat nudges. Message records distinguish manager instructions, acknowledgments, resolutions, escalations, and bounded broadcast notices. The important invariant is that manager-originated actionable messages cannot be silently ignored: workers should acknowledge, resolve, or escalate them explicitly.

This durable inbox protocol is what allows the manager to supervise from compact state instead of from transcript archaeology.

## Worker turn semantics
Workers are expected to process unresolved inbox backlog as part of their runs. The worker packet now carries an explicit run contract:
- read unresolved inbox state before starting substantive work
- acknowledge, resolve, or escalate actionable manager instructions
- record checkpoints that reflect both implementation progress and inbox-processing progress
- re-check inbox state before stopping
- stop only at bounded conditions such as inbox empty, blocked on manager input, requesting review, or an explicit policy budget boundary

This is still a bounded, durable control plane rather than a full always-on actor daemon.

## Manager role and control plane
Manager is a role, not a new Loom memory layer. The package now exposes manager-side control surfaces through `/manager` and `manager_*`. Managers can:
- inspect worker fleets and queue state
- supervise workers from compact durable state
- send manager-to-worker instructions
- acknowledge or resolve manager-owned inbox backlog from worker escalations and clarifications
- process approvals
- trigger bounded scheduling passes
- prepare or resume workers when backlog requires another run

The manager control plane is intentionally polling-driven and bounded in this phase. It is useful autonomy, not yet a full actor mesh.

## Runtime model
V1 worker runtime was subprocess-only. The current package now treats subprocess as one runtime strategy behind a runtime abstraction. The preferred next live-worker direction is SDK-backed runtime because it offers same-process session control and event subscriptions. RPC remains a bounded fallback seam when stronger process separation is needed. In all cases, Pi Loom continues to own worker semantics, inbox state, approvals, and worktree lifecycle; Pi remains the agent/session engine.

## Workspace model
Workers still use Git worktrees as the runtime backing strategy. Canonical worker state stores portable workspace intent such as base ref, branch, strategy, and logical runtime path. Clone-local absolute workspace paths are runtime-only and are kept out of committed worker state.

## Relationship to the rest of Loom
The worker substrate complements existing layers instead of replacing them:
- tickets remain the live execution ledger
- plans remain execution strategy
- Ralph remains bounded orchestration and may launch or observe worker activity without becoming the worker graph
- critique remains the durable review layer
- docs remain the post-completion explanation layer

Workers update linked ticket history and add worker external refs so execution can be traced without duplicating ticket truth.

## Recovery and observability
Workers can be provisioned, launched, resumed, supervised, approved, consolidated, retired, and now scheduled through the worker package. Recovery is based on durable worker state plus runtime-only descriptors, not on a monolithic transcript. Dashboards and packets surface unresolved inbox backlog, acknowledged backlog, pending approvals, runtime kind, and last scheduler observations so a replacement manager session can understand the queue without hidden in-memory state.

## Architectural boundary to protect
Do not treat workers as a replacement ticket ledger or as a backdoor way to turn Ralph into a general workflow engine. Do not confuse bounded polling/scheduling with a finished actor mesh. The worker layer exists to make workspace-backed execution truthful and durable while preserving the responsibilities of the surrounding Loom layers.
