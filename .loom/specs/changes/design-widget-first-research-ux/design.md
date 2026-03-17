---
id: design-widget-first-research-ux
title: "Design widget-first research UX"
status: planned
created-at: 2026-03-17T05:56:14.169Z
updated-at: 2026-03-17T05:57:17.541Z
research: []
initiatives: []
capabilities:
  - capability-research-workspace
---

## Design Notes
Research is Loom's discovery and evidence layer. Its human-facing UX should feel like managing lines of inquiry, evidence, and synthesis quality rather than issuing storage commands. The persistent home widget should surface active investigations, stale or blocked research, high-signal open questions, and the most useful next research actions.

Focused interaction should support browsing research records, drilling into hypotheses and artifacts, comparing evidence, and moving a record from exploratory work toward synthesis. Research also benefits from a strong master-detail model: the user should be able to scan multiple investigations while seeing one record's question, objective, hypotheses, artifacts, conclusions, and open questions in context.

The surviving human verbs should focus on opening the research workspace, starting a new investigation, and synthesizing or linking validated research. Tool-mirroring verbs for artifacts, hypotheses, and status updates should become unnecessary once the UI makes those flows direct.

## Capability Map
- capability-research-workspace: Research workspace for investigations, hypotheses, and evidence

## Requirements
- req-001: Focused views must support scanning a list of investigations, opening one record in detail, and drilling into hypotheses, artifacts, conclusions, and open questions without losing overall portfolio context.
  Acceptance: A reviewer can identify how a user would start a research effort, inspect evidence, revise a hypothesis, and synthesize conclusions from the subsystem UX alone.; The persistent widget and focused views together expose both portfolio-level and record-level research state.; The research spec keeps investigations legible as discovery records rather than generic notes or tickets.
  Capabilities: capability-research-workspace
- req-002: The design must preserve the research layer's role as evidence and discovery rather than letting execution details overwhelm the workspace.
  Acceptance: A reviewer can identify how a user would start a research effort, inspect evidence, revise a hypothesis, and synthesize conclusions from the subsystem UX alone.; The persistent widget and focused views together expose both portfolio-level and record-level research state.; The research spec keeps investigations legible as discovery records rather than generic notes or tickets.
  Capabilities: capability-research-workspace
- req-003: The home widget must highlight active research, stale or blocked investigations, unresolved high-signal questions, and suggested next research actions.
  Acceptance: A reviewer can identify how a user would start a research effort, inspect evidence, revise a hypothesis, and synthesize conclusions from the subsystem UX alone.; The persistent widget and focused views together expose both portfolio-level and record-level research state.; The research spec keeps investigations legible as discovery records rather than generic notes or tickets.
  Capabilities: capability-research-workspace
- req-004: The research UX must make it easy to see what evidence changed confidence in a hypothesis and what remains unresolved.
  Acceptance: A reviewer can identify how a user would start a research effort, inspect evidence, revise a hypothesis, and synthesize conclusions from the subsystem UX alone.; The persistent widget and focused views together expose both portfolio-level and record-level research state.; The research spec keeps investigations legible as discovery records rather than generic notes or tickets.
  Capabilities: capability-research-workspace
- req-005: The UI must support creating a new research record, updating status, adding or revising hypotheses, attaching artifacts, and progressing work toward synthesis.
  Acceptance: A reviewer can identify how a user would start a research effort, inspect evidence, revise a hypothesis, and synthesize conclusions from the subsystem UX alone.; The persistent widget and focused views together expose both portfolio-level and record-level research state.; The research spec keeps investigations legible as discovery records rather than generic notes or tickets.
  Capabilities: capability-research-workspace
