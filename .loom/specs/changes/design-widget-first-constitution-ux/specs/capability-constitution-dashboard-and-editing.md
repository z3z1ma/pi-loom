---
id: capability-constitution-dashboard-and-editing
title: "Constitution dashboard and deliberate policy editing"
change: design-widget-first-constitution-ux
updated-at: 2026-03-17T05:57:17.346Z
source-changes:
  - design-widget-first-constitution-ux
---

## Summary
The constitution subsystem provides a persistent policy widget plus focused dashboard and master-detail views for reviewing and deliberately editing vision, principles, constraints, roadmap items, and decisions.

## Requirements
- Focused views must support dashboard, roadmap list/detail, and stable-artifact editing for vision, principles, and constraints with clear boundaries between those artifact types.
- The constitution UX must support both project-wide orientation and drill-down into one artifact without falling back to tool-mirroring slash commands.
- The design must preserve reviewability by exposing recent decisions and the rationale for policy changes alongside the editable artifact surfaces.
- The home widget must summarize constitutional completeness, active focus, unresolved constitutional questions, and any roadmap items currently demanding attention.
- The UI must make constitutional edits deliberately scoped so operators can tell whether they are recording a decision, revising stable policy, or updating roadmap execution focus.

## Scenarios
- A user compares roadmap items and stable constraints side by side without resorting to separate slash commands for each artifact.
- A user opens constitution and sees that principles are missing, roadmap focus is empty, and one open constitutional question needs resolution, then enters the roadmap view to update current focus.
- A user reviews a principle in master-detail view, records a decision explaining why it changed, and returns to the home widget with the new state reflected.
