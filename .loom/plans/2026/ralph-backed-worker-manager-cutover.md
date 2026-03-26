# Ralph-backed worker-manager cutover

## Purpose / Big Picture

Simplify the execution stack by making Ralph the canonical loop engine, keeping workers only for manager-owned coordination concerns, and replacing the prior dual execution state machines with one truthful hierarchy without backward-compatibility baggage or unnecessary live-execution complexity.

## Progress

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- [x] (2026-03-20T00:00:00Z) Reviewed constitutional constraints, existing worker/manager and Ralph specs, and current package implementations to derive the Ralph-backed worker cutover direction.
- [x] (2026-03-20T00:10:00Z) Refined the plan with the concrete Ralph execution-attempt model, worker-over-Ralph contract, and explicit deletion/cutover targets informed by focused package analysis.
- [x] (2026-03-20T01:50:00Z) Incorporated the internal-only full-cutover constraint: preserve SQLite-backed Loom state, but do not preserve obsolete worker/runtime APIs for compatibility.
- [x] (2026-03-20T02:00:00Z) Simplified the plan around inter-iteration orchestration: Ralph executes one bounded iteration, persists useful SQLite state, exits, and manager decides the next move between iterations.
- [x] (2026-03-20T02:20:00Z) Refined the boundary so Pi Ralph remains standalone in its own user-facing terminology even when higher-level manager orchestration builds on top of it.
- [x] (2026-03-20T02:35:00Z) Implemented the cutover across `pi-ralph` and `pi-workers`, updated tests and guidance, and verified 58 focused tests passing across both packages.
- [x] (2026-03-20T02:50:00Z) Removed the leftover worker-side SDK/RPC helper code and runtime-selection remnants, then re-ran the focused worker suite successfully.
- [x] (2026-03-20T07:50:00Z) Removed all non-ticket slash commands and identified the next usability gap: AI-direct Ralph loop invocation and a future human `/ralph xN <prompt>` surface.

Linked ticket snapshot from the live execution ledger:
- [x] Ticket pl-0072 — Refactor Ralph for single-iteration manager supervision (Ralph substrate refactor)
- [x] Ticket pl-0073 — Rebase workers and manager control on Ralph-backed iterations (Worker and manager cutover)
- [x] Ticket pl-0074 — Validate and document the Ralph-backed worker cutover (Verification and docs alignment)

## Surprises & Discoveries

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Observation: pi-workers previously duplicated execution-loop concerns that Ralph already modeled, including launch lifecycle, runtime branching, and scheduler-owned resume flow.
  Evidence: packages/pi-workers/extensions/domain/store.ts; packages/pi-workers/extensions/domain/runtime.ts; packages/pi-ralph/extensions/domain/store.ts

- Observation: A simple post-iteration checkpoint plus next-launch contract was sufficient for inter-iteration orchestration; live attempt tracking was unnecessary for the target model.
  Evidence: Implemented `postIteration` and `nextLaunch`-centric Ralph contract plus focused test verification on 2026-03-20

- Observation: Pi Ralph needed explicit standalone wording to avoid leaking higher-layer manager abstraction language into direct Ralph usage.
  Evidence: Updated `packages/pi-ralph/extensions/domain/{render,store}.ts`, `packages/pi-ralph/extensions/tools/ralph.ts`, `packages/pi-ralph/README.md`, and base prompt guidance on 2026-03-20

- Observation: The first cutover pass still left dead worker-side SDK/RPC scaffolding in commands, helper code, and tests; those remnants were removable without affecting the Ralph-backed model.
  Evidence: Follow-up cleanup on 2026-03-20 removed SDK session helper code, runtime-selection command args, and stale tests from `packages/pi-workers`.

- Observation: With the architecture cleaned up, the next weakness is interface ergonomics: AI-direct Ralph use still depends on callers inferring the intended loop from several low-level tools.
  Evidence: Review of `packages/pi-ralph/extensions/tools/ralph.ts`, `renderLaunchPrompt`, and current AI usage expectations on 2026-03-20

