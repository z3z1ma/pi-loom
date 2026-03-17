---
id: design-widget-first-constitution-ux
title: "Design widget-first constitution UX"
status: planned
created-at: 2026-03-17T05:56:14.023Z
updated-at: 2026-03-17T05:57:17.346Z
research: []
initiatives: []
capabilities:
  - capability-constitution-dashboard-and-editing
---

## Design Notes
The constitution subsystem is the project's durable policy surface. Its human experience should feel like steering project identity, not browsing raw markdown files. The persistent home widget should surface constitutional completeness, current focus, open constitutional questions, and any roadmap items needing attention. It is the operator's at-a-glance answer to whether the project still knows what it is trying to become.

Focused interaction should support a policy dashboard plus master-detail editing for vision, principles, constraints, roadmap items, and decision history. Because constitutional artifacts are high-friction and durable, the UI must make edit scope explicit: users should understand whether they are adjusting a stable principle, adding a decision record, or updating current roadmap focus. The design should privilege reviewability and deliberate change over fast casual mutation.

The surviving human verbs should center on opening the constitutional workspace, recording a constitutional decision, and reviewing or updating roadmap state. Tool-shaped verbs like raw read/write operations become obsolete once the workspace covers those flows.

## Capability Map
- capability-constitution-dashboard-and-editing: Constitution dashboard and deliberate policy editing

## Requirements
- req-001: Focused views must support dashboard, roadmap list/detail, and stable-artifact editing for vision, principles, and constraints with clear boundaries between those artifact types.
  Acceptance: A reviewer can identify how a human would inspect constitutional completeness, update roadmap focus, and record a durable policy decision from the subsystem UX alone.; The constitution spec distinguishes stable policy editing from mutable roadmap and decision-log workflows.; The persistent widget and focused views clearly support high-friction, deliberate constitutional work rather than treating it as generic CRUD.
  Capabilities: capability-constitution-dashboard-and-editing
- req-002: The constitution UX must support both project-wide orientation and drill-down into one artifact without falling back to tool-mirroring slash commands.
  Acceptance: A reviewer can identify how a human would inspect constitutional completeness, update roadmap focus, and record a durable policy decision from the subsystem UX alone.; The constitution spec distinguishes stable policy editing from mutable roadmap and decision-log workflows.; The persistent widget and focused views clearly support high-friction, deliberate constitutional work rather than treating it as generic CRUD.
  Capabilities: capability-constitution-dashboard-and-editing
- req-003: The design must preserve reviewability by exposing recent decisions and the rationale for policy changes alongside the editable artifact surfaces.
  Acceptance: A reviewer can identify how a human would inspect constitutional completeness, update roadmap focus, and record a durable policy decision from the subsystem UX alone.; The constitution spec distinguishes stable policy editing from mutable roadmap and decision-log workflows.; The persistent widget and focused views clearly support high-friction, deliberate constitutional work rather than treating it as generic CRUD.
  Capabilities: capability-constitution-dashboard-and-editing
- req-004: The home widget must summarize constitutional completeness, active focus, unresolved constitutional questions, and any roadmap items currently demanding attention.
  Acceptance: A reviewer can identify how a human would inspect constitutional completeness, update roadmap focus, and record a durable policy decision from the subsystem UX alone.; The constitution spec distinguishes stable policy editing from mutable roadmap and decision-log workflows.; The persistent widget and focused views clearly support high-friction, deliberate constitutional work rather than treating it as generic CRUD.
  Capabilities: capability-constitution-dashboard-and-editing
- req-005: The UI must make constitutional edits deliberately scoped so operators can tell whether they are recording a decision, revising stable policy, or updating roadmap execution focus.
  Acceptance: A reviewer can identify how a human would inspect constitutional completeness, update roadmap focus, and record a durable policy decision from the subsystem UX alone.; The constitution spec distinguishes stable policy editing from mutable roadmap and decision-log workflows.; The persistent widget and focused views clearly support high-friction, deliberate constitutional work rather than treating it as generic CRUD.
  Capabilities: capability-constitution-dashboard-and-editing
