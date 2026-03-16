---
id: persistent-worker-direction-for-pi-workers
title: "Persistent worker direction for pi-workers"
status: synthesized
created-at: 2026-03-16T07:30:36.738Z
updated-at: 2026-03-16T07:32:38.488Z
initiatives: []
specs: []
tickets: []
capabilities: []
artifacts: []
---

## Question
How should `pi-workers` evolve from its current launch-oriented runtime into a persistently addressable worker system, and what useful ideas can be adapted from `.agents/resources/pi-subagents` without importing its one-shot limitations?

## Objective
Produce source-grounded guidance for improving `pi-workers` toward persistent workers that managers and users can continue talking to over time, while preserving Loom's durable worker doctrine and local-first boundaries.

## Status Summary
Synthesis complete. The evidence supports an SDK-first persistent-worker direction, with `pi-subagents` treated as a source of observability and orchestration ideas rather than as a runtime model to copy.

## Scope
- `packages/pi-workers` worker runtime, store, models, and README
- Manager-mediated inbox, observability, recovery, and portability implications
- Reference repo `.agents/resources/pi-subagents` execution, management, and persistence model
- Runtime direction comparison for SDK-backed live workers versus RPC fallback transports

## Non-Goals
- Do not assume remote/distributed multi-host coordination is required in the first phase
- Do not implement changes in this research record
- Do not redesign tickets, plans, or critique layers
- Do not treat `pi-subagents` as a direct template to copy wholesale

## Methodology
- Compare runtime directions against official SDK documentation and authoritative RPC references
- Inspect `.agents/resources/pi-subagents` source files to understand actual runtime and persistence semantics
- Inspect current `pi-workers` source files and tests to distinguish implemented behavior from aspirations
- Synthesize enhancement opportunities while preserving current Loom worker invariants

## Keywords
- live worker sessions
- manager-worker control plane
- persistent workers
- pi-subagents
- pi-workers
- rpc
- sdk

## Hypotheses
(none)

## Conclusions
- `pi-subagents` is not a resident worker system. It is a capable orchestration layer for spawning, tracking, and reviewing one-shot or chained subprocess runs, with good observability but without durable worker identity, mailbox semantics, or live conversational re-entry.
- An SDK-first live-worker path is the best near-term fit because it aligns with the package README, preserves existing worker boundaries, and can reuse official session persistence, resume, streaming input, interruption, and hook surfaces instead of inventing those semantics over RPC first.
- Current `pi-workers` already has the correct high-level domain split for persistent workers: canonical worker truth lives under `.loom/workers`, runtime attachments are clone-local, and manager-mediated inbox/checkpoint semantics are durable and auditable.
- RPC remains useful as a later transport boundary for remote or heterogeneous workers, but if adopted first it would force `pi-workers` to invent protocol, replay, approval, reconnection, and observability semantics at the same time that it is still proving its canonical worker lifecycle.
- The main weakness is not the worker store; it is the runtime model. `runWorkerLaunch()` is still launch-and-finish across all implemented paths: subprocess is one-shot, SDK creates one fresh session and disposes it, and RPC is only a stub.
- To become truthfully persistent, `pi-workers` needs runtime-attachment state and inbox-consumption state beyond today's `launch.json`, plus explicit recovery rules for stale attachments, resume attempts, and session lineage after failures.

## Recommendations
- Add a runtime-local attachment or lease record separate from canonical worker state. It should track transport kind, live session/runtime instance id, last heartbeat, connection status, resumable session id, and clone-local attachment details needed for reconnect and shutdown.
- Add durable inbox cursor or watermark semantics so a live worker can consume new manager messages incrementally rather than receiving a single synthesized launch prompt each time. Preserve the existing pending/acknowledged/resolved lifecycle and durable progress requirements.
- Build a first-class SDK live-session host for workers. Replace the one-shot SDK launch path with a persistent session registry keyed by `workerId` and a durable/resumable session identity, while keeping transport-local handles out of canonical state.
- Persist structured runtime lifecycle events in addition to messages and checkpoints: launch, attach, resume, interrupt, permission request, reconnect, crash, timeout, stale-lease retirement, and terminal outcome. This is the piece of `pi-subagents` worth adapting most directly.
- Route approval and clarification events through the manager-mediated inbox instead of burying them inside a live chat stream. SDK hook and `canUseTool` surfaces make this feasible while preserving Pi Loom's auditable control-plane model.
- Treat RPC as phase two. Once the SDK path proves the worker contract, define an RPC transport that carries the same worker semantics across process or host boundaries without moving canonical truth out of `.loom/workers`.

## Open Questions
- How should durable inbox cursors map onto SDK session resume/continue behavior so replay is deterministic after crashes?
- Should persistent worker sessions be single-tenant per clone with explicit lease ownership, or should the first phase support manager handoff across local processes in one clone only?
- What exact runtime-local attachment record should exist beyond today's `launch.json` to support reconnection without polluting canonical worker state?

## Linked Work
(none)

## Artifacts
(none)
