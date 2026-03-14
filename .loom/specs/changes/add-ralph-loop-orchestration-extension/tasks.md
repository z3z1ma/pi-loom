---
id: add-ralph-loop-orchestration-extension
title: "Add Ralph loop orchestration extension"
status: finalized
created-at: 2026-03-15T20:16:36.905Z
updated-at: 2026-03-15T20:20:25.000Z
research:
  - state-of-the-art-for-ralph-loop-orchestration
initiatives: []
---

## Task Graph
- task-001: Scaffold pi-ralph package and run ledger
  Summary: Create the new extension package, package metadata, README, lifecycle hooks, and durable `.loom/ralph/` ledger initialization with synced per-run artifact writes.
  Requirements: req-001, req-003
  Capabilities: durable-ralph-runs
  Acceptance: `packages/pi-ralph/` follows the existing extension package conventions and initializes `.loom/ralph/` on session start.; Creating a run writes the expected artifact skeleton with stable run identity and persisted policy/link metadata.
- task-002: Render resumable run records and dashboards
  Summary: Implement store-backed run reading, markdown rendering, append-only iteration history, packet generation, and dashboard views that expose linked artifacts and prior decisions for audit and resume.
  Requirements: req-002, req-011
  Capabilities: durable-ralph-runs, fresh-context-operator-surface
  Dependencies: task-001
  Acceptance: Iteration history stays append-only and supports post-interruption resume reasoning.; Run markdown and dashboard views show current status, iteration index, linked refs, latest verifier and critique evidence, and last decision.
- task-003: Implement lifecycle and stop-policy engine
  Summary: Model explicit run and iteration statuses plus composed continuation, pause, escalation, and terminal decisions driven by configured policies and runtime outcomes.
  Requirements: req-004, req-005, req-006
  Capabilities: policy-driven-loop-lifecycle
  Dependencies: task-001
  Acceptance: Runs can evaluate continuation decisions without relying on freeform worker text parsing alone.; The engine records deterministic reason codes for limit exhaustion, unrecoverable failures, pause-for-review, completion, and manual stop.
- task-004: Integrate critique and verifier evidence
  Summary: Link Ralph runs to critique packets, verdicts, findings, and structured verifier summaries from plans, tickets, tests, or diagnostics so revision decisions are grounded in external evidence.
  Requirements: req-007, req-008, req-009
  Capabilities: critique-and-verifier-integration
  Dependencies: task-002, task-003
  Acceptance: Review-gated runs remain paused until the required critique or approval artifact is available.; Runs can persist critique refs and structured verifier summaries without copying canonical critique or ticket records.
- task-005: Add fresh-context launch and resume adapters
  Summary: Write bounded iteration packets and launch descriptors, then invoke a subprocess-compatible runtime adapter for fresh worker turns and resumptions using durable run state hydration.
  Requirements: req-010
  Capabilities: fresh-context-operator-surface
  Dependencies: task-002, task-003
  Acceptance: A run can emit a launch descriptor and bounded packet sufficient for a fresh iteration.; Resume semantics rehydrate from durable run state and linked Loom refs instead of a long transcript.
- task-006: Expose Ralph command, tools, and guidance
  Summary: Provide `/ralph` commands plus `ralph_*` tool handlers for list/read/write/packet/launch/dashboard workflows and add system-prompt guidance that keeps Ralph distinct from critique while emphasizing bounded orchestration.
  Requirements: req-011, req-012
  Capabilities: fresh-context-operator-surface
  Dependencies: task-002, task-004, task-005
  Acceptance: Operators can start, inspect, launch, resume, and stop runs through the supported command and tool surfaces.; Prompt guidance teaches bounded Ralph orchestration over durable artifacts and preserves critique as a separate review layer.
- task-007: Cover runtime behavior with tests
  Summary: Add package tests for persistence, state transitions, stop-policy outcomes, critique-gated pause and resume behavior, launch descriptors, and command/tool registration.
  Requirements: req-002, req-005, req-009, req-010, req-012
  Capabilities: critique-and-verifier-integration, durable-ralph-runs, fresh-context-operator-surface, policy-driven-loop-lifecycle
  Dependencies: task-004, task-005, task-006
  Acceptance: Automated tests prove deterministic stop reasons, durable resume state, review gating, and launch descriptor generation.; Extension registration tests verify the `/ralph` command, `ralph_*` tools, and lifecycle hooks are wired correctly.

## Traceability
- task-001 -> req-001, req-003
- task-002 -> req-002, req-011
- task-003 -> req-004, req-005, req-006
- task-004 -> req-007, req-008, req-009
- task-005 -> req-010
- task-006 -> req-011, req-012
- task-007 -> req-002, req-005, req-009, req-010, req-012
