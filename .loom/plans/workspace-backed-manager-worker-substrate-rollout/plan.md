# Workspace-backed manager-worker substrate rollout

## Purpose / Big Picture
Bridge the finalized manager-worker substrate spec into an ordered linked-ticket execution program so implementation can proceed with high contextual fidelity, explicit sequencing, and strong architectural guardrails while tickets remain the live execution record.

## Progress
- [x] Ticket t-0015 — Scaffold pi-workers package and worker ledger (foundation)
- [x] Ticket t-0016 — Model worker state and portable workspace descriptors (model)
- [x] Ticket t-0017 — Implement workspace provisioning and runtime attachment adapters (runtime-attachment)
- [x] Ticket t-0018 — Persist durable message streams and broadcast semantics (messaging)
- [x] Ticket t-0019 — Add checkpoints telemetry and worker dashboards (observability)
- [x] Ticket t-0020 — Build the manager supervisory control engine (supervision)
- [x] Ticket t-0021 — Implement completion requests and approval workflow (approval)
- [x] Ticket t-0022 — Implement consolidation and fan-in outcomes (consolidation)
- [x] Ticket t-0023 — Integrate worker provenance with tickets plans Ralph critique and docs (provenance-integration)
- [x] Ticket t-0024 — Expose worker commands tools and prompt guidance (operator-surface)
- [x] Ticket t-0025 — Harden recovery resume and retirement flows (recovery)
- [x] Ticket t-0026 — Cover worker substrate with tests and operator documentation (verification)

## Surprises & Discoveries
- Observation: A bounded worker package can deliver meaningful manager-worker behavior without overloading Ralph, as long as worker truth is anchored in portable records and runtime-only descriptors.
  Evidence: Implemented `packages/pi-workers` with durable records, runtime helpers, and no changes that turned Ralph into the worker graph.

- Observation: Ticket external refs and ticket journal updates are enough for a strong first provenance bridge from worker execution back into the live execution ledger.
  Evidence: Worker creation, checkpoints, approvals, and consolidation now update linked ticket artifacts while tickets remain canonical execution truth.

- Observation: The supervision engine can stay compact and useful by evaluating telemetry/checkpoints/messages instead of transcript replay, directly applying the most valuable `pi-supervisor` lesson.
  Evidence: Implemented `superviseWorker` heuristics and validated them through worker store tests.

## Decision Log
- Decision: Implement the worker substrate as a dedicated `pi-workers` package instead of extending Ralph or task-session semantics.
  Rationale: That preserved the finalized spec’s truthful representation: workspace-backed workers with their own ledger and runtime behavior.
  Date/Author: 2026-03-16 / ChatGPT

- Decision: Use `.loom/runtime/workers/` as the ignored runtime attachment root while keeping `.loom/workers/` as canonical state.
  Rationale: This kept machine-local worktree paths out of committed worker truth while still making the runtime attachment model explicit.
  Date/Author: 2026-03-16 / ChatGPT

- Decision: Treat completion approval and consolidation as distinct stages.
  Rationale: That preserved the manager as the explicit authority for non-parallelizable fan-in decisions and made post-approval failure states durable.
  Date/Author: 2026-03-16 / ChatGPT

## Outcomes & Retrospective
Outcome: Pi Loom now ships a first-class `@pi-loom/pi-workers` package and a workspace-backed worker substrate under `.loom/workers/`. Workers are durable execution units with portable state, runtime-only launch descriptors, Git-worktree-backed attachment helpers, durable messages/checkpoints/telemetry, manager supervision heuristics, explicit completion approval, consolidation outcomes, and a headless-safe operator surface.

Retrospective: the spec-driven ticket graph sequenced the work effectively, the worker package stayed bounded instead of leaking into Ralph or ticket truth, and the final green verification pass provides strong evidence that the new substrate integrates cleanly with the existing workspace.

