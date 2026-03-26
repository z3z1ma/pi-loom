---
id: add-ralph-loop-orchestration-extension
title: "Add Ralph loop orchestration extension"
status: specified
created-at: 2026-03-15T20:16:36.905Z
updated-at: 2026-03-21T06:05:11.416Z
research:
  - assess-vendoring-the-oh-my-pi-task-subagent-executor-into-pi-ralph
  - ralph-backed-worker-manager-architecture-cutover
  - state-of-the-art-for-ralph-loop-orchestration
initiatives: []
capabilities:
  - post-iteration-state-contract
  - single-bounded-iteration-execution
  - resumability-as-steerability
  - bounded-operator-surface
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
- post-iteration-state-contract: Post-iteration SQLite state contract
- single-bounded-iteration-execution: Single bounded iteration execution
- resumability-as-steerability: Resumability as steerability
- bounded-operator-surface: Bounded operator surface

## Requirements
- req-001: At the end of each Ralph iteration, durable state must include current run status, latest iteration summary, latest verifier state, latest critique state, latest continuation decision, and any blocking or completion-relevant context.
  Acceptance: A later session can resume from the stored run state without transcript archaeology.; After a Ralph iteration exits, a later caller can inspect SQLite-backed state and explain what happened and what options exist next.; After a Ralph iteration exits, a manager can inspect SQLite-backed state and explain what happened and what options exist next.; Dashboard and packet views surface the same key post-iteration facts needed for orchestration.; Dashboard and packet views surface the same key post-iteration facts needed for subsequent orchestration.
  Capabilities: post-iteration-state-contract
- req-002: Ralph dashboards, packets, and read surfaces must present this post-iteration contract clearly.
  Acceptance: A later session can resume from the stored run state without transcript archaeology.; After a Ralph iteration exits, a manager can inspect SQLite-backed state and explain what happened and what options exist next.; Dashboard and packet views surface the same key post-iteration facts needed for orchestration.
  Capabilities: post-iteration-state-contract
- req-003: The post-iteration state must be sufficient for a manager to decide whether to continue, steer, escalate, approve, or stop without relying on the prior transcript.
  Acceptance: A later session can resume from the stored run state without transcript archaeology.; After a Ralph iteration exits, a manager can inspect SQLite-backed state and explain what happened and what options exist next.; Dashboard and packet views surface the same key post-iteration facts needed for orchestration.
  Capabilities: post-iteration-state-contract
- req-004: Launching or resuming Ralph must mean executing one bounded iteration rather than entering an open-ended loop.
  Acceptance: A failed or paused iteration still leaves durable state explaining the outcome before exit.; A single Ralph launch produces exactly one bounded iteration outcome and then returns control to the caller.; Repeated progress comes from explicit repeated launches or resumes, not from a hidden long-running loop.
  Capabilities: single-bounded-iteration-execution
- req-005: Ralph must persist iteration updates before exiting so the next manager decision can be made from durable state.
  Acceptance: A failed or paused iteration still leaves durable state explaining the outcome before exit.; A single Ralph launch produces exactly one bounded iteration outcome and then returns control to the caller.; Repeated progress comes from explicit repeated launches or resumes, not from a hidden long-running loop.
  Capabilities: single-bounded-iteration-execution
- req-006: Runtime behavior must stay aligned with the one-iteration contract even when invoked repeatedly through resume.
  Acceptance: A failed or paused iteration still leaves durable state explaining the outcome before exit.; A single Ralph launch produces exactly one bounded iteration outcome and then returns control to the caller.; Repeated progress comes from explicit repeated launches or resumes, not from a hidden long-running loop.
  Capabilities: single-bounded-iteration-execution
- req-007: Ralph packets for a resumed iteration must reflect the latest durable steering context rather than stale prior assumptions.
  Acceptance: A caller can change direction after one iteration by updating durable context and launching the next Ralph iteration.; A manager can change direction after one iteration by updating durable context and launching the next Ralph iteration.; Decision history shows that the next iteration happened because of an explicit between-iteration choice.; The resumed Ralph packet reflects new steering information without requiring in-flight interruption.
  Capabilities: resumability-as-steerability
- req-008: Ralph resumability must accept updated durable context from linked worker, plan, ticket, critique, or manager messages before the next iteration begins.
  Acceptance: A manager can change direction after one iteration by updating durable context and launching the next Ralph iteration.; Decision history shows that the next iteration happened because of an explicit between-iteration choice.; The resumed Ralph packet reflects new steering information without requiring in-flight interruption.
  Capabilities: resumability-as-steerability
