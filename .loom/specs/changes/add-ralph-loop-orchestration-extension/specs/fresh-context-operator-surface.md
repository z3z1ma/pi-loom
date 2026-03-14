---
id: fresh-context-operator-surface
title: "Fresh-context execution and operator surface"
change: add-ralph-loop-orchestration-extension
updated-at: 2026-03-15T20:19:13.150Z
source-changes:
  - add-ralph-loop-orchestration-extension
---

## Summary
Provide fresh-session launch semantics, command and tool entrypoints, and observability suited to operator use.

## Requirements
- Ralph SHALL compile a bounded per-iteration packet from durable Loom references and prior run state so a fresh worker context can execute the next iteration without relying on an ever-growing transcript.
- Ralph SHALL provide dashboard and markdown views that make current status, current iteration, linked artifacts, latest verifier evidence, latest critique evidence, and last continuation decision visible at a glance.
- The package SHALL expose a `/ralph` command namespace and AI-facing `ralph_*` tools for starting, reading, listing, updating, launching, resuming, and inspecting Ralph runs.

## Scenarios
- A fresh Ralph iteration is launched from a descriptor generated off durable state.
- A future automation script uses `ralph_*` tools to monitor loop status programmatically.
- An operator uses `/ralph` to inspect the latest iteration and resume a paused run.
