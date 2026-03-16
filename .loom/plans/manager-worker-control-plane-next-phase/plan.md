# Manager-worker control-plane next phase

## Purpose / Big Picture
Turn the finalized inbox-driven manager-worker control-plane spec into a dependency-aware execution program that keeps the architecture bounded, preserves ticket primacy, and makes the worker system materially more useful before any later actor-mesh exploration.

## Progress
- [ ] Ticket t-0031 [ready] — Refactor worker messages into a durable inbox protocol (inbox-protocol)
- [ ] Ticket t-0032 [blocked] — Make worker runs inbox-driven and stop-condition aware (inbox-driven-runs)
- [ ] Ticket t-0033 [blocked] — Add first-class manager commands and tools (manager-surface)
- [ ] Ticket t-0034 [blocked] — Introduce runtime abstraction for worker execution (runtime-abstraction)
- [ ] Ticket t-0035 [blocked] — Implement SDK-backed live worker runtime (sdk-runtime)
- [ ] Ticket t-0036 [blocked] — Add RPC fallback seam for live workers (rpc-fallback)
- [ ] Ticket t-0037 [blocked] — Build bounded manager scheduler loop (scheduler)
- [ ] Ticket t-0038 [blocked] — Extend recovery and observability for the new control plane (recovery-observability)
- [ ] Ticket t-0039 [blocked] — Harden docs tests and neighboring integrations (verification-docs)

## Surprises & Discoveries
- Observation: The right next unit of progress is protocol and control-plane quality, not yet a full actor mesh.
  Evidence: The current worker package already solves the foundational worker-truth problem; the new research and user feedback both point at inbox semantics and manager usefulness as the real next gap.

- Observation: SDK-backed live workers are the best currently researched same-runtime next step, but only after the runtime abstraction exists.
  Evidence: Research record `evaluate-pi-control-surfaces-for-long-lived-workers` plus the finalized successor spec.

- Observation: The manager needs an explicit surface before a scheduler can be responsibly added.
  Evidence: Without `/manager` or `manager_*`, the current manager behavior remains implicit low-level orchestration over `worker_*`, which is exactly the usability gap this next phase is meant to fix.

## Decision Log
- Decision: Promote the active next-phase plan from a generic initiative roadmap into the rollout bridge for the new finalized control-plane spec.
  Rationale: The successor spec now exists, so the plan should guide execution rather than remain purely exploratory.
  Date/Author: 2026-03-16 / ChatGPT

- Decision: Sequence inbox protocol and inbox-driven turns before manager surface, runtime abstraction, and scheduler work.
  Rationale: Worker-turn semantics are the controlling contract that later manager/runtime behavior must respect.
  Date/Author: 2026-03-16 / ChatGPT

- Decision: Keep RPC as a fallback track parallel to SDK work rather than the primary runtime path.
  Rationale: The new research and bounded-architecture posture both support SDK-first live workers for same-runtime use while keeping RPC available for stronger separation needs.
  Date/Author: 2026-03-16 / ChatGPT

## Outcomes & Retrospective
Desired outcome: a worker control plane that feels substantially more like a real manager-worker system while still remaining bounded, durable, and understandable. Success means the AI manager can intentionally drive a fleet of workers through inbox semantics, live-worker runtimes, and bounded scheduling with materially less human choreography, yet the system still tells the truth about its durable records and boundaries.

Retrospective criteria for later assessment:
- Did workers become inbox-driven in a way that actually reduced coordination ambiguity?
- Did the manager surface make orchestration simpler and more intentional?
- Did the SDK-backed worker path improve usefulness without breaking recovery or portability?
- Did the scheduler add value without becoming an opaque runtime blob?
- Did the phase avoid prematurely hard-committing the architecture to a sidecar/event mesh?

