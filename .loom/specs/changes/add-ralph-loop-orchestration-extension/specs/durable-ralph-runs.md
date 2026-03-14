---
id: durable-ralph-runs
title: "Durable Ralph run records"
change: add-ralph-loop-orchestration-extension
updated-at: 2026-03-15T20:19:13.150Z
source-changes:
  - add-ralph-loop-orchestration-extension
---

## Summary
Persist Ralph runs as repo-visible durable orchestration records that link to canonical Loom artifacts without replacing them.

## Requirements
- Each Ralph run SHALL record linked plan, ticket, critique, spec, and research references plus the exact stop-policy snapshot used for the run.
- Reading a Ralph run SHALL expose enough persisted state to resume safely after process interruption or to audit why the run continued, paused, escalated, or stopped.
- Starting a Ralph run SHALL create a stable run record under `.loom/ralph/<run-id>/` with durable metadata, human-readable markdown, dashboard state, and append-only iteration history.

## Scenarios
- A maintainer audits why a run stopped instead of continuing.
- A previously running Ralph loop is inspected after a crashed or terminated process.
- An operator starts a Ralph run against an existing workplan and ticket set.