## Decision Log

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Decision: Use Ralph as the canonical loop lifecycle and execution substrate beneath workers rather than maintaining two peer execution state machines.
  Rationale: This matches the desired operating model, aligns with constitutional boundary doctrine, and removes duplicated runtime logic.
  Date/Author: 2026-03-20 / assistant

- Decision: Keep manager supervision inter-iteration only: Ralph runs once, persists SQLite state, exits, and the manager decides the next step from durable state.
  Rationale: This is the simplest model that preserves resumability and steerability without introducing live-execution monitoring complexity.
  Date/Author: 2026-03-20 / assistant

- Decision: Keep Pi Ralph standalone in its own terminology and user-facing surfaces even when higher-level orchestration layers are built on top of it.
  Rationale: Ralph must remain directly usable by a human or AI caller outside the autonomous worker-manager abstraction, so higher-layer wording should not leak into the Ralph package.
  Date/Author: 2026-03-20 / assistant

- Decision: Remove the remaining worker-side SDK/RPC scaffolding instead of tolerating dead compatibility leftovers after the cutover.
  Rationale: The internal-only full-cutover model values one truthful runtime path over retaining dead code that suggests alternate worker runtimes still matter.
  Date/Author: 2026-03-20 / assistant

- Decision: Treat AI-direct Ralph ergonomics and the future human `/ralph xN <prompt>` surface as a follow-up interface problem on top of the now-correct bounded subprocess model.
  Rationale: The architecture is now coherent; the remaining issue is making the intended loop obvious and pleasant to invoke without changing the underlying durable-state semantics.
  Date/Author: 2026-03-20 / assistant

## Outcomes & Retrospective

The execution stack is now coherent. The remaining gap is not architectural truth but interface ergonomics: direct AI use of Ralph still relies on callers understanding the loop pattern more than the current tool docs explicitly teach. That can now be improved from a much cleaner base.

## Context and Orientation

Pi Loom's constitution requires tickets to remain the live execution ledger, manager to remain a role rather than a new memory layer, and Ralph to stay bounded instead of becoming a general workflow engine. The implemented cutover now follows that boundary more truthfully: workers wrap linked Ralph runs, Ralph performs one bounded iteration and persists post-iteration state, and higher-level orchestration happens between iterations from durable state rather than from a parallel worker runtime model. Pi Ralph remains standalone in its own wording and feature set so humans and AI can invoke it directly outside the worker/manager abstraction. Pi Loom remains an internal-only toolset, so this landed as a full cutover while preserving canonical SQLite-backed Loom state. A remaining follow-up is improving AI-direct Ralph ergonomics so the intended `write/create -> launch or resume one bounded iteration -> inspect durable state -> repeat` pattern is explicit or better encapsulated.

## Projection Context

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Status: completed
- Source target: research:ralph-backed-worker-manager-architecture-cutover
- Scope paths: https-github-com-z3z1ma-pi-loom-git:packages/pi-ralph, https-github-com-z3z1ma-pi-loom-git:packages/pi-workers
- Roadmap: item-003
- Research: ralph-backed-worker-manager-architecture-cutover
- Specs: add-inbox-driven-manager-worker-control-plane, add-ralph-loop-orchestration-extension, add-workspace-backed-manager-worker-substrate
- Tickets: pl-0072, pl-0073, pl-0074, pl-0075

## Milestones

