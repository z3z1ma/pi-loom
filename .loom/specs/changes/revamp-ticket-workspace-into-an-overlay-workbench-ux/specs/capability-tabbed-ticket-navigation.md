---
id: capability-tabbed-ticket-navigation
title: "Tabbed navigation and contextual ticket surfaces"
change: revamp-ticket-workspace-into-an-overlay-workbench-ux
updated-at: 2026-03-17T19:32:54.334Z
source-changes:
  - revamp-ticket-workspace-into-an-overlay-workbench-ux
---

## Summary
The workbench organizes ticket work into top-level tabs and contextual panels so overview, inbox, board, timeline, and detail flows are visually distinct and quickly reachable.

## Requirements
- Tab switching must follow established Pi patterns with visible hints and keyboard travel via Tab/Shift+Tab or Left/Right.
- The selected item in list-like surfaces must expose contextual description or detail cues so users can understand focus without opening every ticket.
- Top-level navigation must include at least Overview, Inbox, Board, Timeline, and Detail surfaces or equivalent names with the same responsibilities.

## Scenarios
- A human browsing the board can understand the currently selected ticket from the side panel or selected-row description before pressing Enter.
- A human switches from Overview to Inbox to Board using only keyboard navigation and sees each surface retain its own role.
- A human uses the timeline to inspect recent ticket changes without losing access to the same shell or back behavior.
