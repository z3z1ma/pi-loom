# Manager-worker control-plane next phase

## Purpose / Big Picture
Turn the finalized inbox-driven manager-worker control-plane spec into a dependency-aware execution program that keeps the architecture bounded, preserves ticket primacy, and makes the worker system materially more useful before any later actor-mesh exploration.

## Progress
- [x] Ticket t-0031 — Refactor worker messages into a durable inbox protocol (inbox-protocol)
- [x] Ticket t-0032 — Make worker runs inbox-driven and stop-condition aware (inbox-driven-runs)
- [x] Ticket t-0033 — Add first-class manager commands and tools (manager-surface)
- [x] Ticket t-0034 — Introduce runtime abstraction for worker execution (runtime-abstraction)
- [x] Ticket t-0035 — Implement SDK-backed live worker runtime (sdk-runtime)
- [x] Ticket t-0036 — Add RPC fallback seam for live workers (rpc-fallback)
- [x] Ticket t-0037 — Build bounded manager scheduler loop (scheduler)
- [x] Ticket t-0038 — Extend recovery and observability for the new control plane (recovery-observability)
- [x] Ticket t-0039 — Harden docs tests and neighboring integrations (verification-docs)

## Surprises & Discoveries
- Observation: Inbox semantics and manager surfaces delivered far more usefulness than transport sophistication alone would have.
  Evidence: The biggest usability gains in this phase came from unresolved backlog visibility, manager commands/tools, and bounded scheduler behavior rather than from runtime abstraction in isolation.

- Observation: SDK-backed live workers are viable without sacrificing durable truth, as long as runtime transitions are written back into worker state and runtime descriptors.
  Evidence: The implemented SDK runtime now executes worker turns while preserving durable state transitions, and tests cover setup failure and runtime-kind truthfulness.

- Observation: Critique catches subtle scheduler/runtime truth bugs even when the main implementation is green; the post-implementation critique cycle materially improved the final control plane.
  Evidence: The final control-plane critique identified four real issues that were then fixed before final signoff.

## Decision Log
- Decision: Keep the manager scheduler polling-driven and bounded instead of adding a sidecar/event-broker layer in this phase.
  Rationale: The simpler scheduler provided meaningful autonomy gains while preserving durable auditability and avoiding a premature runtime service layer.
  Date/Author: 2026-03-16 / ChatGPT

- Decision: Implement SDK-backed workers now and keep RPC as an explicit fallback seam rather than a full primary runtime path.
  Rationale: This matched the research-backed preference for same-runtime control while preserving a transport fallback without letting it redefine the domain model.
  Date/Author: 2026-03-16 / ChatGPT

- Decision: Treat critique findings as part of completion rather than as optional follow-up work.
  Rationale: The control-plane phase was not actually done until the resume/scheduler/manager-inbox/runtime-kind truth bugs were fixed and the critique resolved cleanly.
  Date/Author: 2026-03-16 / ChatGPT

## Outcomes & Retrospective
Outcome: Pi Loom now has a materially more useful manager-worker control plane. Managers can inspect fleet backlog, supervise workers, acknowledge or resolve manager-owned inbox items, approve work, schedule bounded passes, and run workers through a runtime abstraction that already supports subprocess and SDK-backed execution with an RPC fallback seam. Workers now expose durable inbox backlog, ack/resolution progress, runtime kind, scheduler observations, and stronger packet semantics.

Retrospective: the phase stayed bounded and useful. It did not jump to a sidecar or actor mesh before the simpler control plane was proven out. The scheduler remains durable and auditable rather than becoming a hidden execution ledger, and the worker contract remains transport-neutral across runtime kinds.

## Context and Orientation
This rollout built directly on the already-completed workspace-backed worker substrate. The first phase established truthful worker records, runtime attachments, messages, checkpoints, approvals, and consolidation. This second phase addressed the remaining control-plane gaps: manager messages now form a real inbox with explicit lifecycle, worker turns are packeted as inbox-driven runs with explicit stop conditions, managers now have `/manager` and `manager_*` surfaces, worker execution is abstracted across subprocess/SDK/RPC strategies, SDK-backed live workers are implemented, the manager scheduler can make bounded progress across a fleet, and observability/recovery now surface runtime kind, inbox backlog, acknowledged backlog, approval state, and scheduler observations.

