---
id: artifact-002
research: ticket-workspace-ui-revamp-reference-study
kind: source
title: "pi-subagents overlay manager evidence"
created-at: 2026-03-17T19:10:32.350Z
tags:
  - overlay
  - subagents
  - ticketing
  - ui
linked-hypotheses: []
source: agent://1-InspectSubagentsUi
---

## Summary
Source-backed evidence that pi-subagents uses a centered overlay, multi-screen modal shell, rich list behaviors, and explicit Esc/back semantics that map well to a ticket workbench redesign.

## Body
Source summary from local `.agents/resources/pi-subagents`:

1. Overlay shell
- `index.ts` opens the manager and clarify flows via `ctx.ui.custom(...)` with overlay options.
- The manager is centered with explicit width/maxHeight, which matches the desired 'modal pop-up' feel for ticketing.

2. Single shell, many screens
- `agent-manager.ts` keeps route-like `screen` state inside one component: list, detail, edit, parallel-builder, task-input, chain-detail, and more.
- Input handling and rendering are delegated by screen, so navigation depth stays inside one bounded shell instead of spawning a new command surface each time.

3. Rich list behavior
- README documents search/filter, multi-select, Enter to drill in, Tab for selection, Ctrl+R and Ctrl+P for higher-level actions, and Esc semantics that progressively clear query/selection before closing.
- This is materially better than the current ticket action-list model.

4. Ticketing gap
- Current ticket UI already uses `ctx.ui.custom(...)`, but only to render strings plus a flat action list and without overlay options.
- This confirms the architectural gap is at the shell/state-machine level, not just visual styling.

5. Design implication for ticket workbench
- The ticket revamp should use a single stateful component with internal tabs/screens, contextual actions, and back-stack behavior.
- Esc should back out one layer at a time before closing the whole shell.
- The strongest immediate analogue is a centered overlay workbench with drill-in detail, not a full-screen text page.
