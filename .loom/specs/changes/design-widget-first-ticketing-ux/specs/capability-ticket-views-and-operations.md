---
id: capability-ticket-views-and-operations
title: "Multi-view ticket workspace with direct ticket operations"
change: design-widget-first-ticketing-ux
updated-at: 2026-03-17T06:16:00.890Z
source-changes:
  - design-widget-first-ticketing-ux
---

## Summary
The ticketing subsystem provides a persistent home widget plus focused list, board, timeline, and master-detail views that let users inspect and manage tickets directly.

## Requirements
- Board and timeline interactions must preserve the ticket ledger's real fields and transitions rather than inventing a parallel UI-only model.
- Focused ticket views must include at least a filterable list view, a status-oriented board view, a time-aware timeline or sequencing view, and a master-detail view for reading and editing individual tickets in context.
- The design must make it possible to inspect blocked-vs-ready work and dependency context visually without forcing the user back to raw slash command syntax.
- The ticket home widget must summarize ready work, blocked work, recent changes, and the most valuable next actions without trying to display the entire backlog.
- The UI must support core ticket operations directly: create, edit, close, reopen or status-change, dependency updates, assignment/priority/risk edits, and access to journal/checkpoint/artifact context.

## Scenarios
- A user creates a new ticket from the ticketing surface, edits its priority and dependencies, and returns to the home widget without needing separate slash commands for create, update, or graph inspection.
- A user opens the tickets subsystem and sees a widget highlighting ready work, blocked work, and recently updated tickets, then enters a board view to move a ticket from ready to in progress.
- A user switches from a board or list to a master-detail view to inspect acceptance criteria, journal entries, attachments, and checkpoints while keeping backlog context visible.
