# Ralph plan-anchored continuous loop completion

## Purpose / Big Picture

Drive `pi-ralph-wiggum` from its now-improved spec/plan/ticket-aware bounded runner into the final production model the user clarified: Ralph is not a generic prompt loop and not a one-shot execution helper. It is a single durable plan-anchored control loop that owns ticket-by-ticket execution over one plan until the plan’s ticket set is complete, any newly added tickets are closed, review gates are satisfied, and the run is explicitly judged done. This keeps Ralph bounded and Loom-native without letting it become a general workflow engine.

## Progress

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- [x] (2026-03-21T00:00:00Z) Completed the first realignment pass: tightened Ralph around explicit scope and one-iteration execution semantics, producing a stronger intermediate model.
- [x] (2026-03-21T00:20:00Z) User clarified the final target model: one plan-anchored asynchronous Ralph loop with no separate planning run mode, durable steering, and completion based on the full plan-linked ticket graph rather than per-call manual progression.

Linked ticket snapshot from the live execution ledger:
- [x] Ticket pl-0106 — Ralph ticket-driven iteration checkpoints (implementation)

## Surprises & Discoveries

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Observation: The current intermediate Ralph implementation is no longer the final target because it still requires manual one-call progression and keeps planning-mode semantics inside Ralph.
  Evidence: Latest user clarification explicitly moved the canonical start point to the plan and asked for a continuous asynchronous loop with start/stop/steer/status controls only.

- Observation: A single active Ralph loop per workspace is now a feature, not a limitation.
  Evidence: The user explicitly questioned the value of multiple simultaneous Ralph loops and preferred one loop for simpler durable state and steering management.

- Observation: Ticket synthesis belongs inside the started Ralph loop when a plan has no tickets yet.
  Evidence: The user specified that given a plan, Ralph should ensure tickets exist and start by creating and sequencing them if necessary.

## Decision Log

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Decision: Supersede the earlier plan/spec-or-ticket anchored manual progression model with a single plan-anchored continuous loop model.
  Rationale: The user clarified that the plan is the canonical Ralph anchor, planning mode is no longer a separate Ralph run, and the loop must continue asynchronously until the plan’s ticket graph is complete or explicitly stopped.
  Date/Author: 2026-03-21 / assistant

- Decision: Keep the previous realignment work as an intermediate foundation rather than discarding it.
  Rationale: The existing scope, packet, and single-iteration mechanics are still useful building blocks; they simply need to be embedded inside a managed plan loop and simpler operator surface.
  Date/Author: 2026-03-21 / assistant

## Outcomes & Retrospective

Desired finish-line outcome: an operator can point Ralph at one plan, optionally let it inherit the plan’s governing spec, and then Ralph handles the rest: synthesize missing tickets if needed, work the plan ticket-by-ticket through fresh-context iterations, accept steering durably, stop cleanly on request, and declare completion only when the plan’s live execution graph is truly done. At that point Ralph will finally feel like the literature plus Loom rather than a clever bounded helper. Success will look boring: start one loop, watch durable state advance ticket by ticket, inspect exactly where it is, steer it when needed, and trust that it will either keep going or truthfully explain why it cannot.

## Context and Orientation

The previous realignment work tightened Ralph around explicit spec/plan/ticket scope and one bounded iteration per call. That was a necessary intermediate step, but the user has now clarified the target model more sharply. Canonical Ralph should start from a plan, not a free-form prompt and not a separate planning-mode Ralph run. A plan may itself link back to a governing spec; if so, the spec becomes part of the governing context automatically. If a plan has no tickets yet, Ralph should first synthesize and sequence the plan’s ticket set from the plan/spec context, then begin iterative ticket execution. After start, Ralph should behave as one durable asynchronous loop with one active run in the workspace: each loop iteration picks the next ticket, executes exactly that ticket lifecycle in fresh context, checkpoints durable evidence, incorporates verifier/critique outcomes, updates ticket/plan state, then schedules the next iteration unless the full objective is complete or the run is explicitly stopped. Operators should interact through a minimal control surface: start, stop, steer, introspect. Steering should be durable state consumed on the next iteration rather than ephemeral transcript text. This means the current plan-anchored one-call execution model is still too manual: it lacks loop ownership, start/stop/steer semantics, plan-level ticket synthesis, single-loop coordination, and true until-done scheduling.

