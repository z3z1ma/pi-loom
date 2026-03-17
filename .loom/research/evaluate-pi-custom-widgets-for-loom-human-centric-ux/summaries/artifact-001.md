---
id: artifact-001
research: evaluate-pi-custom-widgets-for-loom-human-centric-ux
kind: summary
title: "Pi widget surface comparison and Loom UX implications"
created-at: 2026-03-17T05:42:58.018Z
tags:
  - loom
  - pi
  - slash-commands
  - ux
  - widgets
linked-hypotheses:
  - hyp-001
  - hyp-002
  - hyp-003
source: null
---

## Summary
Source-backed comparison of pi-loom’s current command-first UX, pi-mono’s real widget implementation, current oh-my-pi widget limitations, and the resulting recommendations for Loom’s widget-first human experience.

## Body
## Current pi-loom state
- `packages/pi-ticketing/extensions/index.ts` and `packages/pi-workers/extensions/index.ts` show the current human-facing surface is slash-command registration via `pi.registerCommand(...)` with separate machine-facing tool families.
- Searches across `packages/**` found no widget usage in current pi-loom package code, so a widget migration would be an intentional product shift.
- Existing interactive affordances in pi-loom are session and editor handoffs such as `ctx.newSession(...)`, `ctx.ui.setEditorText(...)`, and notifications.

## Strongest widget implementation found
- `pi-mono/packages/coding-agent/src/core/extensions/types.ts` exposes `ctx.ui.setWidget(key, content, options?)` where `content` can be `string[]` or a component factory and `options` include placement.
- `pi-mono/packages/coding-agent/src/modes/interactive/interactive-mode.ts` mounts widgets in dedicated containers above or below the editor, disposes prior widgets by key, truncates string widgets to 10 lines, and re-renders explicitly.
- `pi-mono/packages/coding-agent/src/modes/rpc/rpc-mode.ts` forwards only string-array widgets over RPC, preserving a degraded but explicit remote fallback.
- Examples such as `examples/extensions/widget-placement.ts`, `pi-supervisor/src/ui/status-widget.ts`, and `pi-subagents/render.ts` show widgets being used for persistent status, progress, and lightweight summaries.

## Current oh-my-pi limitations
- `oh-my-pi/packages/coding-agent/src/extensibility/extensions/types.ts` still advertises `setWidget`, but without placement options.
- `oh-my-pi/packages/coding-agent/src/modes/controllers/extension-ui-controller.ts` currently maps `setWidget` to `setHookWidget`, and `setHookWidget` turns widget content into `String(content)` inside hook status rendering rather than mounting a real widget container.
- `oh-my-pi/docs/tui.md` explicitly notes that overlay options on `ctx.ui.custom(...)` are currently ignored by interactive extension mounting, and documents other UI gaps such as no-op custom footer/header/editor-component hooks.

## Interaction model implications
- Widgets are best for persistent context, progress, and summary state that should stay visible while the user keeps working.
- `ctx.ui.custom(...)` is the correct surface for focused transient interaction, wizards, pickers, and keyboard-driven modal flows.
- `pi.sendUserMessage(...)` is the right bridge from a human command or widget-triggered action into an actual agent turn; it lets Loom keep a few human verbs without mirroring every tool as a slash command.

## Loom recommendation
- Do not assume current oh-my-pi widgets are strong enough to become the home surface for every Loom subsystem.
- If Loom wants widget-first subsystem homes, first require or port pi-mono-class widget behavior: dedicated widget containers, keyed replacement/disposal, placement, truncation rules, and a clear RPC degradation path.
- Then redesign subsystem UX around one small human-centric command per subsystem that opens/focuses the subsystem surface, plus a widget that keeps durable context visible, plus `ctx.ui.custom(...)` or `pi.sendUserMessage(...)` for deeper actions.
- Remove tool-mirroring slash commands only after the replacement interaction model is real, not aspirational.
