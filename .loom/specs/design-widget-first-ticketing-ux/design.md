---
id: design-widget-first-ticketing-ux
title: "Design widget-first ticketing UX"
status: archived
created-at: 2026-03-17T05:56:14.750Z
updated-at: 2026-03-28T00:10:11.857Z
research: []
initiatives: []
capabilities:
  - capability-ticket-views-and-operations
---

## Design Notes
Ticketing is the most concrete proving ground for Loom's widget-first UX direction because the underlying domain already matches familiar human work-management patterns. The subsystem needs to support multiple ways of understanding the same ticket corpus: list views for scanning and filtering, Kanban-style board views for status flow, timeline views for sequencing and due-date or checkpoint awareness, and master-detail layouts for reading or editing one ticket while preserving backlog context.

The persistent ticket home widget should answer: what work is ready now, what is blocked, what recently changed, and what high-value actions are available? It should not attempt to render the entire backlog. Its job is orientation and quick launch into deeper views.

Focused ticket interaction belongs in `ctx.ui.custom(...)` flows. These focused views should support dense navigation, multi-column browsing, selection, detail inspection, ticket creation, ticket editing, dependency changes, status movement, and journal/checkpoint access. The design should preserve ticket truth as the durable execution ledger while giving humans a much more natural surface than `/ticket <subcommand>`.

The surviving human verbs should be minimal and human-centered, such as opening the tickets surface, creating a new ticket from a prompt, or jumping directly into review of blocked/ready work. The spec treats one-to-one slash wrappers around ticket tools as obsolete once the widget-plus-focused-view experience covers those paths truthfully.

## Capability Map
- capability-ticket-views-and-operations: Multi-view ticket workspace with direct ticket operations

## Requirements
- req-001: Board and timeline interactions must preserve the ticket ledger's real fields and transitions rather than inventing a parallel UI-only model.
  Acceptance: A reviewer can identify how a human would create a ticket, inspect a backlog, move a ticket across statuses, and read ticket detail without relying on tool-mirroring slash commands.; The persistent widget and focused views have clearly separated jobs: orientation in the widget, dense interaction in the focused views.; The ticketing spec names the specific views and operations needed to justify removing human-facing `/ticket` subcommands that map directly to ticket tools.
  Capabilities: capability-ticket-views-and-operations
- req-002: Focused ticket views must include at least a filterable list view, a status-oriented board view, a time-aware timeline or sequencing view, and a master-detail view for reading and editing individual tickets in context.
  Acceptance: A reviewer can identify how a human would create a ticket, inspect a backlog, move a ticket across statuses, and read ticket detail without relying on tool-mirroring slash commands.; The persistent widget and focused views have clearly separated jobs: orientation in the widget, dense interaction in the focused views.; The ticketing spec names the specific views and operations needed to justify removing human-facing `/ticket` subcommands that map directly to ticket tools.
  Capabilities: capability-ticket-views-and-operations
- req-003: The design must make it possible to inspect blocked-vs-ready work and dependency context visually without forcing the user back to raw slash command syntax.
  Acceptance: A reviewer can identify how a human would create a ticket, inspect a backlog, move a ticket across statuses, and read ticket detail without relying on tool-mirroring slash commands.; The persistent widget and focused views have clearly separated jobs: orientation in the widget, dense interaction in the focused views.; The ticketing spec names the specific views and operations needed to justify removing human-facing `/ticket` subcommands that map directly to ticket tools.
  Capabilities: capability-ticket-views-and-operations
- req-004: The ticket home widget must summarize ready work, blocked work, recent changes, and the most valuable next actions without trying to display the entire backlog.
  Acceptance: A reviewer can identify how a human would create a ticket, inspect a backlog, move a ticket across statuses, and read ticket detail without relying on tool-mirroring slash commands.; The persistent widget and focused views have clearly separated jobs: orientation in the widget, dense interaction in the focused views.; The ticketing spec names the specific views and operations needed to justify removing human-facing `/ticket` subcommands that map directly to ticket tools.
  Capabilities: capability-ticket-views-and-operations
- req-005: The UI must support core ticket operations directly: create, edit, close, reopen or status-change, dependency updates, assignment/priority/risk edits, and access to journal/checkpoint/artifact context.
  Acceptance: A reviewer can identify how a human would create a ticket, inspect a backlog, move a ticket across statuses, and read ticket detail without relying on tool-mirroring slash commands.; The persistent widget and focused views have clearly separated jobs: orientation in the widget, dense interaction in the focused views.; The ticketing spec names the specific views and operations needed to justify removing human-facing `/ticket` subcommands that map directly to ticket tools.
  Capabilities: capability-ticket-views-and-operations
