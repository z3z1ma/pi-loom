# Manager-worker control-plane next phase

## Purpose / Big Picture
Turn the newly accumulated manager-worker research into an actionable, bounded roadmap for making the worker substrate materially more useful without abandoning the simplicity and durable-truth principles that motivated the first implementation.

## Progress
- [ ] No tickets linked yet.

## Surprises & Discoveries
- Observation: The worker substrate solved the foundational truth problem, but usefulness now depends more on protocol and control-loop design than on another raw persistence layer.
  Evidence: Current `pi-workers` package already persists workers, messages, checkpoints, approvals, and consolidation; the next research is about control surfaces and live-worker behavior.

- Observation: Pi’s SDK and RPC surfaces are materially stronger long-lived control options than session fork/resume/branch, which remain session-history primitives rather than worker lifecycle primitives.
  Evidence: Research record `evaluate-pi-control-surfaces-for-long-lived-workers`.

- Observation: A true actor/event mesh is an acceleration layer idea, not the first missing foundation.
  Evidence: The current system still lacks explicit inbox-draining worker turns and a first-class manager control surface, both of which can be added without sidecar/event-broker complexity.

## Decision Log
- Decision: Treat inbox protocol and worker-turn semantics as the next design anchor before selecting a long-lived runtime architecture.
  Rationale: Runtime complexity without a clear durable protocol will only make worker behavior harder to reason about and recover.
  Date/Author: 2026-03-16 / ChatGPT

- Decision: Prefer SDK-backed workers as the first live-worker direction, with RPC as fallback rather than as the domain model.
  Rationale: The new research shows SDK is the cleanest same-runtime control surface and RPC is strongest when process separation is required.
  Date/Author: 2026-03-16 / ChatGPT

- Decision: Delay sidecar/event-mesh work until the simpler combination of durable inbox semantics, manager polling, and runtime abstraction has been tried.
  Rationale: This preserves simplicity and keeps the architecture bounded while still leaving room for a future acceleration layer if evidence demands it.
  Date/Author: 2026-03-16 / ChatGPT

## Outcomes & Retrospective
Desired outcome: a clearly sequenced second phase that makes the worker substrate feel materially more like a manager-worker system without sacrificing the bounded, durable, repo-truthful architecture already achieved. Success means the next implementation wave will improve usefulness — inbox handling, manager orchestration, and live-worker control — rather than merely increasing runtime cleverness.

Retrospective criteria for the future:
- Did the next phase reduce the amount of manual operator choreography required to keep workers moving?
- Did the manager surface become explicit enough that an AI session can actually orchestrate workers intentionally rather than improvisationally?
- Did runtime changes preserve ticket primacy and worker portability?
- Did the project avoid building a sidecar/event-mesh layer before it had real evidence that the simpler control plane was insufficient?

## Context and Orientation
Pi Loom now has a working first-pass worker substrate: durable worker records under `.loom/workers/`, Git-worktree-backed runtime attachment helpers, message/checkpoint/telemetry records, supervision heuristics, completion approval, consolidation outcomes, `/worker` commands, and `worker_*` tools. That phase solved the foundational truth problem: workers are now real workspace-backed execution units rather than session branches or generic subagent metaphors.

The new research changes the next question, not the first implementation’s validity. `prepare-manager-worker-architecture-from-pi-supervisor-and-pi-extension-interfaces` established the architectural doctrine: workers are workspace-backed, managers supervise from compact state, tickets remain execution truth, and Ralph must stay bounded. `evaluate-pi-control-surfaces-for-long-lived-workers` adds runtime guidance: Pi exposes one-shot CLI/JSON subprocesses, long-lived stdio RPC, and in-process SDK sessions; no first-class Pi worker daemon exists; SDK is the provisional favorite for same-runtime live workers; RPC is the strongest documented fallback for cross-process control; session fork/resume/branch are explicitly not worker lifecycle primitives.