## Context and Orientation
The planning context has now tightened. When this plan was first opened, it existed to bundle the broader idea space and decide whether the next move should be protocol-first, runtime-first, or sidecar-first. That question is now answered. The finalized successor spec `add-inbox-driven-manager-worker-control-plane` locks in the next bounded change set: durable inbox protocol, inbox-driven worker turns, explicit manager commands/tools, runtime abstraction, SDK-first live workers with RPC fallback, bounded manager scheduling, and stronger recovery/observability. This plan therefore stops being a pure exploration roadmap and becomes the execution bridge for that spec.

The first worker rollout remains important context rather than discarded history. The initial `pi-workers` implementation delivered durable worker records, Git-worktree-backed subprocess launches, messaging, checkpoints, telemetry, supervision heuristics, approvals, consolidation, and a headless-safe operator surface. That completed foundation work proved the worker abstraction and surfaced the current limitations honestly: durable messages exist but inbox semantics are too weak, workers still behave like resumable one-shot turns, the manager lacks a first-class fleet surface, and subprocess execution remains the dominant runtime assumption. The new control-surface research then clarified the runtime options and recorded the current preference: SDK first, RPC fallback, session branch/fork/resume explicitly not worker lifecycle.

This plan is therefore about disciplined evolution, not a reset. It sequences the next tickets so protocol truth lands before runtime cleverness, manager control lands before scheduler autonomy, and runtime abstraction lands before SDK/RPC specialization. Sidecar and actor-mesh ideas remain intentionally out of scope for this rollout unless new evidence appears later.

Source target: spec:add-inbox-driven-manager-worker-control-plane

Scope paths: .loom/research, AGENTS.md, packages/pi-plans, packages/pi-ralph, packages/pi-ticketing, packages/pi-workers, README.md

Roadmap: item-007
Initiatives: workspace-backed-manager-worker-coordination
Research: evaluate-pi-control-surfaces-for-long-lived-workers, prepare-manager-worker-architecture-from-pi-supervisor-and-pi-extension-interfaces
Specs: add-inbox-driven-manager-worker-control-plane, add-workspace-backed-manager-worker-substrate
Critiques: critique-workspace-backed-manager-worker-rollout
Docs: workspace-backed-manager-worker-execution-overview

## Plan of Work
Execution is organized into five waves.

Wave 1 — Inbox truth first:
- `t-0031` formalizes the durable inbox protocol.
- `t-0032` makes worker runs inbox-driven and stop-condition aware.
These two tickets establish the worker-turn contract and should land before any manager or runtime sophistication is added.

Wave 2 — Explicit manager control:
- `t-0033` adds the first-class manager command/tool surface.
This makes the manager role operable and intentional before adding scheduler automation.

Wave 3 — Runtime decoupling and live-worker direction:
- `t-0034` introduces the runtime abstraction.
- `t-0035` adds the SDK-backed live worker runtime.
- `t-0036` adds the RPC fallback seam.
This wave prevents the current subprocess runner from hard-coding the architecture and creates room for stronger live-worker behavior while preserving boundedness.

Wave 4 — Bounded automation and recovery:
- `t-0037` builds the bounded manager scheduler loop.
- `t-0038` extends recovery and observability for the stronger control plane.
This wave is where the system starts reducing manual babysitting meaningfully, but still without a sidecar/event broker.

Wave 5 — Contract hardening:
- `t-0039` closes the phase with docs, prompt guidance, tests, and neighboring integrations.
This last ticket ensures the new control-plane semantics become durable repository truth rather than implementation residue.

Parallelism guidance:
- `t-0035` and `t-0036` can proceed in parallel after `t-0034` if the runtime abstraction contract is stable.
- `t-0038` must remain after scheduler work begins because its observability/recovery layer should reflect real scheduler/runtime state.
- `t-0039` is the final gate and should stay late so tests/docs bind to the integrated result, not placeholders.

