---
id: critique-workspace-backed-manager-worker-rollout
title: "Critique workspace-backed manager-worker rollout"
status: resolved
verdict: pass
target: workspace:workspace-backed-manager-worker-substrate-rollout
focus:
  - architecture
  - correctness
  - docs
  - edge_cases
  - maintainability
  - process
created-at: 2026-03-16T00:57:00.373Z
updated-at: 2026-03-16T01:27:06.700Z
fresh-context-required: true
scope:
  - AGENTS.md
  - package.json
  - packages/pi-plans
  - packages/pi-ralph
  - packages/pi-ticketing
  - packages/pi-workers
  - README.md
---

## Review Target
Workspace review target: workspace-backed-manager-worker-substrate-rollout at packages/pi-workers

## Review Question
Does the implemented workspace-backed manager-worker substrate satisfy the finalized spec and all closed rollout tickets while preserving ticket/plan/Ralph boundaries, portability constraints, and recovery/supervision semantics?

## Focus Areas
architecture, correctness, docs, edge_cases, maintainability, process

## Scope Paths
- AGENTS.md
- package.json
- packages/pi-plans
- packages/pi-ralph
- packages/pi-ticketing
- packages/pi-workers
- README.md

## Non-Goals
- Do not critique unrelated pre-existing formatting churn outside touched files unless it changes reviewability or correctness.
- Do not request new features beyond the finalized spec.

## Fresh Context Protocol
- Start from a fresh reviewer context instead of inheriting the executor session.
- Load .loom/critiques/critique-workspace-backed-manager-worker-rollout/packet.md before reasoning about the target.
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

## Existing Runs
- run-001 [verification/concerns] Fresh review found several real concerns in the worker substrate: workers can be created without linked tickets, consolidation can bypass approval, launch state is persisted as active before any subprocess starts and never updated after execution, retirement cleanup trusts arbitrary workspace paths too broadly, and architectural docs/constitutional enumerations still omit the worker layer in some places.
- run-002 [verification/pass] After fixing the accepted findings, the worker substrate now enforces ticket-linked creation, requires approval before any consolidation outcome, keeps prepare-only launch state truthful, persists launch execution results durably, constrains retirement cleanup to managed runtime paths, and updates AGENTS/constitutional docs to include the worker layer. Independent post-fix spotchecks found no remaining documentation concern and no remaining correctness concern from the previously reported set. Workspace verification is green under lint, typecheck, and the full test suite.

## Existing Open Findings
(none)
