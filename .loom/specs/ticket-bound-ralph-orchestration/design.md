---
id: ticket-bound-ralph-orchestration
title: "Ticket-bound Ralph orchestration"
status: finalized
created-at: 2026-03-28T03:53:53.720Z
updated-at: 2026-03-28T03:54:45.212Z
research: []
initiatives: []
capabilities:
  - exact-ticket-and-plan-binding
  - fresh-context-iterations-and-ticket-truthfulness
  - explicit-policy-steering-and-job-control
  - runtime-scope-propagation-and-worktree-idempotence
---

## Design Notes
## Problem framing
Long-running execution cannot rely on one drifting transcript or on one runtime process as the source of truth. Pi Loom therefore keeps Ralph as a bounded orchestration layer that repeatedly rehydrates from durable context, works one ticket at a time, and records enough run state to pause, resume, critique, or stop truthfully.

## Desired behavior
A Ralph run should behave like a managed loop around one ticket and its effective plan binding. It should preserve ticket truth, fresh-context iteration boundaries, policy decisions, queued steering, runtime observability, and explicit stop or pause behavior without absorbing the responsibilities of plans, tickets, critique, or docs.

## Scope
This spec covers ticket/plan binding, one-ticket concurrency, fresh-context iteration behavior, runtime artifacts and background jobs, explicit steering/stop controls, runtime-scope propagation, and worktree branch intent reuse.

## Non-goals
This spec does not turn Ralph into a generic workflow engine or a replacement for ticket truth, critique review, or documentation maintenance. It also does not require every execution to use a worktree when direct execution is sufficient.

## Dependencies and adjacent specs
Ralph depends on plans for broader execution strategy, tickets for live execution truth, critique for review, docs for post-completion explanation, and storage/runtime-scope contracts for explicit repository/worktree targeting.

## Risks and edge cases
The main risks are allowing several loops to work the same ticket concurrently, letting runtime artifacts become mistaken for canonical shared truth, or using steering to override the governing ticket contract. Another risk is ambiguous repository or worktree selection during fresh launches.

## Verification expectations
A conforming Ralph run can be inspected later and still explain which ticket and plan it was bound to, what happened during the latest iteration, what policy governed continuation, what runtime artifacts were produced, and whether the bound ticket was updated truthfully before the launch ended.

## Provenance
Derived from README.md, ralph/README.md, Ralph tool guidance, runtime-scope/workspace contracts, and current Ralph extension wiring.

## Open questions
Policy posture and execution environments may evolve, but Ralph must remain a bounded ticket-centric orchestration layer with explicit control and durable observability.

## Capability Map
- exact-ticket-and-plan-binding: Exact ticket and plan binding
- fresh-context-iterations-and-ticket-truthfulness: Fresh-context iterations and ticket truthfulness
- explicit-policy-steering-and-job-control: Explicit policy, steering, and job control
- runtime-scope-propagation-and-worktree-idempotence: Runtime scope propagation and worktree idempotence

## Requirements
- req-001: A Ralph run SHALL bind to one exact ticket reference, with an optional governing plan reference when plan context applies.
  Acceptance: A run can always be identified by its ticket binding and effective plan context.; Operators can inspect a run and understand which ticket and plan it governs.; Two loops cannot truthfully operate the same ticket at the same time.
  Capabilities: exact-ticket-and-plan-binding
- req-002: Multiple Ralph runs MAY coexist only when they do not execute the same ticket concurrently.
  Acceptance: A run can always be identified by its ticket binding and effective plan context.; Operators can inspect a run and understand which ticket and plan it governs.; Two loops cannot truthfully operate the same ticket at the same time.
  Capabilities: exact-ticket-and-plan-binding
- req-003: The bound ticket SHALL remain the authoritative execution ledger that Ralph is expected to keep truthful.
  Acceptance: A run can always be identified by its ticket binding and effective plan context.; Operators can inspect a run and understand which ticket and plan it governs.; Two loops cannot truthfully operate the same ticket at the same time.
  Capabilities: exact-ticket-and-plan-binding
- req-004: When a governing plan is present, Ralph SHALL inherit that broader execution context instead of requiring the operator to restate it every iteration.
  Acceptance: A run can always be identified by its ticket binding and effective plan context.; Operators can inspect a run and understand which ticket and plan it governs.; Two loops cannot truthfully operate the same ticket at the same time.
  Capabilities: exact-ticket-and-plan-binding
- req-005: Continuation decisions SHALL depend on durable evidence such as verifier outputs, critique findings, acceptance progress, or explicit policy rather than on model confidence alone.
  Acceptance: A later reader can inspect the latest iteration and understand what was attempted and what truth changed in the ticket.; Continuation or pause decisions remain grounded in durable evidence.; Ralph does not treat one long transcript as the canonical execution record.
  Capabilities: fresh-context-iterations-and-ticket-truthfulness
