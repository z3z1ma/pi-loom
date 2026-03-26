---
id: ralph-runtime-execution-and-observability-overview
title: "Ralph runtime execution and observability overview"
status: active
type: overview
section: overviews
audience:
  - ai
  - human
source: workspace:pi-loom
topics:
  - async-jobs
  - observability
  - ralph
  - runtime
outputs:
  - https-github-com-z3z1ma-pi-loom-git:packages/pi-ralph/README.md
upstream-path: null
---

# Ralph runtime execution and observability overview

## What changed

`pi-ralph` still owns bounded Ralph orchestration state — runs, iterations, verifier summaries, critique links, continuation decisions, packets, and dashboards — but its execution substrate is no longer a thin opaque session-runtime wrapper. The package now records durable per-iteration runtime artifacts and exposes Ralph-native background job control for long-running bounded iterations.

## Execution model

A `ralph_run` call still creates or resumes a bounded Ralph run and prepares exactly one fresh-context session-runtime iteration at a time. The difference is that execution is now observable and truth-preserving while it happens:

- foreground `ralph_run` streams progress updates from the session-runtime worker
- background `ralph_run(background=true)` starts a tracked Ralph job and returns a job id immediately
- `ralph_job_read`, `ralph_job_wait`, and `ralph_job_cancel` provide explicit control over that in-process background work
- `ralph_read` includes the durable run plus any currently tracked background jobs for that run in the current process

The async job manager is intentionally process-local. Durable truth still lives in the Ralph run state and runtime artifacts so the orchestration record remains intelligible even if a host process exits.

## Runtime artifacts

Each launched iteration now accumulates a durable runtime artifact keyed to the iteration id. The artifact captures:

- launch lifecycle state (`queued`, `running`, `completed`, `failed`, `cancelled`)
- launch descriptor metadata and runtime command/args
- streamed assistant output observed during the session-runtime execution
- tool execution events with timestamps
- stderr or runtime failure text
- exit code and completion timestamps
- whether the worker exited without a trusted `ralph_checkpoint`
- the background job id when the iteration was launched via background mode

These artifacts are an observability surface, not the continuation-policy source of truth. Ralph decisions still come from the run state, verifier state, critique state, and explicit `ralph_checkpoint` outcomes.

## Strict checkpoint semantics

`ralph_checkpoint` remains the only trusted completion primitive for a bounded Ralph iteration. A session-runtime exit is not treated as success on its own. If a launched iteration exits without leaving a trusted checkpoint for the launched iteration id, Ralph now records a durable failure artifact and updates the run accordingly. Cancellation is also explicit rather than being mistaken for a plausible success path.

## Why this matters

This change makes Ralph debuggable and safer to operate:

- callers can distinguish queued, running, cancelled, failed, and checkpointed completion states
- missing-checkpoint failures become visible in durable runtime artifacts instead of disappearing into a silent exit
- long-running bounded iterations no longer require foreground babysitting
- postmortems can inspect what the worker actually emitted and which tools it touched

## Boundaries

This does not turn Ralph into a general-purpose task or worker framework. The package still owns bounded Ralph orchestration only. Plans, tickets, critique, docs, and higher-level manager/worker orchestration remain separate Loom layers. The async job manager and runtime artifacts exist to make Ralph's bounded execution substrate truthful and observable, not to replace those other layers.
