---
id: capability-contextual-ticket-operations
title: "Contextual ticket operations inside the workbench"
change: revamp-ticket-workspace-into-an-overlay-workbench-ux
updated-at: 2026-03-17T19:32:54.334Z
source-changes:
  - revamp-ticket-workspace-into-an-overlay-workbench-ux
---

## Summary
Core ticket mutations happen through contextual actions and bounded subviews instead of a global action dump, while long-form edits still use the most appropriate editor surface.

## Requirements
- Long-form body edits may delegate to `ctx.ui.editor`, but the action must originate from the contextual workbench flow rather than a separate ad hoc command path.
- The workbench must support create, status change, reopen/close, dependency add/remove, and metadata edits such as assignee, priority, risk, type, and review status from contextual actions.
- Ticket detail flows must expose journal, checkpoint, and attachment context without requiring the human to drop back to tool-mirroring slash commands.

## Scenarios
- A human opens detail, reviews recent journal/checkpoint context, and then edits priority or assignee from the same shell.
- A human selects a ticket on the board, opens contextual actions, and marks it in progress without leaving the workbench.
- A human starts a long-form edit for Summary or Plan and is routed through `ctx.ui.editor` from the workbench flow rather than a disconnected command.