## Projection Context

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Status: active
- Source target: workspace:.
- Scope paths: https-github-com-z3z1ma-pi-loom-git:AGENTS.md, https-github-com-z3z1ma-pi-loom-git:packages/pi-constitution/, https-github-com-z3z1ma-pi-loom-git:packages/pi-plans/, https-github-com-z3z1ma-pi-loom-git:packages/pi-ralph-wiggum/, https-github-com-z3z1ma-pi-loom-git:packages/pi-specs/, https-github-com-z3z1ma-pi-loom-git:packages/pi-ticketing/, https-github-com-z3z1ma-pi-loom-git:README.md
- Research: ralph-and-chief-in-process-session-runtime-migration, state-of-the-art-for-ralph-loop-orchestration
- Specs: add-ralph-loop-orchestration-extension, design-widget-first-ralph-ux, session-based-ralph-and-chief-iteration-execution

## Milestones

1. Canonical Ralph control model defined around one active durable plan-anchored loop per workspace, with explicit start/stop/steer/introspect semantics.
2. Run state redesigned so the loop owns one governing plan, optional governing spec, steering backlog, active iteration/ticket lifecycle state, and scheduler control state.
3. Ticket orchestration logic implemented: discover or synthesize plan tickets, pick the next runnable ticket, execute one ticket lifecycle per iteration, incorporate follow-up tickets added mid-run, and decide completion only when the plan’s live ticket graph is truly closed.
4. Async loop runtime implemented: foreground/background command control starts and supervises the loop, but the loop itself continues across iterations until stopped or complete.
5. Prompt/packet context narrowed to governing constitution/spec/plan plus one active ticket and relevant prior learnings for that ticket.
6. Validation, docs, and UX updated so the enforced behavior, run observability, failure recovery, and operator controls are production-ready and truthful.

## Plan of Work

This follow-up must be treated as a second cutover, not an additive patch series. First replace the notion of Ralph-as-manual-iteration-launcher with Ralph-as-single durable plan loop. That means the public command surface and the underlying state machine need to model loop ownership explicitly: a run is now a managed plan execution stream, not merely a record of one bounded call. Next redesign run state around the plan and loop lifecycle: governing plan, optional governing spec, plan-derived ticket universe, active ticket, queued steering, scheduler status, stop requests, completion conditions, and loop progress. Then implement the orchestration contract that bridges Loom plans to tickets: if a plan has no linked tickets, create and link them; otherwise discover the current ticket graph, choose the next runnable unit, and continue until the graph is done. After the orchestration semantics are clear, adapt the session-runtime execution layer so each iteration still uses fresh context and one ticket at a time, but the parent Ralph loop keeps going asynchronously between launches without requiring manual `ralph_run` repetition. Finally, simplify operator UX to just start/stop/steer/introspect while preserving the durable tool/read model and headless recovery surfaces.

## Concrete Steps

Phase A — Redefine the canonical Ralph command and tool contract around one plan.
- Replace the current `/ralph plan|run|resume` mental model with command affordances centered on one managed loop: `/ralph start <plan-ref> [steering]`, `/ralph stop <run-ref or current>`, `/ralph steer <run-ref or current> <text>`, `/ralph status [run-ref or current]`.
- Decide whether `/ralph start` may omit a run ref entirely by targeting the current or only active Ralph loop in the workspace; whichever choice is made, keep it singular and unambiguous.
- Redesign the AI-facing surface to mirror that model. The primary launch tool should start or continue the managed loop over a plan, not ask callers to manually invoke one iteration repeatedly. Separate tools should expose durable steer, stop, inspect, and job control.
- Remove the notion of a separate planning-mode Ralph run. Planning is expected to be done already; if ticket synthesis is needed, that becomes the first iteration responsibility of the plan loop itself.

Phase B — Redesign durable Ralph state around a managed loop.
- Make governing `planRef` first-class and required for canonical new runs.
- Resolve optional governing `specRef` from the plan’s source target and/or context refs; persist it explicitly in run state once discovered so packets and audits do not need to infer it every time.
- Add loop-owned state for: active ticket id, queued steering entries, last-applied steering id, scheduler status, stop-request state, ticket synthesis status, current plan snapshot summary, pending follow-up ticket discovery, and completion disposition.
- Preserve packet lineage per iteration, but reframe it around the governing plan and active ticket rather than generic run scope.
- Keep backward read compatibility for existing runs, but stop writing the old shape once the cutover lands.

Phase C — Implement plan-to-ticket orchestration truth.
- On start, inspect the plan’s linked tickets. If none exist, synthesize and sequence a ticket set from the governing plan and spec context. Persist exactly what was created and why.
- Define the ticket selection algorithm explicitly: choose the next runnable plan-linked ticket based on plan ordering, dependencies, state, and any accepted follow-up tickets introduced by prior iterations.
- Allow Ralph iterations to create new tickets mid-run when execution uncovers new bounded work, but require those tickets to be linked back into the governing plan so the completion graph remains truthful.
- Treat ticket lifecycle ownership as part of the iteration contract: each iteration must either advance the selected ticket toward closure, split it into explicit follow-up work, block it with durable evidence, or close it truthfully.
- Define completion as a plan-level truth condition: all linked tickets that remain in scope for the governing plan are closed, no newly created follow-up tickets remain open, no critique/verifier/manual gates remain unresolved, and the run has recorded an explicit final completion decision.

