# Ticket workspace UI revamp

## Purpose / Big Picture

Revamp `/ticket open home` from a flat textual action list into a focused, visually rich, keyboard-first ticket workbench that feels comparable to Pi settings and pi-subagents: strong hierarchy, tabs, fast navigation, drill-in detail, bounded editing flows, and overlay presentation without inventing a shadow state model.

## Progress

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- [x] (2026-03-17T00:00:00Z) Compared current ticket workspace with pi-mono settings, oh-my-pi tabbed settings, and pi-subagents overlay manager patterns.
- [x] (2026-03-17T00:00:00Z) Chose centered overlay plus internal multi-screen state machine as the preferred first implementation target.
- [x] (2026-03-17T19:32:54Z) Finalized spec `revamp-ticket-workspace-into-an-overlay-workbench-ux` and projected the rollout tickets `pl-0059` through `pl-0062`.
- [x] (2026-03-17T20:10:02Z) Implemented the overlay workbench shell, tabbed surfaces, contextual actions, README updates, and direct dependency declaration for `@mariozechner/pi-tui`.
- [x] (2026-03-17T20:10:35Z) Ran the critique cycle, fixed the three reported correctness issues, added regression tests, and resolved the critique with a passing verdict.

Linked ticket snapshot from the live execution ledger:
- [x] Ticket pl-0059 — Build the ticket workbench shell and view model (shell-and-view-model)
- [x] Ticket pl-0060 — Implement tabbed overview inbox board timeline and detail surfaces (tabbed-surfaces)
- [x] Ticket pl-0061 — Move ticket mutations into contextual actions and bounded editors (contextual-operations)
- [x] Ticket pl-0062 — Preserve command semantics fallback behavior and package truth (fallback-docs-and-verification)

## Surprises & Discoveries

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Observation: The biggest deficiency was architectural: the prior ticket UI was a text renderer plus action list, not a focused workspace container.
  Evidence: packages/pi-ticketing/extensions/ui/ticket-workspace.ts before the revamp

- Observation: Existing Pi UIs already provided the primitives needed for a better experience: selector containers, tab bars, submenus, and overlay shells.
  Evidence: .agents/resources/pi-mono/packages/coding-agent/src/modes/interactive/components/settings-selector.ts; .agents/resources/oh-my-pi/packages/tui/src/components/tab-bar.ts; .agents/resources/pi-subagents/index.ts

- Observation: Critique surfaced three subtle but important state bugs that were easy to miss during implementation: wrong-ticket detail targeting, endless failed-detail loading, and incorrect closed-ticket status actions when detail data was unavailable.
  Evidence: critique-ticket-workbench-revamp run-001 and findings finding-001..003

## Decision Log

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Decision: Model the ticket revamp on the Pi settings and pi-subagents interaction architecture rather than iterating on the current line-oriented renderer.
  Rationale: That architecture introduces bounded focus, tabs, drill-in navigation, and clean close behavior while preserving keyboard-first usage.
  Date/Author: 2026-03-17 / assistant

- Decision: Default the first implementation to a centered overlay workbench with an internal multi-screen state machine.
  Rationale: This matches the clearest source-backed analogs in pi-subagents and works well with the tabbed selector patterns seen in pi-mono and oh-my-pi settings.
  Date/Author: 2026-03-17 / assistant

- Decision: Add dedicated regression tests for critique-found state bugs instead of relying only on the existing command-loop tests.
  Rationale: The initial command tests covered happy-path command semantics but not the workbench's internal tab/detail/error-state transitions.
  Date/Author: 2026-03-17 / assistant

## Outcomes & Retrospective

`/ticket` now behaves like a bounded human workspace instead of a text report with an appended action menu. The most important lesson was architectural, not aesthetic: once the shell/state model was correct, tabs, contextual actions, and truthful fallbacks all became easier to reason about. The critique cycle paid for itself by surfacing subtle but real state bugs that would have made the workbench untrustworthy if shipped unchallenged.

## Context and Orientation

Current state: `packages/pi-ticketing/extensions/ui/ticket-workspace.ts` now opens a centered overlay ticket workbench instead of rendering every interactive view as strings plus a long vertical action list. `packages/pi-ticketing/extensions/commands/ticket.ts` still preserves the existing `/ticket` verb surface and non-UI fallbacks, but UI-capable runtimes now route through a bounded shell with tabs, preview panels, contextual menus, and detail drill-in. Reference evidence from `.agents/resources/pi-mono` and `.agents/resources/oh-my-pi` informed the selector-style tab/navigation model, while `.agents/resources/pi-subagents` informed the centered overlay and internal multi-screen shell approach.

