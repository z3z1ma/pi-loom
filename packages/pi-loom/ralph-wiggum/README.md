# pi-loom/ralph-wiggum

SQLite-backed Ralph managed-loop orchestration for pi.

This package adds a bounded Ralph-specific orchestration layer with canonical run state stored in SQLite via pi-storage. Ralph runs are ticket-bound: each run is durably tied to one ticket, optionally anchored to a governing plan when one is supplied or inferable, keeps that ticket's orchestration state truthful between fresh-context worker launches, and exits only when the ticket run completes or the operator stops, pauses, or steers it.

## Capabilities

- `/ralph` human command surface for `start`, `stop`, `steer`, and `status`
- `ralph_run`, `ralph_steer`, `ralph_stop`, `ralph_read`, and Ralph-native background job tools for AI callers
- `ralph_list` is broad-text-first; exact-match narrowing parameters are prefixed with `exact*`, and zero-result overfiltered searches surface broader-match diagnostics instead of a bare empty state
- canonical run records stored in SQLite with system-owned run ids derived from the effective plan/ticket binding (using a ticket-only sentinel when no plan applies), packet context, queued steering, and revisable latest-iteration state synthesized from ticket-ledger activity
- multiple Ralph runs may coexist in one workspace when they do not target the same ticket concurrently
- plan-anchored execution where the governing spec is inherited from the plan when present
- fresh-context ticket iterations with durable runtime artifacts for launch lifecycle, tool activity, streamed assistant output, stderr, and failures, plus detection of missing bound-ticket activity
- background execution backed by an in-process async job manager so long-running loops can be started, inspected, awaited, and cancelled without losing durable run truth
- explicit operator control over start/stop/steer/status instead of transcript-only orchestration
- runtime-limit and token-budget enforcement that halts runs explicitly when bounded execution exceeds the configured policy
- extension lifecycle hooks that initialize the Ralph ledger for orchestration state management

## Design boundaries

`pi-loom` is intentionally narrower than a general workflow engine.

- Ralph is the managed loop layer, not a replacement for plans, tickets, critique, or docs
- plans remain the execution-strategy layer and define the governing scope Ralph follows
- tickets remain the live execution ledger and the comprehensive definition of each unit of work
- critique remains the review layer backed by canonical SQLite records
- docs remain the post-completion explanatory layer
- broader orchestration concerns stay outside this package unless explicitly specified

## Artifact policy

- `launch.json` is a runtime-only handoff descriptor for a specific fresh-session or session-runtime launch; it is not durable canonical state
- runtime artifacts are durable per-iteration execution records: they are not the source of loop truth, but they are the primary observability surface for what the worker actually did
- Ralph synthesizes each latest bounded iteration from the bound ticket before/after a worker launch; iteration and runtime records remain revisable observability keyed by iteration id rather than an immutable append-only history API
- rendered run records and dashboards are derived views computed on demand from the SQLite store

## Current implementation status

The package ships a human-facing `/ralph` command plus an AI-facing tool surface centered on ticket-bound Ralph runs.

Human command usage:

- `/ralph start <ticket-ref> [steering prompt]` — run the ticket-bound Ralph loop until that ticket completes or no further truthful progress is possible
- `/ralph start <plan-ref> [steering prompt]` — iterate the plan's linked tickets until they complete or no further truthful progress is possible
- `/ralph start <plan-ref> <ticket-ref> [steering prompt]` — run the Ralph loop for one exact plan/ticket binding
- `/ralph stop <ticket-ref>` or `/ralph stop <plan-ref> <ticket-ref>` — request that the targeted Ralph run stop cleanly
- `/ralph steer <ticket-ref> <text>` or `/ralph steer <plan-ref> <ticket-ref> <text>` — queue minor additive steering for the next iteration boundary of the targeted run
- `/ralph status <ticket-ref>` or `/ralph status <plan-ref> <ticket-ref>` — inspect the current durable state of the targeted run

AI tool usage:

- use `ralph_run` with required `ticketRef` and optional `planRef` to create or continue the system-owned run for that ticket binding
- use `ralph_steer`, `ralph_stop`, and `ralph_read` with the same `ticketRef` and optional `planRef` to manipulate or inspect the targeted run without choosing run ids in AI input
- use `ralph_job_read`, `ralph_job_wait`, and `ralph_job_cancel` for explicit background-job inspection, waiting, and cancellation

`ralph_run` is the primary loop tool. It creates or resumes the system-owned Ralph run for one exact `ticketRef` plus its effective plan binding, inherits the governing spec from the plan when one is present, and runs fresh-context bounded iterations against that ticket until the run pauses, halts, or completes. The bound ticket is the authoritative execution ledger: the worker is expected to keep ticket status, body, journal, verification, and blockers truthful during the iteration, and Ralph synthesizes the latest bounded iteration from those ticket changes after the worker exits. Parallelism is therefore explicit: different tickets may run in parallel, but the same ticket must not have two Ralph runs executing at once.

`ralph_steer` is intentionally narrow. Steering is additive context for the next iteration boundary, not a second source of truth. It can clarify priorities or carry a newly discovered constraint, but it must not replace the governing ticket or be used to micromanage Ralph's base operating discipline.

## Local use

```bash
cd packages/pi-loom
omp -e .
```
