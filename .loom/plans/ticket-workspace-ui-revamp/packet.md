# Ticket workspace UI revamp Planning Packet



## Planning Target

Workspace planning target: pi-loom

## Current Plan Summary

Completed replacement of the old /ticket interactive action list UI with a centered overlay ticket workbench modeled on Pi settings and pi subagents patterns, including contextual actions, truthful fallbacks, regression tests, and a resolv…

## Workplan Authoring Requirements

- Write `plan.md` as a fully self-contained novice-facing guide. Assume the reader only has the current working tree plus this packet and the rendered workplan.
- Keep the sections `Progress`, `Surprises & Discoveries`, `Decision Log`, `Outcomes & Retrospective`, and `Revision Notes` truthful and current as the work evolves.
- Use plain language, define repository-specific terms when they first appear, and describe observable validation instead of merely naming code changes.
- Keep Loom integration explicit through source refs, scope paths, linked tickets, and neighboring context, while leaving live ticket status and acceptance detail in the linked tickets themselves.

## Planning Boundaries

- Keep `plan.md` deeply detailed at the execution-strategy layer; it should explain sequencing, rationale, risks, and validation without duplicating ticket-by-ticket live state.
- Use `pi-ticketing` to create, refine, or link tickets explicitly. Plans provide coordination context around those tickets, and linked tickets stay fully detailed and executable in their own right.
- Treat linked tickets as the live execution system of record for status, dependencies, verification, and checkpoints, and as self-contained units of work with their own acceptance criteria and execution context.
- Preserve truthful source refs, ticket roles, assumptions, risks, and validation intent so a fresh planner can resume from durable context.

## Linked Tickets

- t-0059 [in_progress] Build the ticket workbench shell and view model — shell-and-view-model
- t-0060 [blocked] Implement tabbed overview inbox board timeline and detail surfaces — tabbed-surfaces
- t-0061 [blocked] Move ticket mutations into contextual actions and bounded editors — contextual-operations
- t-0062 [blocked] Preserve command semantics fallback behavior and package truth — fallback-docs-and-verification

## Scope Paths

- package.json
- packages/pi-ticketing/__tests__
- packages/pi-ticketing/extensions/commands/ticket.ts
- packages/pi-ticketing/extensions/ui/ticket-workbench-model.ts
- packages/pi-ticketing/extensions/ui/ticket-workspace.ts
- packages/pi-ticketing/README.md

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

- ticket-workspace-ui-revamp-reference-study [synthesized] Ticket workspace UI revamp reference study — conclusions: A beautiful revamp can stay truthful to the ticket ledger by separating durable data access from a richer view-model layer rather than changing store semantics.; Pi settings provides the right navigation model: tabs for major ticket surfaces, focused lists within each tab, submenus/editors for mutations, and cancel behavior that returns focus cleanly.; pi-subagents provides the right container model: a centered overlay and a single internal state machine that owns list/detail/edit/task-input flows without dropping the user back into separate commands.; The best fit for /ticket is a modal-or-drawer workspace built as a dedicated component, not incremental decoration of renderTicketWorkspaceText().; The biggest gap is not color or copy; it is interaction architecture. The current ticket home is a flat text dump plus action list, while the reference UIs are stateful containers with strong information hierarchy and progressive disclosure.

## Specs

- revamp-ticket-workspace-into-an-overlay-workbench-ux [finalized] Revamp ticket workspace into an overlay workbench UX — reqs=9 tasks=4

## Tickets

- t-0059 [in_progress] Build the ticket workbench shell and view model — Build the new ticket workbench shell and supporting view-model layer that replaces the current string-rendered action-list UI for interactive `/ticket` flows.
- t-0060 [blocked] Implement tabbed overview inbox board timeline and detail surfaces — Implement tabbed overview, inbox, board, timeline, and detail surfaces inside the new ticket workbench so humans can navigate ticket work by question, not by one overloaded screen.
- t-0061 [blocked] Move ticket mutations into contextual actions and bounded editors — Move ticket creation and mutation flows into contextual workbench actions and bounded editors so the new shell is operationally complete instead of a read-only browser.
- t-0062 [blocked] Preserve command semantics fallback behavior and package truth — Preserve `/ticket` command truth, non-UI fallback behavior, README accuracy, and targeted verification so the overlay workbench lands as one coherent package contract.

## Critiques

- critique-ticket-workbench-revamp [resolved/pass] Critique ticket workbench revamp — open findings: 0

## Documentation

(none)