## Projection Context

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Status: completed
- Source target: workspace:pi-loom
- Scope paths: https-github-com-z3z1ma-pi-loom-git:package.json, https-github-com-z3z1ma-pi-loom-git:packages/pi-ticketing/__tests__, https-github-com-z3z1ma-pi-loom-git:packages/pi-ticketing/extensions/commands/ticket.ts, https-github-com-z3z1ma-pi-loom-git:packages/pi-ticketing/extensions/ui/ticket-workbench-model.ts, https-github-com-z3z1ma-pi-loom-git:packages/pi-ticketing/extensions/ui/ticket-workspace.ts, https-github-com-z3z1ma-pi-loom-git:packages/pi-ticketing/README.md
- Research: ticket-workspace-ui-revamp-reference-study
- Specs: revamp-ticket-workspace-into-an-overlay-workbench-ux
- Tickets: pl-0059, pl-0060, pl-0061, pl-0062
- Critiques: critique-ticket-workbench-revamp

## Milestones

1. Define the shell contract and interaction model for a new ticket workbench.
2. Build a reusable componentized shell with tabs, panels, and centered-overlay entry.
3. Port core ticket surfaces (overview, inbox/review, board/list, timeline, detail) onto the new shell.
4. Bring create/edit/status/dependency flows into bounded subviews or submenus.
5. Polish keyboard help, responsive layout behavior, widget summary, fallback parity, and critique-driven regressions.

## Plan of Work

Use a shell-first approach rather than repainting the current string renderer. First isolate data shaping into explicit workspace view-model helpers so the UI can render meaningful cards and panels. Then build a stateful workbench component that owns route-like screen state, tab selection, list focus, and drill-in detail. Default to centered overlay presentation when the runtime supports overlay options, with adaptive fallback to editor-area custom rendering if overlay support is absent. Preserve no-UI textual views. Once the shell exists, migrate each ticket surface to it, move mutations into contextual menus, and delete the old action-list-driven interaction model rather than running two UI architectures in parallel.

## Concrete Steps

1. Introduced `packages/pi-ticketing/extensions/ui/ticket-workbench-model.ts` for counts, lane groupings, recent activity, and shared view-model logic.
2. Replaced the old `openInteractiveTicketWorkspace()` implementation with a centered-overlay workbench shell that renders tabs, preview panels, detail drill-in, and bounded menus.
3. Implemented Overview, Inbox, List, Board, Timeline, and Detail surfaces with keyboard navigation and review-focused inbox filtering.
4. Moved create/status/dependency/edit flows into contextual menus while keeping long-form editing routed through the existing command/editor flow.
5. Preserved `/ticket open detail <ref> ...` semantics and non-UI textual fallbacks.
6. Updated README and tests, then added critique-driven regression tests for tab-to-detail selection, failed detail loads, and closed-ticket reopen actions when detail is unavailable.

## Validation and Acceptance

- `npx vitest run packages/pi-ticketing/__tests__` passed after the implementation and critique fixes.
- `npx biome check packages/pi-ticketing/extensions/ui/ticket-workbench-model.ts packages/pi-ticketing/extensions/ui/ticket-workspace.ts packages/pi-ticketing/extensions/commands/ticket.ts packages/pi-ticketing/__tests__/commands.test.ts packages/pi-ticketing/__tests__/ticket-workspace.test.ts packages/pi-ticketing/README.md package.json` passed.
- The critique cycle `critique-ticket-workbench-revamp` initially found three correctness issues, all of which were fixed and covered by regression tests before the critique was resolved with a passing verdict.

## Idempotence and Recovery

The revamp landed behind the existing `/ticket` verbs, so rollback remains localized to the ticket UI module if needed. The shell still renders truthful textual fallbacks when custom UI is unavailable, and no durable ticket data model changes were required. The critique record captures the edge cases that mattered during implementation so future edits can re-verify them directly.

## Artifacts and Notes

Primary code paths: `packages/pi-ticketing/extensions/ui/ticket-workbench-model.ts`, `packages/pi-ticketing/extensions/ui/ticket-workspace.ts`, `packages/pi-ticketing/extensions/commands/ticket.ts`, `packages/pi-ticketing/__tests__/commands.test.ts`, `packages/pi-ticketing/__tests__/ticket-workspace.test.ts`, and `packages/pi-ticketing/README.md`. Reference research is stored in `ticket-workspace-ui-revamp-reference-study`. The critique packet is `critique-ticket-workbench-revamp`.

