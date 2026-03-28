---
id: design-widget-first-plans-ux
title: "Design widget-first plans UX"
status: archived
created-at: 2026-03-17T05:56:14.588Z
updated-at: 2026-03-28T00:10:35.587Z
research:
  - plan-and-ticket-orchestration-workflow-design
initiatives: []
capabilities:
  - capability-plan-workspace
---

## Design Notes
Plans are Loom's execution-strategy layer between specs/initiatives and tickets. Their human-facing UX should feel like understanding sequencing, milestones, risks, and linked-ticket coverage, not editing an opaque markdown blob through commands. The home widget should show active plans, milestone pressure, linked-ticket health, and the next planning action that matters.

Focused interaction should support a plan list, milestone and progress views, master-detail plan reading/editing, and linked-ticket coverage views. The subsystem should help the user answer whether a plan is coherent, current, and adequately linked to execution without collapsing into ticket-level live state management.

The surviving human verbs should center on opening plans, creating a new workplan, and updating plan progress or linking scope. Tool-mirroring verbs for raw packet or linking operations should become unnecessary once the UX makes plan maintenance direct.

## Capability Map
- capability-plan-workspace: Execution-strategy workspace with milestone and linkage views

## Requirements
- req-001: Focused views must support scanning plans, reading and editing one plan in detail, reviewing milestones and progress, and inspecting linked-ticket coverage or gaps.
  Acceptance: A reviewer can identify how a user would create a plan, inspect milestone/progress state, and verify linked-ticket coverage from the subsystem UX alone.; The persistent widget and focused views expose both portfolio-level plan health and single-plan detail.; The plan UX preserves the plan layer's focus on sequencing and execution narrative rather than duplicating live ticket state.
  Capabilities: capability-plan-workspace
- req-002: The design must preserve plans as execution-strategy artifacts rather than turning the subsystem into a ticket board or a spec editor.
  Acceptance: A reviewer can identify how a user would create a plan, inspect milestone/progress state, and verify linked-ticket coverage from the subsystem UX alone.; The persistent widget and focused views expose both portfolio-level plan health and single-plan detail.; The plan UX preserves the plan layer's focus on sequencing and execution narrative rather than duplicating live ticket state.
  Capabilities: capability-plan-workspace
- req-003: The home widget must summarize active plans, milestone pressure, revision freshness, and linked-ticket coverage signals that help a user spot stale or risky plans.
  Acceptance: A reviewer can identify how a user would create a plan, inspect milestone/progress state, and verify linked-ticket coverage from the subsystem UX alone.; The persistent widget and focused views expose both portfolio-level plan health and single-plan detail.; The plan UX preserves the plan layer's focus on sequencing and execution narrative rather than duplicating live ticket state.
  Capabilities: capability-plan-workspace
- req-004: The UI must support creating a plan, updating plan progress or revision notes, and reviewing ticket linkage without relying on tool-mirroring slash commands.
  Acceptance: A reviewer can identify how a user would create a plan, inspect milestone/progress state, and verify linked-ticket coverage from the subsystem UX alone.; The persistent widget and focused views expose both portfolio-level plan health and single-plan detail.; The plan UX preserves the plan layer's focus on sequencing and execution narrative rather than duplicating live ticket state.
  Capabilities: capability-plan-workspace
- req-005: The workspace must help users tell whether a plan is still truthful and sufficiently connected to real execution work.
  Acceptance: A reviewer can identify how a user would create a plan, inspect milestone/progress state, and verify linked-ticket coverage from the subsystem UX alone.; The persistent widget and focused views expose both portfolio-level plan health and single-plan detail.; The plan UX preserves the plan layer's focus on sequencing and execution narrative rather than duplicating live ticket state.
  Capabilities: capability-plan-workspace
