---
id: capability-overlay-ticket-workbench
title: "Centered overlay ticket workbench"
change: revamp-ticket-workspace-into-an-overlay-workbench-ux
updated-at: 2026-03-17T19:32:54.334Z
source-changes:
  - revamp-ticket-workspace-into-an-overlay-workbench-ux
---

## Summary
Interactive ticketing opens as a bounded centered-overlay shell with obvious hierarchy, predictable navigation, and clean close/restore behavior instead of a text dump plus action list.

## Requirements
- The interactive `/ticket` workspace must default to a centered overlay shell when the runtime supports overlay presentation and must still degrade truthfully when only non-overlay custom UI is available.
- The shell must own its own navigation state and close/restore behavior rather than bouncing users through separate command invocations for each focused view.
- The workbench must keep ticket-ledger data truthful by deriving its presentation from store/query results instead of inventing UI-only ticket state.

## Scenarios
- A human exits the workbench with Esc and returns cleanly to the prior editor/shell context.
- A human opens `/ticket open home` and lands in a centered ticket workbench instead of a textual action list.
- A runtime without overlay support still gets truthful custom UI or textual fallback behavior without a divergent command surface.