## Interfaces and Dependencies

The implementation continues to depend on `TicketStore` read/list/graph APIs and `ctx.ui.custom` presentation, now with a direct `@mariozechner/pi-tui` dependency declared in the workspace manifest for width/ANSI helpers. Navigation semantics align with local Pi conventions: Tab or Left/Right for tabs, Up/Down within lists, Enter to drill in, Esc to back/close, visible key hints, contextual descriptions for the selected item, and deterministic focus restoration.

## Linked Tickets

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- pl-0059 [closed] Build the ticket workbench shell and view model — shell-and-view-model
- pl-0060 [closed] Implement tabbed overview inbox board timeline and detail surfaces — tabbed-surfaces
- pl-0061 [closed] Move ticket mutations into contextual actions and bounded editors — contextual-operations
- pl-0062 [closed] Preserve command semantics fallback behavior and package truth — fallback-docs-and-verification

## Risks and Open Questions

Primary risks during implementation were overbuilding visuals without improving flow, keeping the old action-list model alive in parallel, and mishandling detail-loading edge cases. The critique cycle materially reduced that risk by forcing fixes for wrong-ticket detail targeting, endless failed-detail loading, and incorrect closed-ticket status actions. Remaining open product question: whether a future shared framework should add a richer drawer-style presentation on top of the now-stable overlay workbench.

## Revision Notes

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- 2026-03-17T00:00:00Z — Created initial revamp plan from source-backed UI research.
  Reason: User requested an improvement plan for a complete /ticket UI overhaul.

- 2026-03-17T19:09:01.750Z — Created durable workplan scaffold from workspace:pi-loom.
  Reason: Establish a self-contained execution-strategy artifact that can be resumed without prior chat context.

- 2026-03-17T00:00:00Z — Created initial revamp plan from source-backed UI research.
  Reason: User requested an improvement plan for a complete /ticket UI overhaul.

- 2026-03-17T00:00:00Z — Refined the plan to prefer centered-overlay presentation and explicit selector-style tabbed navigation based on completed PI settings and pi-subagents evidence.
  Reason: The additional local source review reduced ambiguity about the best first implementation target.

- 2026-03-17T19:12:08.362Z — Updated title, status, summary, purpose, context and orientation, milestones, plan of work, concrete steps, validation, idempotence and recovery, artifacts and notes, interfaces and dependencies, risks and open questions, outcomes and retrospective, scope paths, source target, context refs, progress, surprises and discoveries, decision log, revision notes.
  Reason: Keep the workplan synchronized with the current execution strategy and observable validation story.

- 2026-03-17T19:35:17.208Z — Linked ticket pl-0062 as fallback-docs-and-verification.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-17T19:35:53.946Z — Linked ticket pl-0059 as shell-and-view-model.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-17T19:36:13.390Z — Linked ticket pl-0060 as tabbed-surfaces.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-17T19:36:40.305Z — Linked ticket pl-0061 as contextual-operations.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-17T19:09:01.750Z — Created durable workplan scaffold from workspace:pi-loom.
  Reason: Establish a self-contained execution-strategy artifact that can be resumed without prior chat context.

- 2026-03-17T19:12:08.362Z — Updated the plan to prefer centered-overlay presentation and explicit selector-style tabbed navigation based on completed PI settings and pi-subagents evidence.
  Reason: The additional local source review reduced ambiguity about the best first implementation target.

- 2026-03-17T19:35:53.946Z — Linked ticket pl-0059 as shell-and-view-model.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-17T19:36:13.390Z — Linked ticket pl-0060 as tabbed-surfaces.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-17T19:36:40.305Z — Linked ticket pl-0061 as contextual-operations.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-17T20:11:00Z — Marked the plan completed after implementation, regression coverage, and a resolved critique cycle.
  Reason: The ticket UI revamp shipped and the critique findings were fixed before handoff.

- 2026-03-17T20:13:13.576Z — Updated title, status, summary, purpose, context and orientation, milestones, plan of work, concrete steps, validation, idempotence and recovery, artifacts and notes, interfaces and dependencies, risks and open questions, outcomes and retrospective, scope paths, source target, context refs, progress, surprises and discoveries, decision log, revision notes.
  Reason: Keep the workplan synchronized with the current execution strategy and observable validation story.
