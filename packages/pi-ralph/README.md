# @pi-loom/pi-ralph

SQLite-backed Ralph loop orchestration for pi.

This package adds a bounded Ralph-specific orchestration layer with canonical run state stored in SQLite via pi-storage, allowing long-horizon plan → execute → critique → revise loops to track state, iteration history, and fresh-context launch descriptors without replacing the existing Loom plan, ticket, critique, and docs layers. Ralph executes one bounded iteration at a time, persists useful post-iteration state, and exits so a later human, AI caller, or higher-level orchestrator can decide what to do next.

## Capabilities

- `/ralph` human command for running a bounded Ralph loop from the current conversation and prompt
- `ralph_*` tools for list/read/run/checkpoint workflows
- canonical run records stored in SQLite with iteration history and post-iteration checkpoints; packets and dashboards are rendered on demand from the SQLite store
- policy-aware run state that records linked Loom refs, verifier summaries, critique links, and explicit continuation decisions
- fresh-context launch descriptors plus a default subprocess runtime for single-iteration Ralph launch and resume execution
- extension lifecycle hooks that initialize the Ralph ledger for orchestration state management

## Design boundaries

`pi-ralph` is intentionally narrower than a general workflow engine.

- Ralph is a bounded orchestration primitive, not a replacement for plans, tickets, critique, or higher-level worker/manager abstractions
- plans remain the execution-strategy layer
- tickets remain the live execution ledger and the comprehensive definition of each unit of work
- critique remains the review layer backed by canonical SQLite records
- docs remain the post-completion explanatory layer
- future broader worker orchestration stays outside this package unless explicitly specified

## Artifact policy

- `launch.json` is a runtime-only handoff descriptor for a specific fresh-session or subprocess launch; it should not be treated as durable canonical state
- rendered run records and dashboards are derived views computed on demand from the SQLite store

## Current implementation status

The package ships a human-facing `/ralph` command plus a minimal AI-facing tool surface. `ralph_run` is the primary loop tool: it creates or resumes a run, executes bounded fresh-context subprocess iterations under the hood, and returns durable post-iteration state. `ralph_checkpoint` is the safe low-level commit tool used by a fresh Ralph worker session to persist one complete iteration outcome. SQLite-backed run tracking, policy-aware iteration tracking, post-iteration checkpoint rendering, and subprocess-backed single-iteration execution remain the underlying model.


## Local use

```bash
cd packages/pi-ralph
omp -e .
```
