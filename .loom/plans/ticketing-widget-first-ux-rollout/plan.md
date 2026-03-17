# Ticketing widget-first UX rollout

## Purpose / Big Picture
Implement the ticket subsystem as Pi Loom's first concrete widget-first human experience by translating the finalized ticketing UX spec into a bounded execution slice. The goal is not to add isolated UI flourishes; it is to replace command-first human interaction with a coherent ticket workspace built from a persistent home widget, focused views, direct ticket operations, and a truthful command cutover.

## Progress
- [x] 2026-03-17 06:16Z — Finalized `design-widget-first-ticketing-ux` and projected four execution tickets.
- [x] 2026-03-18 00:00Z — Implemented the persistent textual ticket home widget with ready, blocked, recent-change, and next-action slices plus truthful non-interactive fallback behavior.
- [x] 2026-03-18 00:01Z — Implemented interactive and textual list, board, timeline, and detail ticket workspace views with dependency-aware review flows.
- [x] 2026-03-18 00:02Z — Implemented direct ticket create/edit/status/dependency flows, explicit reopen support, and detail access to journal/checkpoint/attachment context.
- [x] 2026-03-18 00:03Z — Cut the human `/ticket` surface over to `open`, `create`, and `review`, updated README/tests, and verified the ticketing package with targeted Vitest coverage.

## Surprises & Discoveries
- Observation: The ticketing spec was not initially projection-ready because it lacked execution tasks and traceability, even though the interaction concept was already clear.
  Evidence: `.loom/specs/changes/design-widget-first-ticketing-ux/analysis.md` originally failed on missing tasks and requirement traceability.
- Observation: Once tasks were added, the ticketing spec naturally collapsed into a clean four-ticket sequence that already matches the right rollout order.
  Evidence: `.loom/specs/changes/design-widget-first-ticketing-ux/ticket-projection.json` maps task-001..004 to tickets `t-0055`..`t-0058` with straightforward dependencies.

## Decision Log
- Decision: Use ticketing as the first bounded widget-first subsystem rollout.
  Rationale: Ticketing has the clearest human mental model and the most concrete set of view shapes: list, board, timeline, and master-detail.
  Date/Author: 2026-03-17 / ChatGPT
- Decision: Sequence the rollout from orientation surface to focused views to direct operations to command cutover.
  Rationale: Command reduction is only truthful once the replacement paths are concrete and spec-bound.
  Date/Author: 2026-03-17 / ChatGPT

## Outcomes & Retrospective
Ticketing now behaves like a bounded pilot for the widget-first subsystem direction instead of a slash-command mirror. The rollout proved that the current runtime can support a truthful textual home widget plus richer `ctx.ui.custom(...)` focused views without inventing a shadow ticket model. It also exposed one concrete contract change needed at the ticketing layer itself: explicit reopen support, because closed tickets must return to the open ledger path cleanly when humans manage work directly from the workspace.

The remaining gap is runtime polish rather than product truth. Current widget mounting still favors textual summaries, so ticketing intentionally keeps the persistent home surface string-safe while using focused custom UI for deeper work. That keeps the subsystem honest today while leaving room for future shared widget-container improvements.

## Context and Orientation
Pi Loom currently exposes ticketing primarily through a slash-command-first surface, even though ticketing is the subsystem where human users most naturally expect visual backlog and workflow management. The finalized ticketing UX spec redefines the subsystem around a persistent home widget for orientation, focused `ctx.ui.custom(...)` views for dense interaction, direct CRUD-style ticket operations, and a reduced human command surface built around goals rather than tool names.

This plan wraps the four projected tickets that make that design execution-ready. It stays bounded to ticketing while carrying enough context that a future implementer can understand why the rollout is sequenced this way and how it fits the broader widget-first initiative.

## Milestones
1. Home surface milestone — define what the persistent ticket widget shows and how it degrades outside rich TUI mode.
2. View grammar milestone — define list, board, timeline, and master-detail views plus navigation transitions.
3. Direct operations milestone — define ticket creation, editing, status/dependency changes, and detail inspection flows.
4. Command cutover milestone — define the surviving human verbs and the exact `/ticket` path replacements.

## Plan of Work
Execute the four linked tickets in order. Start with the persistent home surface so the subsystem has a truthful orientation model before any deeper interaction is designed. Then define the focused views and navigation model, because the board, timeline, and detail shapes determine how users actually move through ticket work. After the view grammar exists, specify direct ticket operations so the subsystem is not merely a read-only dashboard. Finish with command cutover only after the replacement interaction paths are concrete enough to justify removing or collapsing current human `/ticket` subcommands.

