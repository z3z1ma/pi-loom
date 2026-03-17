---
id: capability-common-subsystem-shell
title: "Common subsystem shell and surface split"
change: define-widget-first-loom-subsystem-ux-framework
updated-at: 2026-03-17T05:54:44.688Z
source-changes:
  - define-widget-first-loom-subsystem-ux-framework
---

## Summary
Every Loom subsystem presents a shared interaction shape consisting of a persistent home widget plus focused drill-down views rather than a flat command namespace.

## Requirements
- Each subsystem must define a persistent widget home surface that summarizes current state, actionable attention, and the highest-value next actions.
- Each subsystem must define one or more focused interactive views for dense browsing, editing, filtering, or drill-down work; these views are distinct from the persistent widget.
- Each subsystem spec must name the primary view modes it supports, such as list, board, timeline, master-detail, queue, graph, or packet/review view, and justify why those modes fit that subsystem.
- Subsystem home widgets and focused views must share consistent affordances for navigation, selection, opening details, and returning to the home surface so the overall product feels like one system.
- The framework must make the difference between persistent widget state and focused transient interaction explicit so subsystem designs do not overload one surface with both jobs.

## Scenarios
- A reviewer compares two subsystem specs and finds the same basic surface split even though the domain-specific views differ.
- A user leaves the persistent widget to perform dense interaction in a focused list/board/detail view, then returns without losing subsystem orientation.
- A user opens a subsystem and immediately sees a durable summary of what matters now without running a tool-mirroring command.
