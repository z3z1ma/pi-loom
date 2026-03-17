---
id: capability-mode-portability-and-truthful-degradation
title: "Mode portability and truthful degradation"
change: define-widget-first-loom-subsystem-ux-framework
updated-at: 2026-03-17T05:54:44.688Z
source-changes:
  - define-widget-first-loom-subsystem-ux-framework
---

## Summary
Subsystem UX must behave truthfully across interactive TUI, RPC, and non-interactive contexts without pretending that every surface is available everywhere.

## Requirements
- Acceptance for each subsystem must include at least one observable statement about mode-specific behavior so the UI contract remains truthful.
- Each subsystem spec must state which experiences require interactive TUI, which can degrade to RPC-safe string widgets or textual summaries, and what the non-interactive fallback is.
- Focused views that require `ctx.ui.custom(...)` must document how the user is informed when that mode is unavailable and what alternative path remains.
- No subsystem spec may claim capabilities that only exist in a richer runtime mode without also defining the degraded behavior for RPC/headless execution.
- Persistent widget designs must account for the reduced remote surface by defining a textual fallback rather than assuming rich component widgets are always available.

## Scenarios
- A focused board or master-detail view is available in TUI but provides a textual open/fallback path in less capable modes.
- A headless or background run still exposes the essential state transition through durable records and textual outputs even though no interactive widget is mounted.
- A subsystem home widget renders as a rich component in interactive TUI but collapses to a compact string summary in RPC without lying about unsupported interactions.
