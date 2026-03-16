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
Strategic direction: Turn Pi Loom into a repo-truthful, composable, local operating system for long-horizon technical work by grounding every layer in durable constitutional policy, explicit graph relationships, observable artifacts, and bounded orchestration.
Current focus: Deepen Ralph’s bounded verifier and critique loop without erasing the surrounding Loom layer boundaries.; Derive constitutional memory directly from the root constitution, README, and shipped repository behavior instead of maintaining a thin summary that drifts from source truth.; Harden the observable graph across constitution, research, initiatives, specs, plans, tickets, workers, critique, Ralph, and docs so state is recoverable from durable artifacts.
Open constitutional questions: How much explicit hypothesis and rejected-path structure should the research layer carry before it becomes ceremony?; What verifier and policy contracts should Ralph support before any broader orchestration is considered?; When, if ever, should broader worker coordination or multi-repository execution become first-class in Pi Loom?; Which external sync or publishing surfaces are worth adding after local-first durability is complete?; Which process-memory concerns deserve first-class Loom artifacts rather than remaining in AGENTS, critique, or documentation?

## Roadmap Items
- item-007 [candidate/later] Explore broader coordination surfaces only after the core proves out — Consider richer worker coordination, multi-repository work, or role-specialized model routing only after Pi Loom’s current local durable core demonstrates clear need and strong boundaries.

## Initiatives
- workspace-backed-manager-worker-coordination [completed] Workspace-backed manager-worker coordination — Develop a truthful manager-worker operating model for Pi Loom in which workers are ephemeral workspaces, managers supervise and consolidate bounded execution across those workspaces, and the resulting system composes cleanly with plans, tickets, Ralph, critique, and documentatio…

## Research
- evaluate-pi-control-surfaces-for-long-lived-workers [synthesized] Evaluate Pi control surfaces for long-lived workers — conclusions: Long-lived stdio RPC is sufficient to build live workers with steering, follow-up, abort, state inspection, and extension-UI round trips, but it remains a process/session protocol rather than a worker/domain model.; No documented Pi-native HTTP/WebSocket/gRPC daemon surface or first-class workspace/worktree worker abstraction was found in the inspected docs/source.; Pi currently exposes three meaningful control surfaces for this problem: one-shot CLI/JSON subprocesses, long-lived stdio RPC sessions, and in-process SDK sessions.; Pi session fork/resume/branch operations are session-history primitives, not workspace-aware worker abstractions, so they should not be treated as the worker substrate.; The SDK offers the cleanest same-runtime control surface for a robust manager-worker implementation because it exposes direct session methods plus event subscriptions without protocol framing overhead.
- prepare-manager-worker-architecture-from-pi-supervisor-and-pi-extension-interfaces [synthesized] Prepare manager-worker architecture from pi-supervisor and Pi extension interfaces — conclusions: Current Pi runtime surfaces support extension-based observation, message injection, bounded subprocess/task spawning, and session branch/fork flows, but they do not currently provide an explicit workspace/worktree-backed worker abstraction.; Pi Loom’s current constitutional and package boundaries explicitly keep Ralph bounded and tickets as the live execution ledger. Manager-worker should therefore be introduced as a new workspace-aware execution mechanism that Ralph or plans may invoke and observe, not by turning Ralph into a general workflow engine.; pi-supervisor demonstrates a reusable lightweight oversight pattern: supervise a worker from a separate in-memory Pi session using compact session snapshots, intervention history, and recent deltas rather than sharing full worker context.

## Specs
- add-inbox-driven-manager-worker-control-plane [finalized] Add inbox-driven manager-worker control plane — reqs=21 tasks=9

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
