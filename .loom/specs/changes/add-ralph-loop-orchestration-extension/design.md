---
id: add-ralph-loop-orchestration-extension
title: "Add Ralph loop orchestration extension"
status: finalized
created-at: 2026-03-15T20:16:36.905Z
updated-at: 2026-03-15T20:20:25.000Z
research:
  - state-of-the-art-for-ralph-loop-orchestration
initiatives: []
capabilities:
  - durable-ralph-runs
  - policy-driven-loop-lifecycle
  - critique-and-verifier-integration
  - fresh-context-operator-surface
---

## Design Notes
Add a new package, likely `packages/pi-ralph`, that introduces a Ralph-specific orchestration layer without claiming a general workflow engine. The package should follow existing extension conventions: package-local README, `extensions/` entrypoint, command registration, prompt guidance, tests, and durable repo-visible state under `.loom/ralph/`.

The extension should persist one directory per run, for example:
- `.loom/ralph/<run-id>/state.json`
- `.loom/ralph/<run-id>/packet.md`
- `.loom/ralph/<run-id>/run.md`
- `.loom/ralph/<run-id>/iterations.jsonl`
- `.loom/ralph/<run-id>/dashboard.json`
- `.loom/ralph/<run-id>/launch.json`

Run state should include stable run identity, title/objective, linked plan/ticket/spec/research/critique refs, current status, current iteration number, policy snapshot, last verifier summary, latest critique verdict reference, continuation decision, and explicit stop or escalation reason when applicable.

The extension should model Ralph as a resumable state machine rather than a single transcript. It should support fresh-context iterations by compiling a bounded packet from linked Loom artifacts and the prior run state, then handing that packet to either a subprocess launch adapter or a future session-control adapter. Critique and docs already demonstrate the repository's preferred fresh-process launch contract; Ralph should reuse that style instead of inventing an incompatible runtime.

Loop control must be policy-driven. The design should support composed stop and escalation rules including maximum iterations, timeout or budget ceilings, verifier pass/fail summaries, critique verdicts and open findings, manual stop requests, and runtime failures. 'Done' from the worker is advisory evidence, not a sufficient stop condition.

Critique remains external and reusable. Ralph may launch critique and consume verdicts or findings, but critique records remain canonical in `pi-critique`; tickets remain canonical in `pi-ticketing`; plans remain canonical in `pi-plans`. Ralph stores orchestration state and links outward instead of copying entire lower-layer records.

Operator ergonomics should mirror the existing Loom packages: a `/ralph` command surface plus `ralph_*` tools for list/read/write/packet/launch/dashboard style workflows, with system-prompt guidance that keeps Ralph distinct from critique and emphasizes bounded iteration over durable artifacts.

## Capability Map
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
