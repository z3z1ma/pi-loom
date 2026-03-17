---
id: artifact-001
research: ticket-workspace-ui-revamp-reference-study
kind: summary
title: "Reference UI findings for ticket workspace redesign"
created-at: 2026-03-17T19:08:21.628Z
tags:
  - reference
  - ticketing
  - tui
  - ui
linked-hypotheses: []
source: research://ticket-workspace-ui-revamp-reference-study/reference-summary
---

## Summary
Concise evidence package comparing the current ticket workspace with pi-mono settings, oh-my-pi tabbed settings, pi-subagents overlays, and modal/tab navigation guidance.

## Body
Current pi-loom ticket UX:
- `packages/pi-ticketing/extensions/ui/ticket-workspace.ts` renders home/list/board/timeline/detail as plain strings and presents a single long vertical action list inside `openInteractiveTicketWorkspace()`.
- It does not pass overlay options, does not use tabs, and does not separate navigation chrome from content panels.

pi-mono /settings reference:
- `interactive-mode.ts` dispatches `/settings` into `showSettingsSelector()`.
- `settings-selector.ts` uses `SettingsList` plus `SelectSubmenu` to keep the user in one focused panel while drilling into setting choices.
- `settings-list.ts` supports scroll state, aligned label/value rows, descriptions for the selected row, fuzzy search, and clear keyboard hints.

oh-my-pi settings reference:
- `selector-controller.ts` swaps the editor area for a selector component and restores focus on cancel.
- `modes/components/settings-selector.ts` adds `TabBar`, plugin/settings tabs, live preview callbacks, and a bordered container.
- `tui/src/components/tab-bar.ts` standardizes Left/Right and Tab/Shift+Tab tab switching with a visible hint.

pi-subagents reference:
- `index.ts` opens the manager as a centered overlay (`overlay: true`, width 84, maxHeight 80%).
- `agent-manager.ts` keeps multiple internal screens inside one shell (list/detail/edit/template/task-input/parallel-builder) rather than bouncing through separate commands.
- README documents list, builder, and task-input keybindings, plus Esc behavior that first clears state, then closes.

General modal/tab guidance:
- Official Textual docs describe modal screens that trap focus, close with Escape, and keep keyboard interaction local while tabs switch views with Left/Right.
- These principles match the observed Pi implementations and support a ticket shell with bounded focus, progressive disclosure, and predictable keyboard travel.