1. Architecture cutover contract settled: revised research/spec direction defines workers as Ralph-backed manager abstractions, manager intervention as inter-iteration orchestration, Ralph as a standalone single-iteration feature set, and identifies fields/tool surfaces to delete.
2. Ralph iteration output hardened: Ralph emits the useful post-iteration SQLite state the orchestrating layer needs to inspect and steer the next iteration, without leaking manager terminology into Ralph itself.
3. Worker runtime collapsed: worker launch/resume path delegates to Ralph-backed execution in isolated git worktrees; duplicate SDK/subprocess/RPC worker runtime logic and direct worktree orchestration were removed or repurposed.
4. Manager inter-iteration watchdog loop added: manager creates worktrees, invokes Ralph, reads compact worker+Ralph durable state between iterations, and handles steering, escalation, approval, consolidation, and additional worker creation.
5. End-to-end proof: manager can create workers, run Ralph-backed iterations to completion across worktrees, merge accepted work, and leave durable final state.
6. Follow-up ergonomic gap identified: AI-direct Ralph loop invocation still needs clearer guidance or a higher-level tool, and a future human `/ralph xN <prompt>` surface should be purpose-built rather than a thin wrapper.

## Plan of Work

Completed cutover work remains as previously recorded. New follow-up direction: improve direct Ralph ergonomics without changing the bounded subprocess model. The AI-facing surface should either teach the loop explicitly or expose a higher-level loop primitive, and a future human slash command should initialize run state from the prompt plus conversational context and drive N bounded iterations under the hood.

## Concrete Steps

Completed work remains as previously recorded. Follow-up steps to pursue later:
1. Decide whether to solve AI-direct Ralph ergonomics with better tool guidance or a higher-level loop tool.
2. If guidance-first, update Ralph tool descriptions and base prompt guidance so the intended create/update -> launch/resume -> read/dashboard -> decide -> repeat pattern is explicit to AI callers.
3. If abstraction-first, design a higher-level AI-facing Ralph loop tool that runs bounded subprocess iterations repeatedly while preserving the same durable state model.
4. Design a future human-facing `/ralph xN <prompt>` slash command that builds initial run state from the supplied prompt plus current conversational context, then runs N bounded fresh-context iterations before returning.
5. Keep both improvements faithful to the same durable intermediate-state model rather than introducing a second loop architecture.

## Validation and Acceptance

Already completed for the cutover itself. Follow-up validation should ensure an AI caller can truthfully discover and use the intended Ralph loop sequence without hidden tribal knowledge, and later that a human-facing `/ralph xN <prompt>` surface behaves as a purpose-built bounded loop launcher rather than a thin wrapper over low-level tools.

## Idempotence and Recovery

The bounded subprocess model remains the same: each iteration persists durable state before exit, and the next step is chosen from that state. Ergonomic improvements should not change the underlying recovery model; they should only make the intended loop easier and more obvious to invoke.

## Artifacts and Notes

See the completed cutover artifacts plus research record `ralph-backed-worker-manager-architecture-cutover`. Future ergonomic work should attach to the Ralph tool and slash-command layer rather than re-opening the worker/runtime substrate design.

## Interfaces and Dependencies

The canonical interface remains single-iteration Ralph execution with durable post-iteration state. Any higher-level AI tool or human slash command should compose that primitive rather than bypass it.

## Linked Tickets

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- pl-0072 [closed] Refactor Ralph for single-iteration manager supervision — Ralph substrate refactor
- pl-0073 [closed] Rebase workers and manager control on Ralph-backed iterations — Worker and manager cutover
- pl-0074 [closed] Validate and document the Ralph-backed worker cutover — Verification and docs alignment

## Risks and Open Questions

The main follow-up risk is leaving Ralph ergonomics implicit enough that AI callers do not naturally use the bounded loop correctly. The main design choice is whether to solve that with better guidance or a higher-level tool abstraction. A future human `/ralph xN <prompt>` surface should remain purpose-built and human-optimized, not a thin wrapper over the current low-level sequence.

## Revision Notes

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- 2026-03-20T00:00:00Z — Created initial cutover plan from current code and durable context.
  Reason: User requested a concrete architecture and migration plan for simplifying pi-workers around Ralph.

- 2026-03-20T05:40:57.696Z — Created durable workplan scaffold from research:ralph-backed-worker-manager-architecture-cutover.
  Reason: Establish a self-contained execution-strategy artifact that can be resumed without prior chat context.