Phase D — Implement the asynchronous continuous loop.
- Replace the current manual per-call execution pattern with a managed async loop that repeatedly launches fresh session-runtime iterations until a terminal condition occurs.
- Keep each worker bounded and fresh-context, but let the parent Ralph loop re-enter automatically between iterations after inspecting durable state.
- Ensure only one canonical Ralph loop is active per workspace at a time. New start requests should either be rejected, routed to the existing run, or require explicit stop/archive first; pick one truth and enforce it consistently.
- Persist loop scheduler state durably enough that an interrupted parent process can be restarted without lying about whether the loop was running, waiting, stopping, or complete.
- Preserve background job control, but make the durable Ralph run the truth and the async job merely the current execution vehicle.

Phase E — Make steering durable and consumable.
- Add a durable steering queue or append-only steering ledger to Ralph state/artifacts.
- Expose operator steering as a first-class command/tool that records steering text, timestamps, authorship/source, and whether it has been consumed.
- At iteration launch time, fold unconsumed steering into packet context and mark it consumed only when the next iteration actually launches with it.
- Make stop requests the same kind of durable control input: recorded now, honored at the next safe loop boundary or current runtime cancellation point, and reflected truthfully in status.

Phase F — Rebuild packet and prompt assembly around plan + one ticket.
- The governing packet should include: constitutional brief, governing spec summary if present, governing plan summary and sequencing rationale, active ticket context and acceptance, unresolved critique/verifier obligations, recent relevant ticket-level learnings, and unconsumed operator steering.
- Remove equal-priority rendering of many unrelated refs. Supporting refs may still be visible, but the active ticket and governing plan/spec must dominate the execution packet.
- Make the worker launch prompt explicit that it owns the lifecycle of exactly one ticket this iteration and must update the ticket, Ralph checkpoint, verifier evidence, critique references, and any follow-up ticket creation truthfully before exiting.

Phase G — Centralize continuation and completion policy.
- After each checkpoint, derive the next loop state centrally from ticket state, verifier evidence, critique state, steering/stop requests, and policy snapshot rather than trusting worker intent alone.
- Distinguish loop-level decisions clearly: continue to next ticket, wait for review, stop requested, blocked on runtime failure, blocked on critique/verifier, complete plan objective, halt due to policy/runtime constraints.
- Ensure completion cannot be claimed merely because the current ticket closed. The plan-level ticket graph must be inspected every time.

Phase H — Production readiness polish.
- Simplify human UX and TUI status around the new control model: one active Ralph loop, current plan, active ticket, queue depth/open ticket counts, last checkpoint result, stop/steering state.
- Update README, prompt guidance, AGENTS-facing operational notes, and any rendered status language to match the actual single-loop plan-anchored behavior.
- Add migration/read-compat logic for runs created under the previous model so old state remains inspectable without keeping old write semantics alive.

## Validation and Acceptance

Validation must prove the new control model truthfully. Required evidence: command/tool tests showing start/stop/steer/status semantics; store/runtime tests proving a canonical run cannot start without a plan ref; tests proving governing spec context is inherited from the plan when available; tests proving ticket synthesis occurs when a started plan has no tickets; tests proving one iteration owns exactly one selected ticket lifecycle and can create/link follow-up tickets; tests proving the loop continues automatically across iterations until all in-scope linked tickets are closed; tests proving stop requests and steering are persisted durably and applied on the next iteration; tests proving only one active Ralph loop exists per workspace; tests proving completion requires all plan-linked tickets and follow-up tickets to be closed plus policy gates satisfied; runtime tests proving interrupted background execution can be resumed truthfully; README/prompt-guidance tests proving operator-facing language matches enforcement exactly. For verification commands, prefer isolated/focused Ralph package tests first, then typecheck and targeted lint/format checks, then any broader checks required by touched cross-package integration.

## Idempotence and Recovery

This follow-up changes Ralph from a manual bounded launcher into a managed asynchronous plan loop, so recovery semantics matter more. The loop must survive restarts without losing whether it was actively running, waiting for review, or waiting to consume steering/stop input. Stale or interrupted job state must not trick the system into believing work completed. Ticket synthesis must be idempotent: restarting a just-started run should not duplicate plan tickets. Steering entries must not be consumed twice. Stop requests must remain durable until observed. If background job supervision fails, the durable run should still say whether the loop is resumable, waiting, or halted. Older runs from the previous model must remain readable, but they should not masquerade as fully managed loops unless migrated explicitly.

## Artifacts and Notes