## Context and Orientation
This rollout started from the finalized worker substrate spec and the linked research record that anchored three constraints: use `pi-supervisor` as a source of supervisory-loop ideas rather than as the worker model itself; do not confuse current Pi session/task primitives with truthful workspace-backed workers; and keep Ralph bounded and run-centric. The completed implementation turned those constraints into code by adding a dedicated `pi-workers` package, durable worker records under `.loom/workers/`, Git-worktree-backed runtime attachment helpers, durable messages/checkpoints/telemetry, a compact supervision engine, explicit approval and consolidation stages, and operator surfaces through `/worker` commands plus `worker_*` tools.

The resulting package composes with tickets rather than replacing them. Worker records now carry explicit linked refs and update ticket external refs/journal history for key worker lifecycle events. Root workspace metadata and docs were updated so the repository truthfully reports ten packages and the new worker layer. The implementation remained bounded: no unrestricted peer mesh, no multi-repo orchestration, and no attempt to turn Ralph into the worker graph.

Source target: spec:add-workspace-backed-manager-worker-substrate

Scope paths: .gitignore, AGENTS.md, CONSTITUTION.md, package-lock.json, package.json, packages/pi-critique, packages/pi-docs, packages/pi-initiatives, packages/pi-plans, packages/pi-ralph, packages/pi-research, packages/pi-specs, packages/pi-ticketing, packages/pi-workers, README.md

Roadmap: item-007
Initiatives: workspace-backed-manager-worker-coordination
Research: prepare-manager-worker-architecture-from-pi-supervisor-and-pi-extension-interfaces
Specs: add-workspace-backed-manager-worker-substrate

## Plan of Work
Completed in the planned waves: foundation and worker model first; runtime attachment and messaging next; checkpoints/telemetry and supervision after that; approval and consolidation after the supervisory substrate existed; bounded operator/provenance/recovery integration after the lifecycle was real; and final hardening through comprehensive tests and docs. The dependency order proved correct: the worker model stabilized the rest of the implementation, and leaving verification/documentation until the end prevented tests and docs from fossilizing placeholder behavior.

## Concrete Steps
Completed tickets in order and linked them back into the plan: t-0015 foundation, t-0016 model, t-0017 runtime attachment, t-0018 messaging, t-0019 observability, t-0020 supervision, t-0021 approval, t-0022 consolidation, t-0023 provenance integration, t-0024 operator surface, t-0025 recovery, and t-0026 verification/documentation. No projected tickets remain open for this rollout.

## Validation and Acceptance
Final verification passed end-to-end: `npm run lint`, `npm run typecheck`, and `npm test`. Full workspace results: 64 test files passed and 133 tests passed. Focused worker-package coverage also passed across index, prompt guidance, store, commands, tools, and runtime suites. `npm install` refreshed the workspace lockfile after adding the new package.

## Tickets
- t-0015 [closed] Scaffold pi-workers package and worker ledger — foundation
- t-0016 [closed] Model worker state and portable workspace descriptors — model
- t-0017 [closed] Implement workspace provisioning and runtime attachment adapters — runtime-attachment
- t-0018 [closed] Persist durable message streams and broadcast semantics — messaging
- t-0019 [closed] Add checkpoints telemetry and worker dashboards — observability
- t-0020 [closed] Build the manager supervisory control engine — supervision
- t-0021 [closed] Implement completion requests and approval workflow — approval
- t-0022 [closed] Implement consolidation and fan-in outcomes — consolidation
- t-0023 [closed] Integrate worker provenance with tickets plans Ralph critique and docs — provenance-integration
- t-0024 [closed] Expose worker commands tools and prompt guidance — operator-surface
- t-0025 [closed] Harden recovery resume and retirement flows — recovery
- t-0026 [closed] Cover worker substrate with tests and operator documentation — verification

## Risks and open questions
Residual questions are now evolutionary rather than blocking: future iterations can decide whether to deepen bidirectional plan/Ralph visibility into worker state or to add richer runtime adapters, but those are follow-on enhancements rather than missing foundations. The main guardrail going forward is to preserve the portability rule for canonical state and to resist drifting toward a generic workflow engine.