- 2026-03-20T00:00:00Z — Created initial cutover plan from current code and durable context.
  Reason: User requested a concrete architecture and migration plan for simplifying pi-workers around Ralph.

- 2026-03-20T00:10:00Z — Refined the plan with an explicit Ralph execution-attempt model and worker-over-Ralph contract.
  Reason: Focused package analysis showed the precise missing state and the most likely deletion targets.

- 2026-03-20T05:45:46.213Z — Updated title, status, summary, purpose, context and orientation, milestones, plan of work, concrete steps, validation, idempotence and recovery, artifacts and notes, interfaces and dependencies, risks and open questions, outcomes and retrospective, scope paths, source target, context refs, progress, surprises and discoveries, decision log, revision notes.
  Reason: Keep the workplan aligned with the current execution strategy and observable validation story.

- 2026-03-20T00:00:00Z — Created initial cutover plan from current code and durable context.
  Reason: User requested a concrete architecture and migration plan for simplifying pi-workers around Ralph.

- 2026-03-20T00:10:00Z — Refined the plan with an explicit Ralph execution-attempt model and worker-over-Ralph contract.
  Reason: Focused package analysis showed the precise missing state and the most likely deletion targets.

- 2026-03-20T01:50:00Z — Updated the plan to treat backward compatibility as out of scope and SQLite-backed durable state preservation as the only non-negotiable migration boundary.
  Reason: User clarified that Pi Loom is an internal-only toolset and wants a rip-and-replace cutover if the database remains sound.

- 2026-03-20T06:13:44.377Z — Updated title, status, summary, purpose, context and orientation, milestones, plan of work, concrete steps, validation, idempotence and recovery, artifacts and notes, interfaces and dependencies, risks and open questions, outcomes and retrospective, scope paths, source target, context refs, progress, surprises and discoveries, decision log, revision notes.
  Reason: Keep the workplan aligned with the current execution strategy and observable validation story.

- 2026-03-20T00:00:00Z — Created initial cutover plan from current code and durable context.
  Reason: User requested a concrete architecture and migration plan for simplifying pi-workers around Ralph.

- 2026-03-20T00:10:00Z — Refined the plan with an explicit Ralph execution-attempt model and worker-over-Ralph contract.
  Reason: Focused package analysis showed the precise missing state and the most likely deletion targets.

- 2026-03-20T01:50:00Z — Updated the plan to treat backward compatibility as out of scope and SQLite-backed durable state preservation as the only non-negotiable migration boundary.
  Reason: User clarified that Pi Loom is an internal-only toolset and wants a rip-and-replace cutover if the database remains sound.

- 2026-03-20T02:00:00Z — Removed overengineered intra-iteration execution-control ideas and simplified the architecture around post-iteration SQLite updates plus manager decisions between Ralph iterations.
  Reason: User clarified that the value lies in single-iteration Ralph runs, resumability, steerability between iterations, and higher-level orchestration over worktrees.

- 2026-03-20T06:20:44.291Z — Updated title, status, summary, purpose, context and orientation, milestones, plan of work, concrete steps, validation, idempotence and recovery, artifacts and notes, interfaces and dependencies, risks and open questions, outcomes and retrospective, scope paths, source target, context refs, progress, surprises and discoveries, decision log, revision notes.
  Reason: Keep the workplan aligned with the current execution strategy and observable validation story.

- 2026-03-20T06:26:48.358Z — Linked ticket pl-0072 as Ralph substrate refactor.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-20T06:26:55.519Z — Linked ticket pl-0073 as Worker and manager cutover.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-20T06:27:03.502Z — Linked ticket pl-0074 as Verification and docs alignment.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-20T00:00:00Z — Created initial cutover plan from current code and durable context.
  Reason: User requested a concrete architecture and migration plan for simplifying pi-workers around Ralph.

- 2026-03-20T00:10:00Z — Refined the plan with an explicit Ralph execution-attempt model and worker-over-Ralph contract.
  Reason: Focused package analysis showed the precise missing state and the most likely deletion targets.