- req-006: Each Ralph iteration SHALL rehydrate from durable context and aim at one bounded ticket-sized unit of work.
  Acceptance: A later reader can inspect the latest iteration and understand what was attempted and what truth changed in the ticket.; Continuation or pause decisions remain grounded in durable evidence.; Ralph does not treat one long transcript as the canonical execution record.
  Capabilities: fresh-context-iterations-and-ticket-truthfulness
- req-007: Iteration records SHALL remain explicit enough that later callers can tell what changed, what failed, what was verified, and what remains unresolved.
  Acceptance: A later reader can inspect the latest iteration and understand what was attempted and what truth changed in the ticket.; Continuation or pause decisions remain grounded in durable evidence.; Ralph does not treat one long transcript as the canonical execution record.
  Capabilities: fresh-context-iterations-and-ticket-truthfulness
- req-008: Ticket status, notes, verification, blockers, or related execution truth SHALL be updated before an iteration is treated as complete.
  Acceptance: A later reader can inspect the latest iteration and understand what was attempted and what truth changed in the ticket.; Continuation or pause decisions remain grounded in durable evidence.; Ralph does not treat one long transcript as the canonical execution record.
  Capabilities: fresh-context-iterations-and-ticket-truthfulness
- req-009: Background execution SHALL remain observable through explicit job read, wait, and cancel controls rather than ad hoc polling or silence.
  Acceptance: A later operator can inspect which policy governed the run.; Background jobs remain controllable and inspectable without losing the durable run state.; Steering changes the next iteration's context without rewriting the base ticket contract.
  Capabilities: explicit-policy-steering-and-job-control
- req-010: Operators SHALL be able to request a clean stop or pause and have that request durably reflected in run state.
  Acceptance: A later operator can inspect which policy governed the run.; Background jobs remain controllable and inspectable without losing the durable run state.; Steering changes the next iteration's context without rewriting the base ticket contract.
  Capabilities: explicit-policy-steering-and-job-control
- req-011: Queued steering SHALL remain additive context for the next iteration boundary rather than a hidden replacement for the governing ticket contract.
  Acceptance: A later operator can inspect which policy governed the run.; Background jobs remain controllable and inspectable without losing the durable run state.; Steering changes the next iteration's context without rewriting the base ticket contract.
  Capabilities: explicit-policy-steering-and-job-control
- req-012: Ralph SHALL preserve a policy snapshot that records runtime limits, review requirements, and completion posture for the managed loop.
  Acceptance: A later operator can inspect which policy governed the run.; Background jobs remain controllable and inspectable without losing the durable run state.; Steering changes the next iteration's context without rewriting the base ticket contract.
  Capabilities: explicit-policy-steering-and-job-control
- req-013: Fresh-process runtime launches SHALL carry explicit space, repository, and worktree identity when ambiguity exists rather than inferring target scope from cwd alone.
  Acceptance: A runtime artifact reveals which repository and worktree actually executed.; Ambiguous or unavailable runtime scope causes an explicit failure instead of a plausible lie.; Repeated worktree iterations remain idempotent because they reuse the stored branch/worktree choice.
  Capabilities: runtime-scope-propagation-and-worktree-idempotence
- req-014: If the requested repository or worktree is unavailable or belongs to the wrong space, Ralph SHALL fail closed instead of silently hopping to a different local target.
  Acceptance: A runtime artifact reveals which repository and worktree actually executed.; Ambiguous or unavailable runtime scope causes an explicit failure instead of a plausible lie.; Repeated worktree iterations remain idempotent because they reuse the stored branch/worktree choice.
  Capabilities: runtime-scope-propagation-and-worktree-idempotence
- req-015: Ticket branch intent SHALL drive branch-family allocation or exact-branch reuse when Ralph executes in worktree mode.
  Acceptance: A runtime artifact reveals which repository and worktree actually executed.; Ambiguous or unavailable runtime scope causes an explicit failure instead of a plausible lie.; Repeated worktree iterations remain idempotent because they reuse the stored branch/worktree choice.
  Capabilities: runtime-scope-propagation-and-worktree-idempotence
- req-016: Worktree-backed runs SHALL reuse the durable branch/worktree selection already stored for the bound run rather than reallocating on every iteration.
  Acceptance: A runtime artifact reveals which repository and worktree actually executed.; Ambiguous or unavailable runtime scope causes an explicit failure instead of a plausible lie.; Repeated worktree iterations remain idempotent because they reuse the stored branch/worktree choice.
  Capabilities: runtime-scope-propagation-and-worktree-idempotence
