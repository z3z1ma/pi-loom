---
id: add-ralph-loop-orchestration-extension
title: "Add Ralph loop orchestration extension"
status: finalized
created-at: 2026-03-15T20:16:36.905Z
updated-at: 2026-03-15T20:20:25.000Z
research:
  - state-of-the-art-for-ralph-loop-orchestration
initiatives: []
capabilities: []
---

## Overview
## Overview
Introduce a bounded Ralph-specific orchestration extension that runs plan → execute → critique → revise cycles over existing Loom primitives with durable run state, fresh-context iteration support, explicit stop policies, and critique-aware continuation decisions.

## Capabilities
- durable-ralph-runs: Durable Ralph run records
- policy-driven-loop-lifecycle: Policy-driven loop lifecycle
- critique-and-verifier-integration: Critique and verifier integration
- fresh-context-operator-surface: Fresh-context execution and operator surface

## Requirements
- req-001: Each Ralph run SHALL record linked plan, ticket, critique, spec, and research references plus the exact stop-policy snapshot used for the run.
  Acceptance: Creating a run produces the expected on-disk artifact set and a stable run id.; Iteration history remains append-only and is sufficient to reconstruct the sequence of continuation decisions.; Run state includes linked artifact references, policy snapshot, current status, and explicit decision fields.
  Capabilities: durable-ralph-runs
- req-002: Reading a Ralph run SHALL expose enough persisted state to resume safely after process interruption or to audit why the run continued, paused, escalated, or stopped.
  Acceptance: Creating a run produces the expected on-disk artifact set and a stable run id.; Iteration history remains append-only and is sufficient to reconstruct the sequence of continuation decisions.; Run state includes linked artifact references, policy snapshot, current status, and explicit decision fields.
  Capabilities: durable-ralph-runs
- req-003: Starting a Ralph run SHALL create a stable run record under `.loom/ralph/<run-id>/` with durable metadata, human-readable markdown, dashboard state, and append-only iteration history.
  Acceptance: Creating a run produces the expected on-disk artifact set and a stable run id.; Iteration history remains append-only and is sufficient to reconstruct the sequence of continuation decisions.; Run state includes linked artifact references, policy snapshot, current status, and explicit decision fields.
  Capabilities: durable-ralph-runs
- req-004: At the end of each iteration, Ralph SHALL evaluate composed continuation rules using iteration ceilings, runtime failures, verifier summaries, critique verdicts, open blocking findings, and operator stop requests.
  Acceptance: A run that reaches its max-iteration limit records a deterministic terminal outcome and reason.; A run with blocking findings or failed verifiers records pause or escalation instead of falsely reporting completion.; A run with passing verifier and critique signals can stop cleanly without another worker turn.
  Capabilities: policy-driven-loop-lifecycle
- req-005: Exceeding a configured limit or hitting an unrecoverable runtime failure SHALL produce an explicit terminal or escalated outcome with a durable reason code rather than silently looping or hanging.
  Acceptance: A run that reaches its max-iteration limit records a deterministic terminal outcome and reason.; A run with blocking findings or failed verifiers records pause or escalation instead of falsely reporting completion.; A run with passing verifier and critique signals can stop cleanly without another worker turn.
  Capabilities: policy-driven-loop-lifecycle
- req-006: Ralph SHALL model explicit run and iteration statuses rather than inferring lifecycle from freeform worker text.
  Acceptance: A run that reaches its max-iteration limit records a deterministic terminal outcome and reason.; A run with blocking findings or failed verifiers records pause or escalation instead of falsely reporting completion.; A run with passing verifier and critique signals can stop cleanly without another worker turn.
  Capabilities: policy-driven-loop-lifecycle
- req-007: Ralph SHALL be able to create or link critique targets, launch critique reviews, and persist references to critique verdicts and findings without copying critique internals into Ralph-owned records.
  Acceptance: A run can reference the latest critique packet, verdict, and open findings without losing critique-layer provenance.; A waiting-for-review run can be resumed only after the required critique or approval artifact is available.; Verifier summaries are persisted in structured form and appear in continuation decisions and dashboards.
  Capabilities: critique-and-verifier-integration