- 2026-03-20T01:50:00Z — Updated the plan to treat backward compatibility as out of scope and SQLite-backed durable state preservation as the only non-negotiable migration boundary.
  Reason: User clarified that Pi Loom is an internal-only toolset and wants a rip-and-replace cutover if the database remains sound.

- 2026-03-20T02:00:00Z — Removed overengineered intra-iteration execution-control ideas and simplified the architecture around post-iteration SQLite updates plus manager decisions between Ralph iterations.
  Reason: User clarified that the value lies in single-iteration Ralph runs, resumability, steerability between iterations, and higher-level orchestration over worktrees.

- 2026-03-20T02:20:00Z — Clarified that Pi Ralph must stay independently usable and should not adopt manager terminology in its own user-facing surfaces.
  Reason: User noted that humans and AI may invoke Pi Ralph directly, so higher-layer abstraction wording would be leaky.

- 2026-03-20T06:42:40.329Z — Updated title, status, summary, purpose, context and orientation, milestones, plan of work, concrete steps, validation, idempotence and recovery, artifacts and notes, interfaces and dependencies, risks and open questions, outcomes and retrospective, scope paths, source target, context refs, progress, surprises and discoveries, decision log, revision notes.
  Reason: Keep the workplan aligned with the current execution strategy and observable validation story.

- 2026-03-20T00:00:00Z — Created initial cutover plan from current code and durable context.
  Reason: User requested a concrete architecture and migration plan for simplifying pi-workers around Ralph.

- 2026-03-20T00:10:00Z — Refined the plan with an explicit Ralph execution-attempt model and worker-over-Ralph contract.
  Reason: Focused package analysis showed the precise missing state and the most likely deletion targets.

- 2026-03-20T01:50:00Z — Updated the plan to treat backward compatibility as out of scope and SQLite-backed durable state preservation as the only non-negotiable migration boundary.
  Reason: User clarified that Pi Loom is an internal-only toolset and wants a rip-and-replace cutover if the database remains sound.

- 2026-03-20T02:00:00Z — Removed overengineered intra-iteration execution-control ideas and simplified the architecture around post-iteration SQLite updates plus manager decisions between Ralph iterations.
  Reason: User clarified that the value lies in single-iteration Ralph runs, resumability, steerability between iterations, and higher-level orchestration over worktrees.

- 2026-03-20T02:20:00Z — Clarified that Pi Ralph must stay independently usable and should not adopt manager terminology in its own user-facing surfaces.
  Reason: User noted that humans and AI may invoke Pi Ralph directly, so higher-layer abstraction wording would be leaky.

- 2026-03-20T02:35:00Z — Marked the cutover completed after implementation, test alignment, prompt/readme updates, and focused verification across Ralph and worker packages.
  Reason: The planned execution tickets were completed and the focused test suite passed.

- 2026-03-20T07:19:14.202Z — Updated title, status, summary, purpose, context and orientation, milestones, plan of work, concrete steps, validation, idempotence and recovery, artifacts and notes, interfaces and dependencies, risks and open questions, outcomes and retrospective, scope paths, source target, context refs, progress, surprises and discoveries, decision log, revision notes.
  Reason: Keep the workplan aligned with the current execution strategy and observable validation story.

- 2026-03-20T00:00:00Z — Created initial cutover plan from current code and durable context.
  Reason: User requested a concrete architecture and migration plan for simplifying pi-workers around Ralph.

- 2026-03-20T00:10:00Z — Refined the plan with an explicit Ralph execution-attempt model and worker-over-Ralph contract.
  Reason: Focused package analysis showed the precise missing state and the most likely deletion targets.

- 2026-03-20T01:50:00Z — Updated the plan to treat backward compatibility as out of scope and SQLite-backed durable state preservation as the only non-negotiable migration boundary.
  Reason: User clarified that Pi Loom is an internal-only toolset and wants a rip-and-replace cutover if the database remains sound.