This plan is intentionally spec-driven. If later execution reveals a shared-framework gap, update the framework spec explicitly instead of letting ticketing quietly fork the interaction model.

## Concrete Steps
- Complete `t-0055` and make the home widget contract explicit: ready work, blocked work, recent changes, next actions, and truthful RPC/headless fallback.
- Complete `t-0056` and define focused list, board, timeline, and master-detail flows, including how dependency context and real status transitions appear.
- Complete `t-0057` and define direct ticket operations: create, edit, close/reopen, dependency updates, assignment/priority/risk edits, and journal/checkpoint/artifact access.
- Complete `t-0058` and define which human-facing ticket verbs remain, which `/ticket` subcommands become obsolete, and how user actions trigger real agent work.
- Reassess whether the ticketing UX slice is implementation-ready or whether one more spec-level refinement is needed before coding tickets are created.

## Validation and Acceptance
This plan succeeds when a reviewer can read the completed ticket set and answer, without reconstructing chat context: what the persistent ticket widget shows; which focused ticket views exist and why; how direct ticket management works without raw command syntax; and which human-facing `/ticket` paths are replaced or retained. The final result must make implementation planning credible without inventing major new requirements midstream.

The rollout is not accepted merely because tickets exist. It is accepted when the tickets, taken together, provide a coherent and bounded contract for implementation.

## Idempotence and Recovery
Resume from the first incomplete linked ticket. Re-read the finalized ticketing spec and this plan before making new decisions if the work is resumed in a fresh session. If the ticketing spec changes materially, update this plan and the affected tickets instead of continuing from stale assumptions. Durable spec and ticket state outrank chat memory.

## Artifacts and Notes
Primary artifacts:
- `.loom/specs/changes/design-widget-first-ticketing-ux/`
- `.loom/specs/changes/define-widget-first-loom-subsystem-ux-framework/`
- `.loom/initiatives/widget-first-human-centric-loom-subsystem-ux/`
- `.loom/research/evaluate-pi-custom-widgets-for-loom-human-centric-ux/`
- `.loom/tickets/t-0055.md` through `.loom/tickets/t-0058.md`
- `.loom/plans/ticketing-widget-first-ux-rollout/packet.md`

Keep later implementation and review artifacts linked back to this plan so ticketing remains the canonical pilot for future subsystem UX migrations.

## Interfaces and Dependencies
Primary downstream implementation surface will eventually live in `packages/pi-ticketing/`, including its extension entrypoint, command surface, prompt guidance, and any new UI helpers. This rollout also depends on the shared widget UX framework because ticketing is intended to validate the common subsystem shell rather than invent a private pattern. The broader Pi widget capability is already covered by the linked research record and user guidance that oh-my-pi inherits pi capability.

The most important interface boundary is conceptual: ticketing UX may change drastically, but tickets remain the durable execution ledger and the machine-facing `ticket_*` tools remain distinct from the smaller human command surface.

## Linked Tickets
- t-0055 [closed] Design persistent ticket home surface — home-surface
- t-0056 [closed] Design list board timeline and detail flows — multi-view-navigation
- t-0057 [closed] Design direct ticket operations and editing — direct-operations
- t-0058 [closed] Design human command cutover for tickets — command-cutover

## Risks and Open Questions
Main risks:
- Ticketing could accidentally become a one-off UX snowflake instead of the first reusable subsystem pattern.
- Board or timeline semantics could drift away from real ticket ledger fields and misstate what the system knows.
- Command cutover could be specified too early, before the replacement widget and focused-view paths are concrete.

Open questions:
- How much of later implementation should live in persistent widget code versus focused custom UI helpers?
- Which `/ticket` verbs survive after cutover?
- Does ticketing reveal any missing shared-framework rule before the next subsystem rollout starts?

## Revision Notes
- 2026-03-17 06:18Z — Created the initial rollout plan from the finalized ticketing UX spec and projected tickets because the user requested a concrete plan plus the necessary tickets for the ticketing UX slice.
- 2026-03-18 00:04Z — Marked the rollout implemented after landing the widget-first `/ticket` command cutover, workspace views, direct operations, reopen support, README updates, and targeted ticketing-package verification.
