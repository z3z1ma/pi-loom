---
id: inbox-driven-worker-turns
title: "Inbox-driven worker turns"
change: add-inbox-driven-manager-worker-control-plane
updated-at: 2026-03-16T02:39:16.175Z
source-changes:
  - add-inbox-driven-manager-worker-control-plane
---

## Summary
Require workers to consume unresolved inbox state as part of each run so worker turns are driven by durable coordination state instead of arbitrary one-shot prompts.

## Requirements
- A worker run SHALL load unresolved manager messages and relevant broadcast backlog before beginning substantive work, and SHALL record acknowledgment, resolution, or escalation outcomes before stopping.
- A worker run SHALL re-check durable inbox state before ending and SHALL only stop when the inbox is empty, the worker is blocked on manager input, the worker is explicitly requesting review/approval, or an explicit bounded policy budget has been reached.
- Worker checkpoint records SHALL reflect inbox-processing progress in addition to implementation progress so the manager can tell whether messages were acted on during the run.

## Scenarios
- A worker receives a new manager message during a run and records that it re-checked inbox state before stopping.
- A worker wakes up with three pending instructions, processes them in order, emits a checkpoint, and exits only after the inbox is clean.
