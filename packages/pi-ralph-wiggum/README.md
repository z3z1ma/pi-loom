# @pi-loom/pi-ralph-wiggum

SQLite-backed Ralph loop orchestration for pi.

This package adds a bounded Ralph-specific orchestration layer with canonical run state stored in SQLite via pi-storage, allowing long-horizon plan → execute → critique → revise loops to track state, iteration history, and fresh-context launch descriptors without replacing the existing Loom plan, ticket, critique, and docs layers. Ralph executes one bounded iteration at a time, persists useful post-iteration state, and exits so a later human, AI caller, or higher-level orchestrator can decide what to do next.

## Capabilities

- `/ralph` human command for running either spec-anchored planning iterations or plan-and-ticket-anchored execution iterations
- `ralph_*` tools for list/read/run/checkpoint workflows plus Ralph-native background job inspection, waiting, and cancellation
- canonical run records stored in SQLite with iteration history and post-iteration checkpoints; packets and dashboards are rendered on demand from the SQLite store
- policy-aware run state that records authoritative Loom execution scope, verifier summaries, critique links, explicit continuation decisions, and packet context snapshots
- fresh-context launch descriptors plus a default session runtime for single-iteration Ralph launch and resume execution
- durable per-iteration runtime artifacts that capture launch lifecycle, streamed assistant output, tool execution events, stderr/error text, and missing-checkpoint failures
- runtime-limit and token-budget enforcement that halts runs explicitly when bounded execution exceeds the configured policy
- strict resume/checkpoint integrity: resumed runs do not inherit ambient transcript context, stale checkpoint ids are rejected, one bounded iteration executes per call, and a fresh continuation decision is required before a post-iteration relaunch
- task-style TUI rendering for `ralph_run` and Ralph job tools, plus structured human command result/error messages for `/ralph`
- background Ralph execution backed by an in-process async job manager so long-running bounded iterations can be started, inspected, awaited, and cancelled without losing durable run truth
- extension lifecycle hooks that initialize the Ralph ledger for orchestration state management

## Design boundaries

`pi-ralph-wiggum` is intentionally narrower than a general workflow engine.

- Ralph is a bounded orchestration primitive, not a replacement for plans, tickets, critique, or a general-purpose orchestration layer
- plans remain the execution-strategy layer
- tickets remain the live execution ledger and the comprehensive definition of each unit of work
- critique remains the review layer backed by canonical SQLite records
- docs remain the post-completion explanatory layer
- broader orchestration concerns stay outside this package unless explicitly specified

## Artifact policy

- `launch.json` is a runtime-only handoff descriptor for a specific fresh-session or session-runtime launch; it should not be treated as durable canonical state
- runtime artifacts are durable per-iteration execution records: they are not the source of continuation truth, but they are the primary observability surface for what the session runtime actually did
- rendered run records and dashboards are derived views computed on demand from the SQLite store

## Current implementation status

The package ships a human-facing `/ralph` command plus an AI-facing tool surface centered on `ralph_run`, `ralph_read`, `ralph_checkpoint`, and Ralph-native background job helpers. `ralph_run` is the primary loop tool: it creates or resumes a run anchored to explicit Loom scope, executes exactly one bounded fresh-context session-runtime iteration, streams progress during foreground execution, and can launch the same one-iteration work in background when the caller wants a job id instead of blocking.

Human command usage:

- `/ralph plan <spec-ref> [steering prompt]` — create a spec-anchored planning run that exists to create or refine a Loom workplan
- `/ralph run <spec-ref> <plan-ref> <ticket-ref> [steering prompt]` — create an execution run anchored to one governing spec, one governing plan, and one active ticket
- `/ralph resume <run-ref> [steering prompt]` — resume a durable run explicitly, without implicitly injecting the ambient transcript into the fresh iteration packet

`ralph_checkpoint` remains the only trusted way for a fresh Ralph session-runtime launch to commit a bounded iteration outcome. A session-runtime exit without a durable checkpoint is treated as failure and recorded as such. SQLite-backed run tracking, policy-aware iteration tracking, authoritative spec/plan/ticket scope, durable packet lineage, central continuation decisions, durable runtime artifact capture, background job lifecycle management, and session-backed single-iteration execution now make up the underlying execution model.


## Local use

```bash
cd packages/pi-ralph-wiggum
omp -e .
```
