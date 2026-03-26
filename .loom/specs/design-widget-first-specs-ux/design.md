---
id: design-widget-first-specs-ux
title: "Design widget-first specs UX"
status: specified
created-at: 2026-03-17T05:56:14.424Z
updated-at: 2026-03-17T05:58:07.061Z
research: []
initiatives: []
capabilities:
  - capability-spec-change-workspace
---

## Design Notes
Specifications are Loom's bounded change contracts. Their human-facing UX should feel like shaping a change from proposal through design and implementation planning, not like issuing low-level spec memory commands. The home widget should show active spec changes, blocked clarifications, analysis/checklist status, and the most important next contract-shaping actions.

Focused interaction should support change lists, proposal/detail views, design and tasks views, capability inspection, and ticket-projection review when a spec is mature enough. The subsystem must make it obvious where ambiguity still exists, what design has been captured, and what remains before implementation is responsibly unlocked.

The surviving human verbs should focus on opening the spec workspace, proposing a change, clarifying or planning a change, and reviewing readiness. Tool-mirroring verbs for read/write/analyze/project should become unnecessary once the UX makes those workflows direct.

## Capability Map
- capability-spec-change-workspace: Spec change workspace from proposal to readiness

## Requirements
- req-001: Focused views must support a list of changes plus drill-down into proposal, design notes, tasks, capabilities, analysis/checklist state, and ticket-projection readiness.
  Acceptance: A reviewer can identify how a user would propose a spec, resolve clarifications, shape design/tasks, and judge readiness from the subsystem UX alone.; The persistent widget and focused views separate overview, contract authoring, and readiness review clearly.; The spec UX makes bounded change quality legible instead of flattening everything into generic text editing.
  Capabilities: capability-spec-change-workspace
- req-002: The design must preserve the spec layer boundary by keeping strategic context above and live execution details below.
  Acceptance: A reviewer can identify how a user would propose a spec, resolve clarifications, shape design/tasks, and judge readiness from the subsystem UX alone.; The persistent widget and focused views separate overview, contract authoring, and readiness review clearly.; The spec UX makes bounded change quality legible instead of flattening everything into generic text editing.
  Capabilities: capability-spec-change-workspace
- req-003: The home widget must summarize active spec changes, clarifications waiting on answers, readiness blockers, and the next highest-value spec actions.
  Acceptance: A reviewer can identify how a user would propose a spec, resolve clarifications, shape design/tasks, and judge readiness from the subsystem UX alone.; The persistent widget and focused views separate overview, contract authoring, and readiness review clearly.; The spec UX makes bounded change quality legible instead of flattening everything into generic text editing.
  Capabilities: capability-spec-change-workspace
- req-004: The UI must support proposing a change, recording clarifications, shaping design and tasks, and reviewing whether the spec is ready for downstream execution without relying on tool-mirroring slash commands.
  Acceptance: A reviewer can identify how a user would propose a spec, resolve clarifications, shape design/tasks, and judge readiness from the subsystem UX alone.; The persistent widget and focused views separate overview, contract authoring, and readiness review clearly.; The spec UX makes bounded change quality legible instead of flattening everything into generic text editing.
  Capabilities: capability-spec-change-workspace
- req-005: The workspace must make ambiguity, dependencies, and acceptance expectations visible enough that a human can judge whether a spec is truly ready.
  Acceptance: A reviewer can identify how a user would propose a spec, resolve clarifications, shape design/tasks, and judge readiness from the subsystem UX alone.; The persistent widget and focused views separate overview, contract authoring, and readiness review clearly.; The spec UX makes bounded change quality legible instead of flattening everything into generic text editing.
  Capabilities: capability-spec-change-workspace
