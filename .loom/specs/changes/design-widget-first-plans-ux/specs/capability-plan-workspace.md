---
id: capability-plan-workspace
title: "Execution-strategy workspace with milestone and linkage views"
change: design-widget-first-plans-ux
updated-at: 2026-03-17T05:58:07.195Z
source-changes:
  - design-widget-first-plans-ux
---

## Summary
The plans subsystem provides a persistent execution-strategy widget plus focused milestone, progress, master-detail, and linked-ticket views for managing plan narratives.

## Requirements
- Focused views must support scanning plans, reading and editing one plan in detail, reviewing milestones and progress, and inspecting linked-ticket coverage or gaps.
- The design must preserve plans as execution-strategy artifacts rather than turning the subsystem into a ticket board or a spec editor.
- The home widget must summarize active plans, milestone pressure, revision freshness, and linked-ticket coverage signals that help a user spot stale or risky plans.
- The UI must support creating a plan, updating plan progress or revision notes, and reviewing ticket linkage without relying on tool-mirroring slash commands.
- The workspace must help users tell whether a plan is still truthful and sufficiently connected to real execution work.

## Scenarios
- A user compares two plans to decide which execution slice is actually ready to resume without reaching for raw slash commands.
- A user opens plans and sees one active plan with stale progress notes and weak ticket coverage, then drills into its milestones and linked-ticket view.
- A user updates a plan's progress and revision notes from master-detail view, then confirms the linked ticket set still matches the intended scope.