The practical takeaway is that the current subprocess substrate is a good v1 foundation but not the last mile. It still behaves mostly like durable, workspace-backed, resumable subagent turns. The next phase should therefore improve usefulness before chasing maximal runtime sophistication. Specifically, the system needs a stronger inbox protocol, better worker turn semantics, a real manager control surface, and a runtime abstraction that can host longer-lived or more interactive workers without immediately forcing the project into a full actor-mesh or sidecar-driven system. This plan is structured around that incremental philosophy.

Source target: initiative:workspace-backed-manager-worker-coordination

Scope paths: .loom/research, AGENTS.md, packages/pi-plans, packages/pi-ralph, packages/pi-ticketing, packages/pi-workers, README.md

Roadmap: item-007
Initiatives: workspace-backed-manager-worker-coordination
Research: evaluate-pi-control-surfaces-for-long-lived-workers, prepare-manager-worker-architecture-from-pi-supervisor-and-pi-extension-interfaces
Specs: add-workspace-backed-manager-worker-substrate
Critiques: critique-workspace-backed-manager-worker-rollout
Docs: workspace-backed-manager-worker-execution-overview

## Plan of Work
The next phase should be organized into five workstreams.

Workstream 1 — Formalize the durable inbox protocol
The current worker substrate has durable messages, but it does not yet define the stronger contract needed for useful autonomous manager-worker loops. The first step is to specify and implement message lifecycle semantics (`pending`, `acknowledged`, `resolved`, potentially `superseded` later), causal expectations, and worker obligations when processing manager instructions. The key behavioral rule should be: workers consume unresolved inbox state as part of their turn and cannot silently ignore manager messages. This workstream should also define what counts as a worker acknowledgment versus a resolution versus an escalation back to the manager.

Workstream 2 — Make worker turns inbox-driven instead of single-shot by convention
Once message semantics are explicit, worker execution should become meaningfully inbox-aware. The practical v2 behavior should be: when a worker runs, it processes the accumulated inbox, acts on each unresolved instruction, records checkpoints/messages, then re-checks whether new unresolved messages arrived before deciding to stop. A worker should stop only when its inbox is empty, it is blocked on manager input, it is requesting approval, or policy says to pause. This can still be turn-based and bounded; it does not yet require an always-on daemon.

Workstream 3 — Add a real manager surface and scheduler loop
The current manager is implicit: the controlling session uses `worker_*` tools manually. The next useful step is to make that explicit. Add a `/manager` or `manager_*` surface that can list workers, inspect dashboards, supervise all active workers, drain pending approvals, send messages, and resume workers automatically based on worker state. Initially this can be polling-driven and bounded. The point is not to introduce magic but to give the AI manager a native control surface that reflects the actual worker protocol.

Workstream 4 — Introduce a runtime abstraction and explore SDK-first live workers
The new runtime research strongly suggests that the current one-shot subprocess runner should stop being the only runtime strategy. The next phase should introduce a worker runtime abstraction with at least:
- current subprocess implementation as the existing baseline
- SDK-backed runtime as the preferred next implementation
- RPC-backed runtime as a documented fallback path for stronger process isolation or cross-process hosting
The goal here is not immediate generality for its own sake. The goal is to remove one-shot subprocess execution as a hard architectural assumption and make room for live, event-driven or longer-lived workers where they materially improve usefulness.

Workstream 5 — Delay actor mesh and sidecars until protocol pressure proves they are needed
The user’s instinct about a sidecar or actor-style event mesh is directionally correct, but the plan should not jump there first. Before adding a sidecar scheduler or event broker, Pi Loom should first prove that the simpler combination of durable inbox protocol, inbox-aware worker turns, manager scheduler loop, and SDK/RPC runtime abstraction is insufficient. If that proof appears later, a sidecar or actor-mesh layer can be added as an acceleration/runtime layer on top of the durable worker ledger rather than replacing it.

This sequencing keeps the system bounded and testable. It also ensures that runtime sophistication is driven by protocol pressure, not by architectural aspiration alone.

## Concrete Steps
1. Open a new bounded spec revision or successor spec dedicated to the next-phase worker control plane. That spec should explicitly preserve the existing worker substrate while revising runtime assumptions beyond 'subprocess-only'.
2. In that spec, define the message lifecycle contract and the worker turn contract before choosing a long-lived runtime architecture. This prevents runtime work from ossifying around ambiguous inbox semantics.
3. Split manager responsibilities into two layers:
   - durable worker state and policy, which already exists and should remain canonical
   - manager orchestration surface, which should become a first-class command/tool family instead of remaining implicit chat behavior
