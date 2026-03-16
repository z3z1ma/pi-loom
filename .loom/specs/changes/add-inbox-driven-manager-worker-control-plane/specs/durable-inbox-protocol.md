---
id: durable-inbox-protocol
title: "Durable inbox protocol"
change: add-inbox-driven-manager-worker-control-plane
updated-at: 2026-03-16T02:39:16.175Z
source-changes:
  - add-inbox-driven-manager-worker-control-plane
---

## Summary
Strengthen the worker message plane into an explicit inbox protocol with required acknowledgment and resolution semantics so manager instructions cannot be silently ignored.

## Requirements
- Each manager-originated actionable message SHALL move through explicit durable lifecycle states such as `pending`, `acknowledged`, and `resolved`, with durable evidence of who changed the state and when.
- The worker message model SHALL distinguish manager instructions, worker acknowledgments, worker resolutions, worker escalations, and bounded broadcast notices through explicit durable message kinds rather than generic note-like prose alone.
- Worker summaries, dashboards, and read surfaces SHALL expose unresolved inbox backlog clearly enough that a manager can identify which workers still owe action on manager messages without transcript reconstruction.

## Scenarios
- A manager sends two instructions and later sees one acknowledged, one resolved, and no ambiguity about what still needs action.
- A worker receives a clarification request, responds with a blocker/escalation, and the inbox state shows why the manager still needs to act.
