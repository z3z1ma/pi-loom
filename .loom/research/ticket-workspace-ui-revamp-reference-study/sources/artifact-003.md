---
id: artifact-003
research: ticket-workspace-ui-revamp-reference-study
kind: source
title: "PI settings selector evidence"
created-at: 2026-03-17T19:11:27.111Z
tags:
  - oh-my-pi
  - pi-mono
  - settings
  - ticketing
  - ui
linked-hypotheses: []
source: agent://0-InspectPiMonoSettings
---

## Summary
Source-backed evidence from pi-mono and oh-my-pi that `/settings` uses a focused selector shell with submenus, tabbed navigation, descriptions, and clean focus restoration.

## Body
Source summary from local `.agents/resources/pi-mono` and `.agents/resources/oh-my-pi`:

1. Command path and focus model
- In pi-mono, `/settings` dispatches to `showSettingsSelector()` from the interactive mode submit path.
- In oh-my-pi, `/settings` is a built-in slash command that opens the settings selector.
- Both flows replace or overlay the editor-area interaction with a dedicated selector and restore focus on cancel.

2. Settings shell structure
- pi-mono's selector is a focused single-screen settings shell built from `SettingsList` plus `SelectSubmenu`.
- oh-my-pi's selector evolves this into a tabbed settings shell using `TabBar`, declarative per-tab settings definitions, and live previews.

3. Behavior worth borrowing
- Aligned label/value rows, selected-row descriptions, explicit key hints, and scroll indicators.
- Submenus for bounded edits rather than exploding all actions into one flat list.
- Tab navigation via Tab/Shift+Tab or Right/Left with visible hints.
- Cancel behavior that cleanly restores the prior editing context.

4. Design implication for ticketing
- `/ticket` should behave like a selector shell, not a text report. Users should enter one bounded workspace, move across top-level tabs, and drill into contextual subviews or submenus.
- The strongest settings-derived patterns are: tabbed top-level navigation, description-rich selected rows, contextual submenus, and deterministic focus restoration when closing the shell.
