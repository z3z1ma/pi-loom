---
id: critique-inbox-driven-manager-worker-control-plane
title: "Critique inbox-driven manager-worker control plane"
status: resolved
verdict: pass
target: workspace:manager-worker-control-plane-next-phase
focus:
  - architecture
  - correctness
  - docs
  - edge_cases
  - maintainability
created-at: 2026-03-16T03:47:52.813Z
updated-at: 2026-03-16T05:15:08.786Z
fresh-context-required: true
scope:
  - AGENTS.md
  - packages/pi-plans
  - packages/pi-ralph
  - packages/pi-ticketing
  - packages/pi-workers
  - README.md
---

## Review Target
Workspace review target: manager-worker-control-plane-next-phase at packages/pi-workers

## Review Question
Does the implemented inbox-driven manager-worker control plane satisfy the finalized successor spec and closed tickets t-0031 through t-0039 while preserving ticket primacy, bounded manager scheduling, runtime portability, and the intended SDK-first/RPC-fallback architecture?

## Focus Areas
architecture, correctness, docs, edge_cases, maintainability

## Scope Paths
- AGENTS.md
- packages/pi-plans
- packages/pi-ralph
- packages/pi-ticketing
- packages/pi-workers
- README.md

## Non-Goals
- Do not critique unrelated pre-existing code outside the touched scope unless it is now made incorrect by the new control-plane work.
- Do not demand a full actor mesh or sidecar architecture that this spec explicitly defers.

## Fresh Context Protocol
- Start from a fresh reviewer context instead of inheriting the executor session.
- Load .loom/critiques/critique-inbox-driven-manager-worker-control-plane/packet.md before reasoning about the target.
- Judge the work against its contract, linked context, and likely failure modes; do not trust plausible output.
- Persist the result with critique_run and critique_finding so findings survive the session.

## Constitutional Context
Project: Pi Loom
Strategic direction: (empty)
Current focus: none
Open constitutional questions: Capture the architectural and business constraints.; Capture the guiding decision principles.; Capture the strategic direction and roadmap.; Define the durable project vision.

## Roadmap Items
(none)

## Initiatives
(none)

## Research
(none)

## Specs
(none)

## Tickets
- t-0031 [closed] Refactor worker messages into a durable inbox protocol — Turn the existing worker message stream into a real durable inbox contract so manager instructions, worker acknowledgments, resolutions, escalations, and bounded broadcast state are all queryable, actionable, and impossible to silently ignore.
- t-0032 [closed] Make worker runs inbox-driven and stop-condition aware — Change worker run semantics so each run consumes unresolved inbox state, records message-handling progress durably, re-checks the inbox before stopping, and exits only at explicit bounded stop conditions.
- t-0033 [closed] Add first-class manager commands and tools — Introduce `/manager` and `manager_*` surfaces so a manager can supervise many workers intentionally through a native control plane instead of stitching together raw `worker_*` operations ad hoc.
- t-0034 [closed] Introduce runtime abstraction for worker execution — Refactor worker execution behind a runtime abstraction so the current subprocess runner becomes one strategy rather than the architecture itself, making room for SDK-backed and RPC-backed live workers without duplicating worker domain semantics.
- t-0035 [closed] Implement SDK-backed live worker runtime — Add a same-process SDK-backed worker host that can execute inbox-driven worker turns with direct Pi session control while persisting all important state transitions back into the durable worker ledger.
- t-0036 [closed] Add RPC fallback seam for live workers — Add a bounded RPC-backed runtime seam or implementation so process-separated live workers remain possible without letting RPC redefine the worker contract or become the semantic center of the package.
- t-0037 [closed] Build bounded manager scheduler loop — Implement the manager polling loop that scans worker state, unresolved inbox backlog, telemetry, and approvals, then makes durable bounded decisions to message, resume, escalate, or surface approvals without requiring a human between every worker turn.
- t-0038 [closed] Extend recovery and observability for the new control plane — Expand worker dashboards, packets, queue summaries, and recovery behavior so unresolved inbox state, runtime kind, scheduler visibility, and restart-safe reconstruction remain obvious across the stronger control plane.
- t-0039 [closed] Harden docs tests and neighboring integrations — Close the control-plane phase with comprehensive tests, prompt guidance, README updates, and neighboring package integration checks so the stronger inbox protocol, manager surface, runtime abstraction, and scheduler behavior are all documented and defended by automation.

## Existing Runs
- run-001 [verification/needs_revision] Reviewer found four material concerns: `/manager resume ... run` records a fictitious running launch without executing it, scheduler resume candidates exclude workers unblocked by manager messages if their status is still blocked/waiting, the manager surface cannot resolve manager-owned inbox backlog directly, and `lastRuntimeKind` is persisted at prepare time rather than when execution actually starts.
- run-002 [verification/pass] Post-fix review found no remaining material concern in the previously reported manager/scheduler/runtime issues. The control plane now executes and finalizes manager-driven resumes truthfully, schedules unblocked workers again, exposes manager-side inbox resolution, records runtime kind only when execution starts, and handles SDK setup failures without leaving false running state. Full workspace verification is green under lint, typecheck, and tests.

## Existing Open Findings
(none)