- req-009: The next iteration decision must be explicit and policy-driven, not hidden inside the runtime adapter.
  Acceptance: A caller can change direction after one iteration by updating durable context and launching the next Ralph iteration.; A manager can change direction after one iteration by updating durable context and launching the next Ralph iteration.; Decision history shows that the next iteration happened because of an explicit between-iteration choice.; The resumed Ralph packet reflects new steering information without requiring in-flight interruption.
  Capabilities: resumability-as-steerability
- req-010: Ralph commands and tools must let callers create, inspect, update, launch, resume, and read runs without direct file editing.
  Acceptance: A human or AI can use Ralph tools directly without needing worker abstractions.; A manager can use Ralph tools directly or through worker wrappers to inspect and launch the next iteration.; A reader can trace from Ralph to linked plans, tickets, critiques, and workers through explicit references.; Ralph surfaces expose bounded orchestration state rather than pretending to be the full execution ledger or a manager control plane.; Ralph surfaces expose bounded orchestration state rather than pretending to be the full execution ledger or manager control plane.
  Capabilities: bounded-operator-surface
- req-011: Ralph must remain distinct from workers, tickets, critique, and plans even when it becomes the canonical loop substrate under workers.
  Acceptance: A manager can use Ralph tools directly or through worker wrappers to inspect and launch the next iteration.; A reader can trace from Ralph to linked plans, tickets, critiques, and workers through explicit references.; Ralph surfaces expose bounded orchestration state rather than pretending to be the full execution ledger or manager control plane.
  Capabilities: bounded-operator-surface
- req-012: Ralph read surfaces must make current run state and latest iteration outcome intelligible at a glance for a higher-level manager.
  Acceptance: A manager can use Ralph tools directly or through worker wrappers to inspect and launch the next iteration.; A reader can trace from Ralph to linked plans, tickets, critiques, and workers through explicit references.; Ralph surfaces expose bounded orchestration state rather than pretending to be the full execution ledger or manager control plane.
  Capabilities: bounded-operator-surface
- req-013: Ralph dashboards, packets, and read surfaces must present this post-iteration contract clearly using Ralph-native terminology.
  Acceptance: A later session can resume from the stored run state without transcript archaeology.; After a Ralph iteration exits, a later caller can inspect SQLite-backed state and explain what happened and what options exist next.; Dashboard and packet views surface the same key post-iteration facts needed for subsequent orchestration.
  Capabilities: post-iteration-state-contract
- req-014: The post-iteration state must be sufficient for a later caller to decide whether to continue, steer, escalate, approve, or stop without relying on the prior transcript.
  Acceptance: A later session can resume from the stored run state without transcript archaeology.; After a Ralph iteration exits, a later caller can inspect SQLite-backed state and explain what happened and what options exist next.; Dashboard and packet views surface the same key post-iteration facts needed for subsequent orchestration.
  Capabilities: post-iteration-state-contract
- req-015: Ralph must persist iteration updates before exiting so the next caller decision can be made from durable state.
  Acceptance: A failed or paused iteration still leaves durable state explaining the outcome before exit.; A single Ralph launch produces exactly one bounded iteration outcome and then returns control to the caller.; Repeated progress comes from explicit repeated launches or resumes, not from a hidden long-running loop.
  Capabilities: single-bounded-iteration-execution
- req-016: Ralph resumability must accept updated durable context from linked worker, plan, ticket, critique, or direct operator input before the next iteration begins.
  Acceptance: A caller can change direction after one iteration by updating durable context and launching the next Ralph iteration.; Decision history shows that the next iteration happened because of an explicit between-iteration choice.; The resumed Ralph packet reflects new steering information without requiring in-flight interruption.
  Capabilities: resumability-as-steerability
- req-017: Ralph must remain distinct from workers, tickets, critique, and plans even when it serves as the canonical loop substrate under workers.
  Acceptance: A human or AI can use Ralph tools directly without needing worker abstractions.; A reader can trace from Ralph to linked plans, tickets, critiques, and workers through explicit references.; Ralph surfaces expose bounded orchestration state rather than pretending to be the full execution ledger or a manager control plane.
  Capabilities: bounded-operator-surface
- req-018: Ralph read surfaces must make current run state and latest iteration outcome intelligible at a glance for any caller without assuming a manager abstraction.
  Acceptance: A human or AI can use Ralph tools directly without needing worker abstractions.; A reader can trace from Ralph to linked plans, tickets, critiques, and workers through explicit references.; Ralph surfaces expose bounded orchestration state rather than pretending to be the full execution ledger or a manager control plane.
  Capabilities: bounded-operator-surface

## Clarifications
(none)
