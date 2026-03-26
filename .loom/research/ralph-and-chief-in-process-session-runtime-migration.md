---
id: ralph-and-chief-in-process-session-runtime-migration
title: "Ralph and Chief in-process session runtime migration"
status: synthesized
created-at: 2026-03-21T00:55:38.791Z
tags:
  - architecture
  - chief
  - ralph
  - runtime
  - scheduler
source-refs:
  - .agents/resources/oh-my-pi/docs/sdk.md
  - .agents/resources/oh-my-pi/packages/coding-agent/src/task/executor.ts
  - packages/pi-chief/extensions/domain/manager-runtime.ts
  - packages/pi-ralph/extensions/domain/runtime.ts
---

## Question
How should Pi Ralph and Pi Chief execute bounded iterations so they inherit the current harness session behavior robustly across regular Pi and Oh My Pi, without relying on fragile CLI re-entry?

## Objective
Replace CLI-style Ralph subprocess launches and detached Chief daemon launches with a minimal but correct session-based runtime and in-process scheduler that closely mirrors Oh My Pi's createAgentSession task execution approach while preserving Pi compatibility.

## Status Summary
Implemented a session-runtime adapter in Pi Ralph and cut over bounded iteration execution away from CLI re-entry. Chief no longer spawns detached daemon processes; it now uses an in-process scheduler on the parent event loop and preserves parent harness/session metadata for later manager and worker iterations.

## Scope
- packages/pi-chief/extensions/domain/manager-runtime.ts
- packages/pi-chief/extensions/domain/runtime.ts
- packages/pi-ralph/extensions/domain/loop.ts
- packages/pi-ralph/extensions/domain/runtime.ts
- runtime tests for pi-ralph and pi-chief

## Non-Goals
- Changing durable store semantics beyond runtime-local launch metadata if needed
- Depending exclusively on Oh My Pi-specific APIs
- Rewriting Ralph or Chief into a new memory layer

## Methodology
- Compare regular Pi SDK capabilities against Oh My Pi executor behavior
- Implement the smallest cross-harness session runtime that preserves current parent session model/auth/runtime context truthfully
- Inspect current Ralph and Chief runtime launch paths and failure modes
- Read Oh My Pi task executor and SDK usage to identify the minimal createAgentSession pattern to emulate
- Replace detached Chief daemons with an in-process scheduler on the parent event loop

## Keywords
- chief
- createAgentSession
- manager
- omp
- pi
- ralph
- runtime
- scheduler
- worker

## Conclusions
- Bun-vs-Node portability matters only at the harness SDK resolution/runtime layer after the daemon removal; Chief no longer needs TS script child-process launching semantics at all.
- CLI argv preservation alone was insufficient because detached Chief daemons still lost the parent harness session semantics; the correct abstraction boundary was the session runtime, not the CLI command line.
- Detached Chief daemons were unnecessary architectural scaffolding once bounded execution moved to session-backed launches; a process-local scheduler is simpler, more truthful, and avoids cross-process runtime drift.
- Oh My Pi's task system is robust primarily because it creates fresh agent sessions directly; Pi Loom can emulate the same behavior without hard depending on OMP by dynamically resolving the current harness SDK package and using createAgentSession with in-memory session managers.

## Recommendations
- Keep future Ralph and Chief runtime work on the session-runtime plus in-process scheduler path and avoid reintroducing CLI prompt re-entry or detached daemons for bounded iterations.
- Treat runtime-only model/auth forwarding as local execution metadata, not canonical Loom state, and preserve package README/prompt guidance wording so the codebase stays truthful about session-backed execution and in-process scheduling.

## Open Questions
- Whether Pi Loom should eventually expose a first-class reusable in-process background scheduler utility for other packages that need parent-process event-loop orchestration.

## Linked Work
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)

## Hypotheses
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)

## Artifacts
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)
