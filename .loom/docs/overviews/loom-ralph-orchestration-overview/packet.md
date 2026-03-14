---
id: loom-ralph-orchestration-overview
title: "Loom Ralph orchestration overview"
status: active
type: overview
section: overviews
source: workspace:repo
audience:
  - ai
  - human
created-at: 2026-03-15T21:07:35.095Z
updated-at: 2026-03-15T21:07:35.095Z
---

## Documentation Target
Workspace documentation target: repo

## Update Reason
Document the newly landed Ralph orchestration layer and how it fits into the Loom stack.

## Current Document Summary
What Ralph is pi ralph is the bounded orchestration package for long horizon work in this workspace. It persists Ralph runs under .loom/ralph/ and provides a durable place to track loop state, iteration history, verifier evidence, critique… | sections: Boundary to keep in mind, Current package surface, Durable run layout, Loop behavior, What Ralph is, What remains canonical outside Ralph, Why this layer exists

## Audience
ai, human

## Scope Paths
- CONSTITUTION.md
- packages/pi-ralph
- README.md

## Guide Topics
- fresh-context-launches
- loop-policy
- ralph-orchestration

## Documentation Boundaries
- Keep the document high-level and explanatory for both humans and AI memory.
- Do not generate API reference docs or exhaustive symbol listings.
- Describe completed reality, not plans that have not landed.
- Keep linkedOutputPaths truthful for future sync workflows, but do not mutate external docs trees automatically in v1.

## Likely Sections To Update
- Boundary to keep in mind
- Current package surface
- Durable run layout
- Loop behavior
- What Ralph is
- What remains canonical outside Ralph
- Why this layer exists

## Existing Revisions
(none)

## Constitutional Context
(none)

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
- critique-pi-ralph-implementation-rollout [active/concerns] Critique pi-ralph implementation rollout — open findings: 0
