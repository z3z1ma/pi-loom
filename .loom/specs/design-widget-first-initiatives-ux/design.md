---
id: design-widget-first-initiatives-ux
title: "Design widget-first initiatives UX"
status: specified
created-at: 2026-03-17T05:56:14.291Z
updated-at: 2026-03-17T05:57:17.712Z
research: []
initiatives: []
capabilities:
  - capability-initiative-portfolio
---

## Design Notes
Initiatives are Loom's strategic outcome containers. Their human-facing UX should help users reason about multi-spec, multi-ticket programs at the portfolio level rather than forcing them through ledger-shaped commands. The home widget should surface active initiatives, upcoming milestones, risk hotspots, and strategic questions that need attention.

Focused interaction should support a portfolio list, milestone/status views, and initiative master-detail layouts showing objective, outcomes, scope, risks, linked specs, linked tickets, and decisions. The subsystem should help the user understand sequencing and risk without collapsing into a project-management parody or duplicating plan-level live execution state.

The surviving human verbs should center on opening the portfolio, creating an initiative, and updating strategic status or milestone framing. Tool-mirroring verbs for every field update should disappear once the initiative workspace covers the strategic workflows directly.

## Capability Map
- capability-initiative-portfolio: Strategic initiative portfolio and milestone management

## Requirements
- req-001: Focused views must support portfolio scanning, milestone status review, and initiative master-detail inspection covering objective, outcomes, scope, non-goals, risks, linked work, and decisions.
  Acceptance: A reviewer can identify how a user would inspect the strategic portfolio, create an initiative, update a milestone, and review linked work from the subsystem UX alone.; The home widget and focused views combine portfolio orientation with deep initiative detail.; The initiative spec preserves the strategic layer boundary instead of duplicating plan or ticket responsibilities.
  Capabilities: capability-initiative-portfolio
- req-002: The design must preserve initiatives as strategic containers rather than turning them into ticket-by-ticket task boards or pseudo-specs.
  Acceptance: A reviewer can identify how a user would inspect the strategic portfolio, create an initiative, update a milestone, and review linked work from the subsystem UX alone.; The home widget and focused views combine portfolio orientation with deep initiative detail.; The initiative spec preserves the strategic layer boundary instead of duplicating plan or ticket responsibilities.
  Capabilities: capability-initiative-portfolio
- req-003: The home widget must summarize active initiatives, milestone pressure, unresolved strategic risks, and the highest-value portfolio actions.
  Acceptance: A reviewer can identify how a user would inspect the strategic portfolio, create an initiative, update a milestone, and review linked work from the subsystem UX alone.; The home widget and focused views combine portfolio orientation with deep initiative detail.; The initiative spec preserves the strategic layer boundary instead of duplicating plan or ticket responsibilities.
  Capabilities: capability-initiative-portfolio
- req-004: The UI must support creating an initiative, updating status summaries, shaping milestones, and reviewing linked specs or tickets without relying on tool-mirroring slash commands.
  Acceptance: A reviewer can identify how a user would inspect the strategic portfolio, create an initiative, update a milestone, and review linked work from the subsystem UX alone.; The home widget and focused views combine portfolio orientation with deep initiative detail.; The initiative spec preserves the strategic layer boundary instead of duplicating plan or ticket responsibilities.
  Capabilities: capability-initiative-portfolio
- req-005: The workspace must make strategic risk and sequencing visible enough that users can reason about priority and scope at a glance.
  Acceptance: A reviewer can identify how a user would inspect the strategic portfolio, create an initiative, update a milestone, and review linked work from the subsystem UX alone.; The home widget and focused views combine portfolio orientation with deep initiative detail.; The initiative spec preserves the strategic layer boundary instead of duplicating plan or ticket responsibilities.
  Capabilities: capability-initiative-portfolio