4. Introduce a worker runtime interface in code so the existing subprocess runner becomes one implementation rather than the architecture itself.
5. Prototype SDK-backed worker hosting behind that interface first, because the research says SDK is the cleanest same-runtime surface and aligns best with direct event subscriptions and session control.
6. Keep a clear RPC fallback design beside the SDK path, but do not let RPC drive the domain model. RPC is transport/control, not worker semantics.
7. After the manager surface and runtime abstraction exist, add a bounded polling scheduler loop for the manager. Make it responsible for:
   - scanning workers
   - inspecting unresolved inbox state
   - deciding whether to message/resume/escalate/approve
   - avoiding idle-worker starvation
8. Only after that loop is in place should Pi Loom assess whether it still needs a sidecar/event-broker layer for lower latency or truly long-lived workers.
9. If sidecar/event mesh pressure remains high after the above steps, create a new dedicated research/spec cycle for that runtime layer rather than smuggling it into the manager-scheduler work.

Implementation sequencing recommendation:
- spec revision first
- durable inbox protocol second
- manager surface third
- runtime abstraction and SDK worker host fourth
- polling scheduler fifth
- RPC fallback or sidecar exploration only if still justified

## Validation and Acceptance
Validation for the next phase should explicitly prove behavioral usefulness, not just code existence.

For the inbox protocol work:
- tests should prove workers cannot silently ignore unresolved manager messages
- tests should prove acknowledgment/resolution state transitions are durable and queryable
- tests should prove inbox-driven worker turns drain pending work until a legitimate stop condition is reached

For the manager surface:
- tests should prove a manager can supervise multiple workers from the durable ledger without human intervention between every worker turn
- tests should prove the manager responds correctly to blocked, idle, waiting-for-review, and completion-requesting workers
- tests should prove manager actions are durable and auditable

For the runtime abstraction:
- tests should prove the same worker contract can be exercised through at least the existing subprocess runtime and one additional runtime implementation
- if SDK-backed workers are added, tests should prove recovery semantics and event-driven steering behavior are truthful
- if RPC is added later, tests should prove parity with the worker contract rather than transport-specific drift

For the scheduler loop:
- tests should prove repeated polling results in useful autonomous progress rather than infinite no-op loops
- tests should prove anti-stagnation escalation still works under the new runtime model
- tests should prove manager-driven approval and consolidation remain the non-parallelizable boundary

Plan-level success looks like this: the AI manager can use a first-class manager surface to keep several workers moving through inbox-driven turns with materially less manual babysitting, while ticket primacy, worker portability, and bounded architecture all remain intact.

## Tickets
- (none linked)

## Risks and open questions
Primary risks:
- Runtime overreach: adding SDK/RPC plumbing before the inbox protocol is explicit could make the system more complex without making it more understandable.
- Control-plane drift: a manager scheduler might accidentally become a new hidden execution ledger if its decisions are not persisted back into worker/ticket state.
- Actor-mesh temptation: the desire for real-time concurrency could lead to a sidecar/event-broker layer before the simpler polling/inbox model has actually failed.
- Boundary erosion: the more interactive the worker runtime becomes, the easier it is to blur the distinction between workers, tickets, and Ralph.

Open questions to keep visible:
- Should the next spec revise the existing worker spec or introduce a successor control-plane spec that treats the current substrate as a completed foundation?
- Is SDK-backed worker hosting acceptable from an isolation perspective for the first live-worker iteration, or is RPC needed earlier for practical containment?
- What exact worker stop condition is right for an inbox-draining turn: inbox empty only, or also a bounded max-turn/max-tool-cycle policy?
- How much manager automation is enough before a sidecar/event broker becomes warranted?

Default posture for now:
- prefer SDK first
- keep RPC as fallback
- prefer inbox-draining turn semantics over always-on daemons
- add manager polling before sidecars
