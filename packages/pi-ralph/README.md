# @pi-loom/pi-ralph

SQLite-backed Ralph loop orchestration for pi.

This package adds a bounded Ralph-specific orchestration layer with canonical run state stored in SQLite via pi-storage, allowing long-horizon plan → execute → critique → revise loops to track state, iteration history, and fresh-context launch descriptors without replacing the existing Loom plan, ticket, critique, and docs layers.

## Capabilities

- `/ralph` command surface for init/create/list/show/packet/update/iteration/verifier/critique/decide/launch/resume/dashboard flows
- `ralph_*` tools for list/read/write/launch/resume/dashboard workflows
- canonical run records stored in SQLite with iteration history; packets and dashboards are rendered on demand from the SQLite store
- policy-aware run state that records linked Loom refs, verifier summaries, critique links, and explicit continuation decisions
- fresh-context launch descriptors plus a default subprocess runtime for bounded Ralph launch and resume execution
- extension lifecycle hooks that initialize the Ralph ledger for orchestration state management

## Design boundaries

`pi-ralph` is intentionally narrower than a general workflow engine.

- Ralph is a bounded orchestration primitive, not a replacement for plans, tickets, or critique
- plans remain the execution-strategy layer
- tickets remain the live execution ledger and the comprehensive definition of each unit of work
- critique remains the review layer backed by canonical SQLite records
- docs remain the post-completion explanatory layer
- future broader worker orchestration stays outside this package unless explicitly specified

## Artifact policy

- `launch.json` is a runtime-only handoff descriptor for a specific fresh-session or subprocess launch; it should not be treated as durable
- rendered run records and dashboards are derived views computed on demand from the SQLite store

## Current implementation status

The package already ships the `/ralph` command namespace, `ralph_*` tools, SQLite-backed run tracking, policy-aware iteration tracking, dashboard rendering, interactive fresh-session handoff preparation, and subprocess-backed launch/resume execution rooted in the package extension workspace.


## Local use

```bash
cd packages/pi-ralph
omp -e .
```