Primary artifacts for this phase are the Ralph run state, iteration records, runtime artifacts, scheduler/job state, steering records, rendered packets, dashboards, and the governing plan/ticket links. The most important discovery from the latest clarification is that the true anchor is the plan, not the spec and not a generic objective. The spec remains valuable but is subordinate to the plan in Ralph’s control model: the plan may bring a governing spec into context, but Ralph itself should reason and act through the plan’s ticket graph. Another key design discovery: now that the control model is singular, there is little value in multiple concurrent Ralph loops in one workspace; a single active loop makes steering, status, and recovery much more coherent.

## Interfaces and Dependencies

Primary touchpoints will now extend beyond `pi-ralph-wiggum` into plan and ticket integration behavior. Expected files include `packages/pi-ralph-wiggum/extensions/commands/ralph.ts`, `extensions/tools/ralph.ts`, `extensions/domain/models.ts`, `store.ts`, `loop.ts`, `runtime.ts`, `render.ts`, `ui/renderers.ts`, prompt guidance, README, and tests. Depending on how ticket synthesis/linkage is implemented, plan and ticket package domain APIs may need small additions or firmer use of existing plan-ticket linking methods. Constitutional and spec reads should remain read-only dependencies that feed packet context, not alternate execution ledgers.

## Linked Tickets

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- pl-0106 [closed] Ralph ticket-driven iteration checkpoints — implementation

## Risks and Open Questions

Primary risks: creating a hidden forever-loop that becomes hard to stop or reason about; allowing ticket synthesis to generate duplicate or low-quality ticket sets; making completion too optimistic by checking only current ticket state; and introducing brittle scheduler state that diverges from durable truth. Key open design questions to resolve before coding: Should `start` reject plans that are already linked to another active Ralph run, or automatically attach to that run? Should Ralph pick strictly the first runnable linked ticket by plan order, or may it reprioritize based on critique/verifier/blocker state? How exactly should follow-up tickets be linked and ordered inside the governing plan when created mid-run? What is the durable representation for steering—append-only journal entries, explicit queued records, or both? What exact state machine should define `stopping`, `idle-between-iterations`, `waiting-for-review`, and `running` so the async loop remains observable and restartable?

## Revision Notes

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- 2026-03-21T00:00:00Z — Created initial comprehensive Ralph realignment plan.
  Reason: User requested an extremely comprehensive backbone plan comparing current Ralph to the literature and Loom abstractions.

- 2026-03-22T06:44:03.163Z — Created durable workplan scaffold from workspace:..
  Reason: Establish a self-contained execution-strategy artifact that can be resumed without prior chat context.

- 2026-03-21T00:00:00Z — Created initial comprehensive Ralph realignment plan.
  Reason: User requested an extremely comprehensive backbone plan comparing current Ralph to the literature and Loom abstractions.

- 2026-03-21T00:10:00Z — Updated plan with runtime/store alignment findings.
  Reason: Runtime analysis clarified that the gap is central policy authority and packet lineage, not missing durable execution machinery.

- 2026-03-22T06:47:11.858Z — Updated title, status, summary, purpose, context and orientation, milestones, plan of work, concrete steps, validation, idempotence and recovery, artifacts and notes, interfaces and dependencies, risks and open questions, outcomes and retrospective, scope paths, source target, context refs, progress, surprises and discoveries, decision log, revision notes.
  Reason: Keep the workplan aligned with the current execution strategy and observable validation story.

- 2026-03-21T00:00:00Z — Created initial comprehensive Ralph realignment plan.
  Reason: User requested an extremely comprehensive backbone plan comparing current Ralph to the literature and Loom abstractions.

- 2026-03-21T00:10:00Z — Updated plan with runtime/store alignment findings.
  Reason: Runtime analysis clarified that the gap is central policy authority and packet lineage, not missing durable execution machinery.

- 2026-03-21T00:30:00Z — Reframed the workplan around the newly clarified end-state: one active plan-anchored asynchronous Ralph loop with start/stop/steer/status controls and plan-ticket completion truth.
  Reason: User clarified that Ralph should anchor to a plan, synthesize tickets if absent, keep looping asynchronously until the plan’s ticket graph is complete, and drop separate planning-mode runs.

- 2026-03-22T17:17:29.436Z — Updated title, status, summary, purpose, context and orientation, milestones, plan of work, concrete steps, validation, idempotence and recovery, artifacts and notes, interfaces and dependencies, risks and open questions, outcomes and retrospective, scope paths, source target, context refs, progress, surprises and discoveries, decision log, revision notes.
  Reason: Keep the workplan aligned with the current execution strategy and observable validation story.

- 2026-03-23T15:00:18.637Z — Linked ticket pl-0106 as implementation.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.
