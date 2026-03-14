---
id: policy-driven-loop-lifecycle
title: "Policy-driven loop lifecycle"
change: add-ralph-loop-orchestration-extension
updated-at: 2026-03-15T20:19:13.150Z
source-changes:
  - add-ralph-loop-orchestration-extension
---

## Summary
Model Ralph as a bounded resumable state machine with explicit continuation, pause, escalation, and stop semantics.

## Requirements
- At the end of each iteration, Ralph SHALL evaluate composed continuation rules using iteration ceilings, runtime failures, verifier summaries, critique verdicts, open blocking findings, and operator stop requests.
- Exceeding a configured limit or hitting an unrecoverable runtime failure SHALL produce an explicit terminal or escalated outcome with a durable reason code rather than silently looping or hanging.
- Ralph SHALL model explicit run and iteration statuses rather than inferring lifecycle from freeform worker text.

## Scenarios
- A run completes because linked acceptance checks pass and critique approves.
- A run pauses because critique returned blocking findings that require revision.
- A run stops because the maximum iteration budget was exhausted.
