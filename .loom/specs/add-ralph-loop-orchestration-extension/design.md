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

## Design Notes
This spec sharpens Ralph around the simplest useful model: run one bounded iteration, write durable state, exit, then let a later caller inspect that state and decide whether to continue. The value is resumability plus truthful post-iteration output, not intra-iteration supervision. Ralph therefore needs a clear post-iteration SQLite output contract that callers and neighboring layers can rely on. Steerability should happen by updating durable context before the next Ralph iteration, not by interrupting a running one. Pi Ralph must stand alone as an independent feature set that a human or AI can invoke directly, so its user-facing surfaces should stay Ralph-native and should not depend on manager terminology from layers built on top of it.

## Capability Map
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
