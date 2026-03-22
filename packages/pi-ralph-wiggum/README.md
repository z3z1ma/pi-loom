# @pi-loom/pi-ralph-wiggum

SQLite-backed Ralph managed-loop orchestration for pi.

This package adds a bounded Ralph-specific orchestration layer with canonical run state stored in SQLite via pi-storage. Ralph now manages one durable, plan-anchored loop per workspace: it keeps the run truthful between fresh-context worker launches, advances the governing plan ticket-by-ticket, and exits only when the plan is complete or the operator stops, pauses, or steers the loop.

## Capabilities

- `/ralph` human command surface for `start`, `stop`, `steer`, and `status`
- `ralph_run`, `ralph_steer`, `ralph_stop`, `ralph_read`, and Ralph-native background job tools for AI callers
- canonical run records stored in SQLite with iteration history, packet context, queued steering, and post-iteration checkpoints
- one managed Ralph loop per workspace so the active governing plan stays unambiguous
- plan-anchored execution where the governing spec is inherited from the plan when present
- fresh-context ticket iterations with durable runtime artifacts for launch lifecycle, tool activity, streamed assistant output, stderr, and failures
- background execution backed by an in-process async job manager so long-running loops can be started, inspected, awaited, and cancelled without losing durable run truth
- explicit operator control over start/stop/steer/status instead of transcript-only orchestration
- ticket synthesis when a governing plan has no linked tickets yet, followed by review-aware pausing if the plan still lacks executable ticket scope
- runtime-limit and token-budget enforcement that halts runs explicitly when bounded execution exceeds the configured policy
- extension lifecycle hooks that initialize the Ralph ledger for orchestration state management

## Design boundaries

`pi-ralph-wiggum` is intentionally narrower than a general workflow engine.

- Ralph is the managed loop layer, not a replacement for plans, tickets, critique, or docs
- plans remain the execution-strategy layer and define the governing scope Ralph follows
- tickets remain the live execution ledger and the comprehensive definition of each unit of work
- critique remains the review layer backed by canonical SQLite records
- docs remain the post-completion explanatory layer
- broader orchestration concerns stay outside this package unless explicitly specified

## Artifact policy

- `launch.json` is a runtime-only handoff descriptor for a specific fresh-session or session-runtime launch; it is not durable canonical state
- runtime artifacts are durable per-iteration execution records: they are not the source of loop truth, but they are the primary observability surface for what the worker actually did
- rendered run records and dashboards are derived views computed on demand from the SQLite store

## Current implementation status

The package ships a human-facing `/ralph` command plus an AI-facing tool surface centered on the managed plan loop.

Human command usage:

- `/ralph start <plan-ref> [steering prompt]` — start the managed loop for a governing plan, or continue the existing loop for that same plan
- `/ralph stop [run-ref]` — request that the active managed loop stop cleanly
- `/ralph steer <text>` or `/ralph steer ref <run-ref> <text>` — queue durable steering for the next iteration boundary
- `/ralph status [run-ref]` — inspect the current durable loop state

AI tool usage:

- use `ralph_run` to start a new managed loop with `planRef`, or continue an existing loop with `ref`
- use `ralph_steer` to add durable steering without relying on ambient transcript state
- use `ralph_stop` to stop the loop cleanly, optionally cancelling the active background job
- use `ralph_read` to inspect packets, dashboards, queued steering, and durable run state between iterations
- use `ralph_job_read`, `ralph_job_wait`, and `ralph_job_cancel` for explicit background-job inspection, waiting, and cancellation

`ralph_run` is the primary loop tool. It creates or resumes the single managed loop for the workspace, anchors execution to the governing plan, inherits the governing spec from that plan when present, and runs fresh-context bounded iterations until the plan ticket graph is complete or the loop pauses, halts, or is stopped. There is no separate planning-mode Ralph run surface anymore: if a plan lacks linked tickets, Ralph performs ticket synthesis inside the managed loop and pauses for operator review if the plan still has no executable tickets afterward.

`ralph_checkpoint` remains the only trusted way for a fresh Ralph worker session-runtime launch to commit a bounded iteration outcome. A session-runtime exit without a durable checkpoint is treated as failure and recorded as such.

## Local use

```bash
cd packages/pi-ralph-wiggum
omp -e .
```
