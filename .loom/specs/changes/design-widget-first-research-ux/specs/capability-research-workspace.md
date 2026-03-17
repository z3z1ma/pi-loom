---
id: capability-research-workspace
title: "Research workspace for investigations, hypotheses, and evidence"
change: design-widget-first-research-ux
updated-at: 2026-03-17T05:57:17.541Z
source-changes:
  - design-widget-first-research-ux
---

## Summary
The research subsystem provides a persistent discovery widget plus focused list/detail and evidence views for managing investigations from opening question through synthesis.

## Requirements
- Focused views must support scanning a list of investigations, opening one record in detail, and drilling into hypotheses, artifacts, conclusions, and open questions without losing overall portfolio context.
- The design must preserve the research layer's role as evidence and discovery rather than letting execution details overwhelm the workspace.
- The home widget must highlight active research, stale or blocked investigations, unresolved high-signal questions, and suggested next research actions.
- The research UX must make it easy to see what evidence changed confidence in a hypothesis and what remains unresolved.
- The UI must support creating a new research record, updating status, adding or revising hypotheses, attaching artifacts, and progressing work toward synthesis.

## Scenarios
- A user compares hypotheses and artifacts inside one research record, adds new evidence, and updates the record's confidence and conclusions without using separate slash commands.
- A user opens research and sees two active investigations, one stale record, and one synthesized record needing downstream linkage, then drills into the active investigation with the highest-impact open question.
- A user synthesizes a completed investigation and returns to the home widget where the record now appears as reusable evidence rather than active exploration.
