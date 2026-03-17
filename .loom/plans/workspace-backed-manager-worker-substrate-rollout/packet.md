# Workspace-backed manager-worker substrate rollout Planning Packet



## Planning Target

add-workspace-backed-manager-worker-substrate [finalized] Add workspace-backed manager-worker substrate
Proposal: Introduce a new workspace-backed execution substrate for Pi Loom in which workers are durable, ticket-attached abstractions over ephemeral workspaces and managers act as out-of-band supervisors and consolidators rather than as transcript-bound copilots. The change formalizes how…
Requirements: 24
Tasks: 12

## Current Plan Summary

Completed the implementation of the finalized workspace backed manager worker substrate spec as a dependency aware rollout that preserved Pi Loom’s layer boundaries, added a new pi workers package, and left the workspace green under lint, …

## Planning Boundaries

- Keep `plan.md` deeply detailed at the execution-strategy layer; it should explain sequencing, rationale, risks, and validation without duplicating ticket-by-ticket live state.
- Use `pi-ticketing` to create, refine, or link tickets explicitly. Plans provide coordination context around those tickets, and linked tickets stay fully detailed and executable in their own right.
- Treat linked tickets as the live execution system of record for status, dependencies, verification, and checkpoints, and as self-contained units of work with their own acceptance criteria and execution context.
- Preserve truthful source refs, ticket roles, assumptions, risks, and validation intent so a fresh planner can resume from durable context.

## Linked Tickets

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

## Scope Paths

- .gitignore
- AGENTS.md
- CONSTITUTION.md
- package-lock.json
- package.json
- packages/pi-critique
- packages/pi-docs
- packages/pi-initiatives
- packages/pi-plans
- packages/pi-ralph
- packages/pi-research
- packages/pi-specs
- packages/pi-ticketing
- packages/pi-workers
- README.md

## Constitutional Context

Project: Pi Loom
Strategic direction: (empty)
Current focus: none
Open constitutional questions: Capture the architectural and business constraints.; Capture the guiding decision principles.; Capture the strategic direction and roadmap.; Define the durable project vision.

## Roadmap Items

(none)

## Initiatives

- workspace-backed-manager-worker-coordination [completed] Workspace-backed manager-worker coordination — Develop a truthful manager-worker operating model for Pi Loom in which workers are ephemeral workspaces, managers supervise and consolidate bounded execution across those workspaces, and the resulting system composes cleanly with plans, tickets, Ralph, critique, and documentatio…

## Research

- evaluate-pi-control-surfaces-for-long-lived-workers [synthesized] Evaluate Pi control surfaces for long-lived workers — conclusions: Long-lived stdio RPC is sufficient to build live workers with steering, follow-up, abort, state inspection, and extension-UI round trips, but it remains a process/session protocol rather than a worker/domain model.; No documented Pi-native HTTP/WebSocket/gRPC daemon surface or first-class workspace/worktree worker abstraction was found in the inspected docs/source.; Pi currently exposes three meaningful control surfaces for this problem: one-shot CLI/JSON subprocesses, long-lived stdio RPC sessions, and in-process SDK sessions.; Pi session fork/resume/branch operations are session-history primitives, not workspace-aware worker abstractions, so they should not be treated as the worker substrate.; The SDK offers the cleanest same-runtime control surface for a robust manager-worker implementation because it exposes direct session methods plus event subscriptions without protocol framing overhead.
- prepare-manager-worker-architecture-from-pi-supervisor-and-pi-extension-interfaces [synthesized] Prepare manager-worker architecture from pi-supervisor and Pi extension interfaces — conclusions: Current Pi runtime surfaces support extension-based observation, message injection, bounded subprocess/task spawning, and session branch/fork flows, but they do not currently provide an explicit workspace/worktree-backed worker abstraction.; Pi Loom’s current constitutional and package boundaries explicitly keep Ralph bounded and tickets as the live execution ledger. Manager-worker should therefore be introduced as a new workspace-aware execution mechanism that Ralph or plans may invoke and observe, not by turning Ralph into a general workflow engine.; pi-supervisor demonstrates a reusable lightweight oversight pattern: supervise a worker from a separate in-memory Pi session using compact session snapshots, intervention history, and recent deltas rather than sharing full worker context.

## Specs

- add-workspace-backed-manager-worker-substrate [finalized] Add workspace-backed manager-worker substrate — reqs=24 tasks=12

## Tickets

- t-0015 [closed] Scaffold pi-workers package and worker ledger — Create the first truthful home for the manager-worker substrate by adding a new `packages/pi-workers/` extension package, wiring it into the workspace, and bootstrapping the durable `.loom/workers/` ledger shape. This is the foundation ticket: every later worker capability depen…
- t-0016 [closed] Model worker state and portable workspace descriptors — Define the canonical worker domain model, normalization rules, and rendered state so a worker has stable identity, explicit linked Loom refs, durable lifecycle fields, and portable workspace intent without leaking clone-local runtime paths into canonical state.
- t-0017 [closed] Implement workspace provisioning and runtime attachment adapters — Add the workspace lifecycle and runtime attachment layer that turns a durable worker record into a real Git-worktree-backed execution environment with subprocess-backed Pi launches, while keeping machine-local attachment facts outside canonical committed state.
- t-0018 [closed] Persist durable message streams and broadcast semantics — Implement the append-only manager-worker message stream so instructions, escalations, help requests, and bounded broadcast signals survive runtime turnover and can be inspected as canonical coordination history.
- t-0019 [closed] Add checkpoints telemetry and worker dashboards — Implement structured checkpoints, compact telemetry, heartbeat freshness, and dashboard/packet views so managers can supervise workers from concise durable state instead of replaying full transcripts.
- t-0020 [closed] Build the manager supervisory control engine — Implement the out-of-band manager supervision policy that evaluates compact worker telemetry and recent durable deltas, distinguishes busy versus idle phases, persists interventions, and enforces anti-stagnation behavior.
- t-0021 [closed] Implement completion requests and approval workflow — Add the structured completion-request flow in which workers submit explicit evidence and managers record approve, reject-for-revision, or escalate decisions before any consolidation can begin.
- t-0022 [closed] Implement consolidation and fan-in outcomes — Build the manager-owned consolidation flow that takes approved worker output and explicitly fans it into the target branch or execution stream while recording strategy, validation, conflicts, rollback needs, and final outcome as durable evidence.
- t-0023 [closed] Integrate worker provenance with tickets plans Ralph critique and docs — Wire worker records into the surrounding Loom layers through explicit refs, packets, and update hooks so worker execution is traceable everywhere it matters without turning workers into a shadow replacement for tickets, plans, Ralph, critique, or docs.
- t-0024 [closed] Expose worker commands tools and prompt guidance — Provide the first-class operator and agent surface for the worker substrate through `/worker` commands, `worker_*` tools, and prompt guidance that teaches the right architecture and keeps the feature usable in both interactive and headless environments.
- t-0025 [closed] Harden recovery resume and retirement flows — Implement deterministic recovery, resume, reprovision, and retirement behavior so managers can safely recover from crashes, stale attachments, or abandoned workers without relying on the original live process or transcript.
- t-0026 [closed] Cover worker substrate with tests and operator documentation — Close the implementation slice with comprehensive failure-aware tests and package/operator documentation so the new worker substrate is both defended by automation and understandable to future maintainers with minimal prior context.

## Critiques

(none)

## Documentation

(none)
