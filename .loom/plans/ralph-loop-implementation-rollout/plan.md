# Ralph loop implementation rollout

## Purpose / Big Picture
Bridge the finalized Ralph spec into an ordered linked-ticket implementation rollout while keeping ticket execution detail in the ticket ledger.

## Progress
- [x] Ticket t-0001 — Scaffold pi-ralph package and run ledger (foundation)
- [x] Ticket t-0002 — Render resumable run records and dashboards (rendering)
- [x] Ticket t-0003 — Implement lifecycle and stop-policy engine (lifecycle)
- [x] Ticket t-0004 — Integrate critique and verifier evidence (review-integration)
- [x] Ticket t-0005 — Add fresh-context launch and resume adapters (launch-adapter)
- [x] Ticket t-0006 — Expose Ralph command, tools, and guidance (operator-surface)
- [x] Ticket t-0007 — Cover runtime behavior with tests (verification)

## Surprises & Discoveries
- Observation: The repo still treats broader worker orchestration as deferred, so the implementation stayed scoped to Ralph loop mode rather than a generic engine.
  Evidence: Root README doctrine and the spec clarification both bound this work to a Ralph-specific package.

- Observation: Fresh-context iteration and explicit policy gates were sufficient to land a useful first version without collapsing critique or ticketing into Ralph-owned state.
  Evidence: The final package tests prove durable packet, launch, verifier, critique, and decision behavior while lower Loom layers remain canonical.

## Decision Log
- Decision: Link the plan to spec-projected tickets instead of restating execution work in plan.md.
  Rationale: `pi-plans` keeps plan markdown thin and treats tickets as the live execution record, so the plan should sequence ticket work rather than replace it.
  Date/Author: 2026-03-15 / ChatGPT

- Decision: Sequence lifecycle and rendering work immediately after scaffolding, then gate critique integration and launch support on those foundations.
  Rationale: The projected ticket dependency graph showed t-0002 and t-0003 unlocking the rest of the implementation stream.
  Date/Author: 2026-03-15 / ChatGPT

## Outcomes & Retrospective
Outcome: `pi-ralph` now exists as a first-class bounded orchestration package with durable run state, packet/dashboard artifacts, fresh-context launch/resume support, critique/verifier-aware decisions, `/ralph` commands, and `ralph_*` tools. Retrospective: the spec-derived ticket graph sequenced the work cleanly, and keeping Ralph scoped to a package instead of a generic engine preserved the intended architecture.

## Context and Orientation
This plan implemented spec `add-ralph-loop-orchestration-extension` through the projected ticket set while keeping plan.md thin and navigational. Tickets carried the live execution detail and verification state.

Source target: spec:add-ralph-loop-orchestration-extension

Scope paths: CONSTITUTION.md, packages/pi-critique, packages/pi-plans, packages/pi-ralph, packages/pi-ticketing, README.md

Research: state-of-the-art-for-ralph-loop-orchestration
Specs: add-ralph-loop-orchestration-extension
Critiques: critique-pi-ralph-implementation-rollout

## Plan of Work
Completed: package scaffold and durable run ledger first, then run rendering and lifecycle logic, then critique/verifier integration and fresh-context launch support, then the command/tool surface, and finally focused package tests.

## Concrete Steps
All projected tickets t-0001 through t-0007 are now closed. Remaining follow-up work, if any, should be opened as new tickets rather than extending this completed rollout plan.

## Validation and Acceptance
Completed with package-local tests, targeted Biome checks, and workspace typecheck. Verification commands: `npx vitest run packages/pi-ralph/__tests__/commands.test.ts packages/pi-ralph/__tests__/index.test.ts packages/pi-ralph/__tests__/prompt-guidance.test.ts packages/pi-ralph/__tests__/runtime.test.ts packages/pi-ralph/__tests__/store.test.ts packages/pi-ralph/__tests__/tools.test.ts`, `npx biome check package.json README.md packages/pi-ralph`, and `npm run typecheck`.

## Tickets
- t-0001 [closed] Scaffold pi-ralph package and run ledger — foundation
- t-0002 [closed] Render resumable run records and dashboards — rendering
- t-0003 [closed] Implement lifecycle and stop-policy engine — lifecycle
- t-0004 [closed] Integrate critique and verifier evidence — review-integration
- t-0005 [closed] Add fresh-context launch and resume adapters — launch-adapter
- t-0006 [closed] Expose Ralph command, tools, and guidance — operator-surface
- t-0007 [closed] Cover runtime behavior with tests — verification

## Risks and open questions
The one open process issue is that the durable critique record launched for this rollout did not record a critique run result, so future review automation for critique_launch may still need inspection outside this completed implementation scope.
