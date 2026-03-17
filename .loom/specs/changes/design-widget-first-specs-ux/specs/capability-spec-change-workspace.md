---
id: capability-spec-change-workspace
title: "Spec change workspace from proposal to readiness"
change: design-widget-first-specs-ux
updated-at: 2026-03-17T05:58:07.061Z
source-changes:
  - design-widget-first-specs-ux
---

## Summary
The specs subsystem provides a persistent change-overview widget plus focused proposal, design, tasks, capability, and readiness views for managing bounded change contracts.

## Requirements
- Focused views must support a list of changes plus drill-down into proposal, design notes, tasks, capabilities, analysis/checklist state, and ticket-projection readiness.
- The design must preserve the spec layer boundary by keeping strategic context above and live execution details below.
- The home widget must summarize active spec changes, clarifications waiting on answers, readiness blockers, and the next highest-value spec actions.
- The UI must support proposing a change, recording clarifications, shaping design and tasks, and reviewing whether the spec is ready for downstream execution without relying on tool-mirroring slash commands.
- The workspace must make ambiguity, dependencies, and acceptance expectations visible enough that a human can judge whether a spec is truly ready.

## Scenarios
- A user compares two spec changes and can tell which one is still ambiguous and which one is ready for downstream planning without calling raw slash commands.
- A user edits proposal and design sections, reviews checklist and analysis state, and decides whether the change is mature enough to proceed.
- A user opens specs and sees two changes awaiting clarification, one planned change ready for ticket projection, and one stale proposal, then drills into the blocked change.
