---
id: loom-ralph-orchestration-overview
title: "Loom Ralph orchestration overview"
status: active
type: overview
section: overviews
audience:
  - ai
  - human
source: workspace:repo
topics: []
outputs: []
upstream-path: null
---

# Ralph orchestration in Loom

## What Ralph is

`pi-ralph` is the bounded orchestration package for long-horizon work in this workspace. It persists Ralph runs under `.loom/ralph/` and provides a durable place to track loop state, iteration history, verifier evidence, critique links, launch descriptors, and the explicit decision about whether the loop should continue, pause, escalate, or stop.

Ralph is intentionally narrower than a general workflow engine. It is a Ralph-specific loop package that orchestrates over the existing Loom primitives rather than replacing them.

## What remains canonical outside Ralph

Ralph does not absorb the lower layers into its own state:

- plans remain the execution-strategy layer
- tickets remain the live execution ledger
- critique remains the durable review layer
- docs remain the post-completion explanatory layer

A Ralph run links to those records and compiles them into a bounded packet for each fresh iteration.

## Durable run layout

Each Ralph run lives under `.loom/ralph/<run-id>/` and currently keeps these artifacts:

- `state.json` — machine-usable run state
- `packet.md` — bounded fresh-context packet for the next iteration
- `run.md` — human-readable run summary and iteration ledger
- `iterations.jsonl` — append-only iteration history
- `dashboard.json` — rollup for quick observability
- `launch.json` — latest launch or resume descriptor

## Loop behavior

Ralph is implemented as a policy-driven state machine rather than an unbounded transcript.

Important characteristics of the current package:

- runs keep explicit status, phase, waiting state, and stop reason
- iteration history is append-only and resumable
- verifier summaries and critique links are durable inputs to the continuation decision
- launch and resume both work from a fresh packet instead of carrying a single ever-growing transcript forward
- runtime launch uses a subprocess adapter that opens a fresh `pi` worker with the run packet and instructions to persist the next bounded iteration

## Why this layer exists

The research and finalized spec for Ralph concluded that stronger long-horizon agent loops should rely on durable state, explicit stop policies, external verifier feedback, and review artifacts instead of free-running self-reflection. `pi-ralph` is the package that turns that design into a concrete Loom orchestration surface.

## Current package surface

The current implementation exposes:

- `/ralph` command flows for create/read/update/launch/resume/dashboard/archive usage
- `ralph_*` tools for list/read/write/launch/resume/dashboard workflows
- system-prompt guidance that teaches the agent to use `.loom/ralph/` as canonical orchestration state

## Boundary to keep in mind

If future work needs broader manager-worker orchestration, that should be specified and implemented separately. The current package should stay scoped to bounded Ralph loop mode so the architecture remains truthful.