The critique cycle mattered. A first review surfaced correctness issues in resume behavior, scheduler candidate selection, manager-side inbox resolution, and runtime-kind truthfulness. Those findings were fixed before signoff, and the control-plane critique now resolves with verdict `pass`. The architecture remains bounded: tickets are still the execution ledger, Ralph remains bounded, sidecars and actor meshes remain deferred, and machine-local runtime details remain out of canonical committed worker state.

Source target: spec:add-inbox-driven-manager-worker-control-plane

Scope paths: .loom/research, AGENTS.md, packages/pi-plans, packages/pi-ralph, packages/pi-ticketing, packages/pi-workers, README.md

Roadmap: item-007
Initiatives: workspace-backed-manager-worker-coordination
Research: evaluate-pi-control-surfaces-for-long-lived-workers, prepare-manager-worker-architecture-from-pi-supervisor-and-pi-extension-interfaces
Specs: add-inbox-driven-manager-worker-control-plane, add-workspace-backed-manager-worker-substrate
Critiques: critique-inbox-driven-manager-worker-control-plane, critique-workspace-backed-manager-worker-rollout
Docs: workspace-backed-manager-worker-execution-overview

## Plan of Work
Completed in the planned waves: inbox protocol first, inbox-driven run semantics second, manager surface third, runtime abstraction and live runtime work fourth, bounded scheduler and observability fifth, and contract hardening/docs/tests last. This order proved correct: defining message and stop-condition semantics first prevented the runtime work from hard-coding weaker behavior, and landing the manager surface before the scheduler kept automation grounded in an explicit control plane rather than hidden orchestration logic.

## Concrete Steps
Completed tickets: t-0031 durable inbox protocol, t-0032 inbox-driven worker turns, t-0033 manager surface, t-0034 runtime abstraction, t-0035 SDK-backed runtime, t-0036 RPC fallback seam, t-0037 bounded scheduler, t-0038 recovery/observability alignment, and t-0039 docs/tests/integration hardening. The critique findings against the completed phase were then fixed and re-verified; no projected tickets remain open for this rollout.

## Validation and Acceptance
Final verification passed end-to-end: `npm run lint`, `npm run typecheck`, and `npm test`. Final workspace results: 64 test files passed and 162 tests passed. The control-plane work specifically added coverage for inbox lifecycle, ack/resolve flows, manager surfaces, SDK runtime execution, RPC fallback failure behavior, scheduler decisions, scheduler visibility, runtime-kind truthfulness, and retirement safety. The post-fix critique resolved with verdict `pass`.

## Tickets
- t-0031 [closed] Refactor worker messages into a durable inbox protocol — inbox-protocol
- t-0032 [closed] Make worker runs inbox-driven and stop-condition aware — inbox-driven-runs
- t-0033 [closed] Add first-class manager commands and tools — manager-surface
- t-0034 [closed] Introduce runtime abstraction for worker execution — runtime-abstraction
- t-0035 [closed] Implement SDK-backed live worker runtime — sdk-runtime
- t-0036 [closed] Add RPC fallback seam for live workers — rpc-fallback
- t-0037 [closed] Build bounded manager scheduler loop — scheduler
- t-0038 [closed] Extend recovery and observability for the new control plane — recovery-observability
- t-0039 [closed] Harden docs tests and neighboring integrations — verification-docs

## Risks and open questions
Residual questions are now evolutionary rather than blocking: whether a future phase should turn the RPC seam into a fuller implementation, what bounded max-turn/max-budget policies best complement inbox-driven runs, and whether a sidecar/event mesh is ever actually justified after living with the bounded scheduler. None of those are missing foundations for the current system. The primary guardrail remains the same: runtime sophistication must not outrun durable protocol truth or ticket primacy.
