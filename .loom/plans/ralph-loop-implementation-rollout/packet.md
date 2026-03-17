# Ralph loop implementation rollout Planning Packet



## Planning Target

add-ralph-loop-orchestration-extension [finalized] Add Ralph loop orchestration extension
Proposal: Introduce a bounded Ralph-specific orchestration extension that runs plan → execute → critique → revise cycles over existing Loom primitives with durable run state, fresh-context iteration support, explicit stop policies, and critique-aware continuation decisions.
Requirements: 12
Tasks: 7

## Current Plan Summary

Coordinate the first implementation slice for the finalized Ralph orchestration extension across the projected package, runtime, critique integration, and test tickets.

## Planning Boundaries

- Keep `plan.md` deeply detailed at the execution-strategy layer; it should explain sequencing, rationale, risks, and validation without duplicating ticket-by-ticket live state.
- Use `pi-ticketing` to create, refine, or link tickets explicitly. Plans provide coordination context around those tickets, and linked tickets stay fully detailed and executable in their own right.
- Treat linked tickets as the live execution system of record for status, dependencies, verification, and checkpoints, and as self-contained units of work with their own acceptance criteria and execution context.
- Preserve truthful source refs, ticket roles, assumptions, risks, and validation intent so a fresh planner can resume from durable context.

## Linked Tickets

- t-0001 [closed] Scaffold pi-ralph package and run ledger — foundation
- t-0002 [closed] Render resumable run records and dashboards — rendering
- t-0003 [closed] Implement lifecycle and stop-policy engine — lifecycle
- t-0004 [closed] Integrate critique and verifier evidence — review-integration
- t-0005 [closed] Add fresh-context launch and resume adapters — launch-adapter
- t-0006 [closed] Expose Ralph command, tools, and guidance — operator-surface
- t-0007 [closed] Cover runtime behavior with tests — verification

## Scope Paths

- CONSTITUTION.md
- packages/pi-critique
- packages/pi-plans
- packages/pi-ralph
- packages/pi-ticketing
- README.md

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

- state-of-the-art-for-ralph-loop-orchestration [synthesized] State of the art for Ralph loop orchestration — conclusions: 'Ralph loop' / 'Ralph Wiggum loop' is not a canonical academic/framework term; it is an emerging community label used in practitioner articles, repos, and tooling docs.; For coding-agent systems, scaffold design and verifier wiring matter materially; current benchmark ecosystems increasingly measure the combined agent-plus-scaffold rather than the base model in isolation.; Modern production frameworks treat loop orchestration as explicit runtime control with persistence/checkpointing, interrupt-resume boundaries, human approval hooks, tracing, and bounded stop policies.; Recent surveys and papers indicate that pure prompted self-correction is unreliable in general; loops become materially stronger when critique is grounded in reliable external feedback such as tests, tool outputs, environment signals, or trained evaluators.; The closest established patterns are ReAct, Self-Refine, Reflexion, CRITIC, Tree-of-Thoughts, Constitutional AI, and evaluator-optimizer / planner-executor-critic workflows.; The repo's current doctrine—plan/execution/critique/revision loop with critique kept as a reusable durable layer distinct from the loop itself—is directionally aligned with stronger state-of-the-art patterns.

## Specs

- add-ralph-loop-orchestration-extension [finalized] Add Ralph loop orchestration extension — reqs=12 tasks=7

## Tickets

- t-0001 [closed] Scaffold pi-ralph package and run ledger — Create the new extension package, package metadata, README, lifecycle hooks, and durable `.loom/ralph/` ledger initialization with synced per-run artifact writes.
- t-0002 [closed] Render resumable run records and dashboards — Implement store-backed run reading, markdown rendering, append-only iteration history, packet generation, and dashboard views that expose linked artifacts and prior decisions for audit and resume.
- t-0003 [closed] Implement lifecycle and stop-policy engine — Model explicit run and iteration statuses plus composed continuation, pause, escalation, and terminal decisions driven by configured policies and runtime outcomes.
- t-0004 [closed] Integrate critique and verifier evidence — Link Ralph runs to critique packets, verdicts, findings, and structured verifier summaries from plans, tickets, tests, or diagnostics so revision decisions are grounded in external evidence.
- t-0005 [closed] Add fresh-context launch and resume adapters — Write bounded iteration packets and launch descriptors, then invoke a subprocess-compatible runtime adapter for fresh worker turns and resumptions using durable run state hydration.
- t-0006 [closed] Expose Ralph command, tools, and guidance — Provide `/ralph` commands plus `ralph_*` tool handlers for list/read/write/packet/launch/dashboard workflows and add system-prompt guidance that keeps Ralph distinct from critique while emphasizing bounded orchestration.
- t-0007 [closed] Cover runtime behavior with tests — Add package tests for persistence, state transitions, stop-policy outcomes, critique-gated pause and resume behavior, launch descriptors, and command/tool registration.

## Critiques

- critique-pi-ralph-implementation-rollout [resolved/pass] Critique pi-ralph implementation rollout — open findings: 0

## Documentation

(none)
