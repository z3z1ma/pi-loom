---
id: revamp-ticket-workspace-into-an-overlay-workbench-ux
title: "Revamp ticket workspace into an overlay workbench UX"
status: finalized
created-at: 2026-03-17T19:30:22.208Z
updated-at: 2026-03-17T19:32:54.334Z
research: []
initiatives: []
---

## Task Graph
- task-001: Build the ticket workbench shell and view model
  Summary: Replace the current string-plus-action-list interactive architecture with a centered-overlay workbench shell and explicit view-model helpers derived from existing ticket store/query APIs.
  Requirements: req-001, req-002, req-003
  Capabilities: capability-overlay-ticket-workbench
  Acceptance: A reviewer can identify the new workbench shell entry point and the helper layer that shapes ticket data for UI rendering.; The old interactive action-list architecture is no longer the primary UI path for `/ticket` in UI-capable runtimes.; The shell opens and closes as one bounded workspace without changing ticket-ledger semantics.
- task-002: Implement tabbed overview inbox board timeline and detail surfaces
  Summary: Add selector-style top-level tabs and contextual panels so humans can move across overview, review, backlog, chronology, and detail-reading flows inside one shell.
  Requirements: req-004, req-005, req-006
  Capabilities: capability-overlay-ticket-workbench, capability-tabbed-ticket-navigation
  Dependencies: task-001
  Acceptance: A reviewer can navigate among the top-level surfaces and explain what each is for without referring to chat context.; Keyboard-only navigation across tabs and focused lists is explicit and testable.; The board, inbox, and timeline surfaces present different ticket questions instead of duplicating one another.
- task-003: Move ticket mutations into contextual actions and bounded editors
  Summary: Replace the flat global action menu with contextual create/edit/status/dependency flows and detail-driven access to journal, checkpoint, and attachment context.
  Requirements: req-007, req-008, req-009
  Capabilities: capability-contextual-ticket-operations
  Dependencies: task-002
  Acceptance: A reviewer can trace common ticket-management workflows from inside the workbench without relying on the old global action list.; Contextual action menus or bounded forms clearly replace the previous one-size-fits-all action area.; The detail experience remains truthful about durable ticket evidence and history while supporting edits.
- task-004: Preserve command semantics fallback behavior and package truth
  Summary: Keep `/ticket` verbs and non-UI fallback behavior truthful while updating README and tests to describe and verify the new overlay workbench contract.
  Requirements: req-001, req-004, req-008
  Capabilities: capability-contextual-ticket-operations, capability-overlay-ticket-workbench, capability-tabbed-ticket-navigation
  Dependencies: task-001, task-002, task-003
  Acceptance: A reviewer can compare the package README and test suite to the shipped behavior and see one coherent UI contract.; Non-UI environments still receive truthful textual output rather than a broken or misleading pseudo-UI.; Targeted verification demonstrates that the new shell, navigation, actions, and fallback paths all work together.

## Traceability
- task-001 -> req-001, req-002, req-003
- task-002 -> req-004, req-005, req-006
- task-003 -> req-007, req-008, req-009
- task-004 -> req-001, req-004, req-008
