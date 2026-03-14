# @pi-loom/pi-ralph

Durable Ralph loop orchestration for pi.

This package adds a bounded Ralph-specific orchestration layer under `.loom/ralph/` so long-horizon plan → execute → critique → revise loops can persist durable run state, iteration history, dashboards, and fresh-context launch descriptors without replacing the existing Loom plan, ticket, critique, and docs layers.

## Capabilities

- `/ralph` command surface for init/create/list/show/packet/update/iteration/verifier/critique/decide/launch/resume/dashboard/archive flows
- `ralph_*` tools for list/read/write/launch/resume/dashboard workflows
- durable Ralph run records with `state.json`, `packet.md`, `run.md`, `iterations.jsonl`, `dashboard.json`, and `launch.json`
- policy-aware run state that records linked Loom refs, verifier summaries, critique links, and explicit continuation decisions
- fresh-context launch descriptors plus a default subprocess runtime for bounded Ralph launch and resume execution
- extension lifecycle hooks that initialize the Ralph ledger and teach the agent to treat `.loom/ralph/` as canonical orchestration state

## Design boundaries

`pi-ralph` is intentionally narrower than a general workflow engine.

- Ralph is a bounded orchestration primitive, not a replacement for plans, tickets, or critique
- plans remain the execution-strategy layer
- tickets remain the live execution ledger and the comprehensive definition of each unit of work
- critique remains the durable review layer
- docs remain the post-completion explanatory layer
- future broader worker orchestration stays outside this package unless explicitly specified

## Artifact policy

- commit canonical Ralph state: `state.json`, `packet.md`, `run.md`, `iterations.jsonl`, and stable `dashboard.json`
- treat stored path fields inside Ralph artifacts as repo-relative from the workspace root
- do not commit `launch.json`; it is a runtime handoff descriptor for a specific fresh-session or subprocess launch, not the source of truth for the run

## Current implementation status

The package already ships the `/ralph` command namespace, `ralph_*` tools, durable run storage, policy-aware iteration tracking, dashboard rendering, interactive fresh-session handoff preparation, and subprocess-backed launch/resume execution rooted in the package extension workspace.

## Layout

```text
.loom/
  ralph/
    <run-id>/
      state.json
      packet.md
      run.md
      iterations.jsonl
      dashboard.json
      launch.json
```

## Local use

```bash
cd packages/pi-ralph
omp -e .
```
