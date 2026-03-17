---
id: capability-initiative-portfolio
title: "Strategic initiative portfolio and milestone management"
change: design-widget-first-initiatives-ux
updated-at: 2026-03-17T05:57:17.712Z
source-changes:
  - design-widget-first-initiatives-ux
---

## Summary
The initiatives subsystem provides a persistent strategic portfolio widget plus focused portfolio, milestone, and master-detail views for long-horizon initiative shaping.

## Requirements
- Focused views must support portfolio scanning, milestone status review, and initiative master-detail inspection covering objective, outcomes, scope, non-goals, risks, linked work, and decisions.
- The design must preserve initiatives as strategic containers rather than turning them into ticket-by-ticket task boards or pseudo-specs.
- The home widget must summarize active initiatives, milestone pressure, unresolved strategic risks, and the highest-value portfolio actions.
- The UI must support creating an initiative, updating status summaries, shaping milestones, and reviewing linked specs or tickets without relying on tool-mirroring slash commands.
- The workspace must make strategic risk and sequencing visible enough that users can reason about priority and scope at a glance.

## Scenarios
- A user edits an initiative's milestone framing and risk summary from the master-detail view without resorting to raw slash commands.
- A user opens initiatives and sees one active program slipping on milestones, one proposed program awaiting scope clarification, and one dormant program with stale status, then drills into the active initiative.
- A user scans the portfolio view to decide which initiative needs a new spec next while keeping strategic outcomes, not ticket churn, as the primary lens.