- 2026-03-20T02:00:00Z — Removed overengineered intra-iteration execution-control ideas and simplified the architecture around post-iteration SQLite updates plus manager decisions between Ralph iterations.
  Reason: User clarified that the value lies in single-iteration Ralph runs, resumability, steerability between iterations, and higher-level orchestration over worktrees.

- 2026-03-20T02:20:00Z — Clarified that Pi Ralph must stay independently usable and should not adopt manager terminology in its own user-facing surfaces.
  Reason: User noted that humans and AI may invoke Pi Ralph directly, so higher-layer abstraction wording would be leaky.

- 2026-03-20T02:35:00Z — Marked the cutover completed after implementation, test alignment, prompt/readme updates, and focused verification across Ralph and worker packages.
  Reason: The planned execution tickets were completed and the focused test suite passed.

- 2026-03-20T02:50:00Z — Recorded the final removal of dead worker-side SDK/RPC remnants and the follow-up focused worker verification.
  Reason: User noticed the first cutover pass still left more code than necessary, particularly around the old worker runtime branches.

- 2026-03-20T07:31:56.548Z — Updated title, status, summary, purpose, context and orientation, milestones, plan of work, concrete steps, validation, idempotence and recovery, artifacts and notes, interfaces and dependencies, risks and open questions, outcomes and retrospective, scope paths, source target, context refs, progress, surprises and discoveries, decision log, revision notes.
  Reason: Keep the workplan aligned with the current execution strategy and observable validation story.

- 2026-03-20T00:00:00Z — Created initial cutover plan from current code and durable context.
  Reason: User requested a concrete architecture and migration plan for simplifying pi-workers around Ralph.

- 2026-03-20T00:10:00Z — Refined the plan with an explicit Ralph execution-attempt model and worker-over-Ralph contract.
  Reason: Focused package analysis showed the precise missing state and the most likely deletion targets.

- 2026-03-20T01:50:00Z — Updated the plan to treat backward compatibility as out of scope and SQLite-backed durable state preservation as the only non-negotiable migration boundary.
  Reason: User clarified that Pi Loom is an internal-only toolset and wants a rip-and-replace cutover if the database remains sound.

- 2026-03-20T02:00:00Z — Removed overengineered intra-iteration execution-control ideas and simplified the architecture around post-iteration SQLite updates plus manager decisions between Ralph iterations.
  Reason: User clarified that the value lies in single-iteration Ralph runs, resumability, steerability between iterations, and higher-level orchestration over worktrees.

- 2026-03-20T02:20:00Z — Clarified that Pi Ralph must stay independently usable and should not adopt manager terminology in its own user-facing surfaces.
  Reason: User noted that humans and AI may invoke Pi Ralph directly, so higher-layer abstraction wording would be leaky.

- 2026-03-20T02:35:00Z — Marked the cutover completed after implementation, test alignment, prompt/readme updates, and focused verification across Ralph and worker packages.
  Reason: The planned execution tickets were completed and the focused test suite passed.

- 2026-03-20T02:50:00Z — Recorded the final removal of dead worker-side SDK/RPC remnants and the follow-up focused worker verification.
  Reason: User noticed the first cutover pass still left more code than necessary, particularly around the old worker runtime branches.

- 2026-03-20T07:50:00Z — Recorded the next follow-up as an interface ergonomics problem: make AI-direct Ralph loop usage explicit or higher-level, and later add a purpose-built human `/ralph xN <prompt>` surface.
  Reason: User clarified the desired direct-AI and future human interaction models for Ralph after the slash-command cleanup.

- 2026-03-20T08:12:10.869Z — Updated title, status, summary, purpose, context and orientation, milestones, plan of work, concrete steps, validation, idempotence and recovery, artifacts and notes, interfaces and dependencies, risks and open questions, outcomes and retrospective, scope paths, source target, context refs, progress, surprises and discoveries, decision log, revision notes.
  Reason: Keep the workplan aligned with the current execution strategy and observable validation story.
