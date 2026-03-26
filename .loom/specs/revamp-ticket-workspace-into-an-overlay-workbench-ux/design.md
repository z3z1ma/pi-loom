---
id: revamp-ticket-workspace-into-an-overlay-workbench-ux
title: "Revamp ticket workspace into an overlay workbench UX"
status: finalized
created-at: 2026-03-17T19:30:22.208Z
updated-at: 2026-03-17T19:32:54.334Z
research: []
initiatives: []
capabilities:
  - capability-overlay-ticket-workbench
  - capability-tabbed-ticket-navigation
  - capability-contextual-ticket-operations
---

## Design Notes
## Problem framing
The current ticket workspace is visually and structurally weak because it renders string-based summaries plus one long vertical action list. That architecture makes the UI feel command-derived rather than intentional, hides hierarchy, and forces too many unrelated actions into one flat surface.

## Desired outcome
A human opening `/ticket open home` should enter a bounded shell that feels comparable to Pi settings and pi-subagents: obvious top-level navigation, strong hierarchy, contextual detail, predictable Esc/back behavior, and focused editing flows.

## Scope
- Interactive `/ticket` workspace behavior in UI-capable runtimes.
- The view-model and component structure needed to support the new shell.
- Preservation of current `/ticket` verbs and non-UI textual fallback behavior.

## Non-goals
- Changing the durable ticket ledger schema.
- Replacing machine-facing `ticket_*` tools.
- Requiring a web UI or screenshots.

## Design direction
- Default to a centered overlay workbench when overlay presentation is available.
- Use a selector-style shell with top-level tabs and contextual subviews.
- Use one stateful component to own overview/list-board/timeline/detail/create-edit flows, with Esc stepping back before closing.
- Keep long-form editing in `ctx.ui.editor` where that is the clearest fit.

## Reference evidence
- PI settings in pi-mono and oh-my-pi show selector containers, tab bars, selected-row descriptions, and focus restoration.
- pi-subagents shows the best modal shell pattern: centered overlay plus a single internal multi-screen state machine.

## Verification strategy
- Command tests for `/ticket open home`, `/ticket review ready|blocked`, and `/ticket open detail <ref>` in UI and non-UI modes.
- UI tests for overlay opening, tab navigation, drill-in/back behavior, and contextual action routing.
- Rendering/view-model tests for overview metrics, inbox slices, lane grouping, recent activity, and detail context.
- Manual verification via `omp -e .` for subjective polish and navigation speed.

## Capability Map
- capability-overlay-ticket-workbench: Centered overlay ticket workbench
- capability-tabbed-ticket-navigation: Tabbed navigation and contextual ticket surfaces
- capability-contextual-ticket-operations: Contextual ticket operations inside the workbench

## Requirements
- req-001: The interactive `/ticket` workspace must default to a centered overlay shell when the runtime supports overlay presentation and must still degrade truthfully when only non-overlay custom UI is available.
  Acceptance: A reviewer can point to one bounded interactive shell that opens for `/ticket` in UI mode and restores the prior context when closed.; No durable ticket data model changes are required to support the new shell.; The new interactive shell no longer renders as a single content block followed by one flat vertical action list.
  Capabilities: capability-overlay-ticket-workbench
- req-002: The shell must own its own navigation state and close/restore behavior rather than bouncing users through separate command invocations for each focused view.
  Acceptance: A reviewer can point to one bounded interactive shell that opens for `/ticket` in UI mode and restores the prior context when closed.; No durable ticket data model changes are required to support the new shell.; The new interactive shell no longer renders as a single content block followed by one flat vertical action list.
  Capabilities: capability-overlay-ticket-workbench
- req-003: The workbench must keep ticket-ledger data truthful by deriving its presentation from store/query results instead of inventing UI-only ticket state.
  Acceptance: A reviewer can point to one bounded interactive shell that opens for `/ticket` in UI mode and restores the prior context when closed.; No durable ticket data model changes are required to support the new shell.; The new interactive shell no longer renders as a single content block followed by one flat vertical action list.
  Capabilities: capability-overlay-ticket-workbench
- req-004: Tab switching must follow established Pi patterns with visible hints and keyboard travel via Tab/Shift+Tab or Left/Right.
  Acceptance: A reviewer can identify the role of each top-level ticket surface and how a human moves among them with keyboard controls alone.; Selected-row context is visible enough that users can inspect the backlog efficiently before drilling in.; The workbench exposes distinct orientation, review, backlog, chronological, and detail-reading surfaces rather than conflating them into one screen.
  Capabilities: capability-tabbed-ticket-navigation
- req-005: The selected item in list-like surfaces must expose contextual description or detail cues so users can understand focus without opening every ticket.
  Acceptance: A reviewer can identify the role of each top-level ticket surface and how a human moves among them with keyboard controls alone.; Selected-row context is visible enough that users can inspect the backlog efficiently before drilling in.; The workbench exposes distinct orientation, review, backlog, chronological, and detail-reading surfaces rather than conflating them into one screen.
  Capabilities: capability-tabbed-ticket-navigation
- req-006: Top-level navigation must include at least Overview, Inbox, Board, Timeline, and Detail surfaces or equivalent names with the same responsibilities.
  Acceptance: A reviewer can identify the role of each top-level ticket surface and how a human moves among them with keyboard controls alone.; Selected-row context is visible enough that users can inspect the backlog efficiently before drilling in.; The workbench exposes distinct orientation, review, backlog, chronological, and detail-reading surfaces rather than conflating them into one screen.
  Capabilities: capability-tabbed-ticket-navigation
- req-007: Long-form body edits may delegate to `ctx.ui.editor`, but the action must originate from the contextual workbench flow rather than a separate ad hoc command path.
  Acceptance: A reviewer can trace how a human performs practical ticket management from inside the workbench without relying on the old flat action list.; Contextual action menus or bounded forms replace the current one-size-fits-all vertical action area.; Detail flows continue to surface durable ticket context such as journal, checkpoint, and attachment information truthfully.
  Capabilities: capability-contextual-ticket-operations
- req-008: The workbench must support create, status change, reopen/close, dependency add/remove, and metadata edits such as assignee, priority, risk, type, and review status from contextual actions.
  Acceptance: A reviewer can trace how a human performs practical ticket management from inside the workbench without relying on the old flat action list.; Contextual action menus or bounded forms replace the current one-size-fits-all vertical action area.; Detail flows continue to surface durable ticket context such as journal, checkpoint, and attachment information truthfully.
  Capabilities: capability-contextual-ticket-operations
- req-009: Ticket detail flows must expose journal, checkpoint, and attachment context without requiring the human to drop back to tool-mirroring slash commands.
  Acceptance: A reviewer can trace how a human performs practical ticket management from inside the workbench without relying on the old flat action list.; Contextual action menus or bounded forms replace the current one-size-fits-all vertical action area.; Detail flows continue to surface durable ticket context such as journal, checkpoint, and attachment information truthfully.
  Capabilities: capability-contextual-ticket-operations
