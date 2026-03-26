---
id: design-widget-first-ticketing-ux
title: "Design widget-first ticketing UX"
status: finalized
created-at: 2026-03-17T05:56:14.750Z
updated-at: 2026-03-17T06:16:00.890Z
research: []
initiatives: []
capabilities:
  - capability-ticket-views-and-operations
---

## Overview
Define the human-facing ticketing experience around a persistent tickets home widget, richer list/board/timeline/master-detail views, and direct CRUD-style task management so ticket work is no longer mediated primarily through tool-mirroring slash commands.

## Capabilities
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

## Clarifications
(none)
