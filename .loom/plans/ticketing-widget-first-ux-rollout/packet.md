# Ticketing widget-first UX rollout Planning Packet

## Planning Target

design-widget-first-ticketing-ux [finalized] Design widget-first ticketing UX
Proposal: Define the human-facing ticketing experience around a persistent tickets home widget, richer list/board/timeline/master-detail views, and direct CRUD-style task management so ticket work is no longer mediated primarily through tool-mirroring slash commands.
Requirements: 5
Tasks: 4

## Current Plan Summary

This plan turns the finalized ticketing UX spec into a bounded four-ticket execution slice for the first subsystem-level widget-first rollout in Pi Loom. Ticketing is the pilot because it has the clearest human mental model and the most concrete view vocabulary.

## Planning Boundaries

- Keep ticketing bounded to the ticket subsystem; do not let this rollout silently redesign other Loom layers.
- Use the finalized ticketing UX spec as the contract and the shared framework spec as the interaction guardrail.
- Let linked tickets remain the live execution record; the plan supplies sequencing, rationale, and acceptance context.
- Preserve ticket-ledger truth: the UX may improve drastically, but tickets remain the durable execution ledger rather than a UI-only shadow model.
- Do not specify command cutover until the replacement widget and focused-view paths are concrete enough to support it truthfully.

## Linked Tickets

- t-0055 [open] Design persistent ticket home surface — home-surface
- t-0056 [open] Design list board timeline and detail flows — multi-view-navigation
- t-0057 [open] Design direct ticket operations and editing — direct-operations
- t-0058 [open] Design human command cutover for tickets — command-cutover

## Scope Paths

- packages/pi-ticketing
- packages/pi-ticketing/README.md
- README.md
- .loom/specs/changes/define-widget-first-loom-subsystem-ux-framework
- .loom/specs/changes/design-widget-first-ticketing-ux
- .loom/tickets
- .loom/plans/ticketing-widget-first-ux-rollout

## Constitutional Context

Project: Pi Loom
Strategic direction: (not yet established in constitutional memory)
Current focus: none recorded
Open constitutional questions: Capture the architectural and business constraints.; Capture the guiding decision principles.; Capture the strategic direction and roadmap.; Define the durable project vision.

## Roadmap Items

(none)

## Initiatives

- widget-first-human-centric-loom-subsystem-ux [active] Widget-first human-centric Loom subsystem UX — Redesign Pi Loom's human-facing subsystem entrypoints around persistent widgets, focused interactive views, and a smaller set of economic human commands so the product stops mirroring AI tools through slash commands and instead presents each Loom layer as a coherent interactive experience.

## Research

- evaluate-pi-custom-widgets-for-loom-human-centric-ux [synthesized] Evaluate Pi custom widgets for Loom human-centric UX — conclusions: Pi Loom currently has no widget usage in package sources; the available Pi widget model is strong enough for widget-first subsystem homes; widgets are best persistent state surfaces; `ctx.ui.custom(...)` remains the deep interaction surface; and `pi.sendUserMessage(...)` is the cleanest bridge from human-centric verbs into agent work.

## Specs

- define-widget-first-loom-subsystem-ux-framework [planned] Define widget-first Loom subsystem UX framework — reqs=15
- design-widget-first-ticketing-ux [finalized] Design widget-first ticketing UX — reqs=5 tasks=4

## Tickets

- t-0055 [open] Design persistent ticket home surface — Specify the tickets home widget, its summary slices, quick actions, and truthful mode-specific degradation so it can replace command-first orientation.
- t-0056 [open] Design list board timeline and detail flows — Specify the focused list, board, timeline, and master-detail views plus the navigation model between them.
- t-0057 [open] Design direct ticket operations and editing — Specify the create/edit/status/dependency/detail workflows that let humans manage tickets directly from the ticketing UX.
- t-0058 [open] Design human command cutover for tickets — Specify the surviving human-facing ticket verbs and identify which current `/ticket` subcommands become obsolete once the widget and focused views exist.

## Critiques

(none)

## Documentation

(none)
