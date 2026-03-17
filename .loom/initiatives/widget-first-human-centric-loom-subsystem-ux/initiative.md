---
id: widget-first-human-centric-loom-subsystem-ux
title: "Widget-first human-centric Loom subsystem UX"
status: active
created-at: 2026-03-17T05:59:58.550Z
updated-at: 2026-03-17T06:08:00.000Z
owners:
  - AI
tags:
  - ux
  - widgets
  - slash-commands
  - loom
research:
  - evaluate-pi-custom-widgets-for-loom-human-centric-ux
spec-changes:
  - define-widget-first-loom-subsystem-ux-framework
  - design-widget-first-constitution-ux
  - design-widget-first-research-ux
  - design-widget-first-initiatives-ux
  - design-widget-first-specs-ux
  - design-widget-first-plans-ux
  - design-widget-first-ticketing-ux
  - design-widget-first-workers-ux
  - design-widget-first-critique-ux
  - design-widget-first-ralph-ux
  - design-widget-first-docs-ux
tickets: []
capabilities: []
roadmap-refs: []
---

## Objective
Redesign Pi Loom's human-facing subsystem entrypoints around persistent widgets, focused interactive views, and a smaller set of economic human commands so the product stops mirroring AI tools through slash commands and instead presents each Loom layer as a coherent interactive experience.

## Outcomes
- Each Loom subsystem has a durable UX spec describing its home widget, focused views, principal operations, and surviving human-facing verbs.
- The product converges on one interaction model across layers: persistent widget surface, focused drill-down UI, and user-message or command handoff for agent work.
- Tool-mirroring slash commands become removable because each subsystem gains a truthful human path that covers its core workflows.

## Scope
- Cross-cutting interaction model for constitution, research, initiatives, specs, plans, tickets, workers, critique, Ralph, and docs
- Shared UX principles for widget roles, focused custom UI roles, and surviving command verbs
- Subsystem-specific design contracts describing the main human-facing views and operations

## Non-Goals
- Implement the widget UIs in this initiative phase
- Finalize exact pixel/layout details before subsystem specs are reviewed
- Preserve one slash command per AI-facing tool

## Success Metrics
- A proposed or planned spec exists for every Loom subsystem's human-facing widget experience.
- Each spec defines clear views, principal operations, and acceptance signals rather than vague UI aspirations.
- The resulting spec family makes it possible to remove tool-mirroring slash commands subsystem by subsystem without leaving a UX gap.

## Status Summary
The initiative now has one cross-cutting widget UX framework spec plus planned subsystem specs for constitution, research, initiatives, specs, plans, tickets, workers, critique, Ralph, and docs. Ticketing is specified as the most concrete exemplar, while the other subsystem specs preserve their own layer boundaries and view models.

## Risks
- Over-designing the UI without enough shared interaction principles could produce ten incompatible subsystem experiences.
- Trying to force every action into a persistent widget could create brittle, overloaded surfaces instead of focused workflows.
- Subsystem boundaries may tempt duplicated views and verbs unless the framework is explicit about what is shared vs. subsystem-specific.

## Linked Roadmap
(none)

## Milestones
- `milestone-spec-family` — completed: Create the cross-cutting widget UX framework spec and one planned subsystem UX spec for each Loom layer so implementation can proceed from bounded contracts instead of ad hoc UI ideas.

## Strategic Decisions
(none)