## Concrete Steps
1. Start `t-0031` and lock down the durable inbox protocol before changing worker turn behavior.
2. Use `t-0032` to make worker runs truly inbox-driven and explicitly bounded by stop conditions.
3. Land `t-0033` so the manager role gains a truthful command/tool surface before any scheduler logic is introduced.
4. Refactor the current worker execution path behind a runtime abstraction in `t-0034`.
5. Implement SDK-backed live workers in `t-0035` as the preferred next runtime path; treat `t-0036` as a bounded RPC fallback track rather than as the semantic center.
6. Build the bounded manager scheduler in `t-0037` only after the manager surface and preferred live runtime path exist.
7. Extend dashboards, packets, queue visibility, and recovery semantics through `t-0038`.
8. Finish with `t-0039`, ensuring tests, README, prompt guidance, and neighboring integrations explain and defend the completed phase.

Execution guidance for contributors:
- If runtime work starts forcing unresolved protocol decisions, stop and revise the spec rather than guessing in code.
- If manager automation starts to accumulate hidden queue state outside durable worker/ticket records, treat that as a design regression.
- If SDK/RPC work starts to diverge the worker contract by runtime kind, fix the abstraction rather than adding transport-specific exceptions.

## Validation and Acceptance
Validation should prove improved usefulness, not just more code.

Per-wave expectations:
- Wave 1 must prove unresolved inbox state is durable, queryable, and impossible to ignore silently.
- Wave 2 must prove managers can orchestrate many workers through a native surface without low-level choreography.
- Wave 3 must prove runtime abstraction and at least one non-subprocess live-worker path preserve the same worker contract.
- Wave 4 must prove bounded polling actually makes progress across multiple workers and remains restart-safe.
- Wave 5 must prove docs and tests encode the same bounded architecture the spec requires.

Plan-level acceptance:
- The finalized package exposes `/manager` and `manager_*` in addition to the worker surface.
- Workers process inbox backlog durably and visibly before stopping.
- The worker package supports the existing subprocess runtime plus an SDK-backed path behind one contract, with RPC clearly bounded as fallback.
- The manager scheduler can reduce manual babysitting without becoming a hidden execution ledger or sidecar mesh.
- Ticket primacy, worker portability, and Ralph boundedness all remain intact.

Recommended final verification envelope once this rollout is complete:
- targeted `vitest` runs for `packages/pi-workers/__tests__/**/*.test.ts`
- workspace `npm run typecheck`
- targeted `biome` checks for touched package/docs files
- focused neighboring-package tests when integrations are touched

## Tickets
- t-0031 [ready] Refactor worker messages into a durable inbox protocol — inbox-protocol
- t-0032 [blocked] Make worker runs inbox-driven and stop-condition aware — inbox-driven-runs
- t-0033 [blocked] Add first-class manager commands and tools — manager-surface
- t-0034 [blocked] Introduce runtime abstraction for worker execution — runtime-abstraction
- t-0035 [blocked] Implement SDK-backed live worker runtime — sdk-runtime
- t-0036 [blocked] Add RPC fallback seam for live workers — rpc-fallback
- t-0037 [blocked] Build bounded manager scheduler loop — scheduler
- t-0038 [blocked] Extend recovery and observability for the new control plane — recovery-observability
- t-0039 [blocked] Harden docs tests and neighboring integrations — verification-docs

## Risks and open questions
Primary risks:
- protocol/runtimes inverted: implementing live runtimes before inbox semantics are fully explicit could bake ambiguity into every later layer
- hidden scheduler truth: a manager loop that keeps meaningful queue state only in memory would undermine durable recovery
- runtime divergence: SDK, RPC, and subprocess implementations could accidentally produce different worker semantics unless the abstraction is enforced tightly
- actor-mesh creep: once manager scheduling works, there may be pressure to jump straight to sidecars before validating that bounded polling is insufficient

Open questions still worth preserving:
- whether RPC should land as a real implementation in this phase or as a seam/documented fallback stub
- what bounded max-turn/max-budget policy best complements inbox-draining runs
- whether the manager scheduler should live entirely inside `pi-workers` or share some orchestration helper surface with adjacent packages later

Default posture for this rollout:
- protocol first
- manager surface second
- runtime abstraction before transport specialization
- SDK first, RPC fallback
- scheduler before sidecar