- req-008: Ralph SHALL ingest verifier outputs from linked plans, tickets, tests, diagnostics, or other external checks as structured evidence for continuation decisions.
  Acceptance: A run can reference the latest critique packet, verdict, and open findings without losing critique-layer provenance.; A waiting-for-review run can be resumed only after the required critique or approval artifact is available.; Verifier summaries are persisted in structured form and appear in continuation decisions and dashboards.
  Capabilities: critique-and-verifier-integration
- req-009: Ralph SHALL support review or approval pause points where the run waits for critique or operator input before another execution iteration may begin.
  Acceptance: A run can reference the latest critique packet, verdict, and open findings without losing critique-layer provenance.; A waiting-for-review run can be resumed only after the required critique or approval artifact is available.; Verifier summaries are persisted in structured form and appear in continuation decisions and dashboards.
  Capabilities: critique-and-verifier-integration
- req-010: Ralph SHALL compile a bounded per-iteration packet from durable Loom references and prior run state so a fresh worker context can execute the next iteration without relying on an ever-growing transcript.
  Acceptance: A launch descriptor can be written and consumed by a subprocess or compatible adapter to run a fresh iteration.; Dashboard output makes the run's current state and latest decision intelligible without reading raw JSON files.; The command and tool surface can create, inspect, and resume runs without direct file editing.
  Capabilities: fresh-context-operator-surface
- req-011: Ralph SHALL provide dashboard and markdown views that make current status, current iteration, linked artifacts, latest verifier evidence, latest critique evidence, and last continuation decision visible at a glance.
  Acceptance: A launch descriptor can be written and consumed by a subprocess or compatible adapter to run a fresh iteration.; Dashboard output makes the run's current state and latest decision intelligible without reading raw JSON files.; The command and tool surface can create, inspect, and resume runs without direct file editing.
  Capabilities: fresh-context-operator-surface
- req-012: The package SHALL expose a `/ralph` command namespace and AI-facing `ralph_*` tools for starting, reading, listing, updating, launching, resuming, and inspecting Ralph runs.
  Acceptance: A launch descriptor can be written and consumed by a subprocess or compatible adapter to run a fresh iteration.; Dashboard output makes the run's current state and latest decision intelligible without reading raw JSON files.; The command and tool surface can create, inspect, and resume runs without direct file editing.
  Capabilities: fresh-context-operator-surface

## Clarifications
- 2026-03-15T20:16:42.633Z Is this spec introducing a general-purpose workflow engine for all future agent orchestration? -> No. The bounded change is a Ralph-specific orchestration extension package, likely `pi-ralph`, that composes with existing Loom primitives. Broader worker orchestration remains deferred; this package only standardizes Ralph loop mode over plans, tickets, critique, and related verifier inputs.
- 2026-03-15T20:16:48.591Z How should Ralph preserve context between iterations? -> Ralph should support fresh-context iterations. Durable Loom artifacts are the canonical memory: each iteration rehydrates from linked plan, ticket, critique, and optional spec/research references plus prior Ralph run state, rather than relying on one ever-growing transcript.
- 2026-03-15T20:16:53.592Z Is critique part of Ralph's internal implementation model? -> No. Critique remains a distinct durable Loom layer. Ralph may create, link, launch, await, and consume critique artifacts and verdicts, but it must not absorb critique into its own run state as mere freeform reflection or replace critique's separate review contract.
- 2026-03-15T20:16:58.649Z What determines whether a Ralph run continues, pauses, escalates, or stops? -> Continuation must be policy-driven and explicit. The extension should evaluate composed stop and escalation rules using iteration limits, runtime failures, verifier summaries, critique verdicts and findings, linked ticket/spec acceptance status where available, and operator or external stop requests. A model asserting 'done' is insufficient on its own.

## Capabilities
(none)

## Requirements
(none)

## Clarifications
(none)
