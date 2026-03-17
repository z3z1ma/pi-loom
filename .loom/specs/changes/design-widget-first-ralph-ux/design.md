---
id: design-widget-first-ralph-ux
title: "Design widget-first Ralph UX"
status: planned
created-at: 2026-03-17T05:56:15.232Z
updated-at: 2026-03-17T05:59:05.726Z
research: []
initiatives: []
capabilities:
  - capability-ralph-run-workspace
---

## Design Notes
Ralph is Loom's bounded orchestration layer for plan-execute-review loops. Its human-facing UX should feel like steering and understanding long-horizon runs rather than operating orchestration internals through slash commands. The home widget should surface active runs, waiting state, blocking verifier or critique signals, and the next decision that matters.

Focused interaction should support a run list, iteration timeline, run master-detail, verifier and critique linkage views, and decision controls for continue, pause, complete, halt, or escalate. The subsystem should make it easy to understand why a run is in its current state and what evidence is driving the next orchestration decision.

The surviving human verbs should center on opening Ralph, launching or resuming a run, and deciding or reviewing blocked runs. Tool-mirroring verbs for every run mutation should become unnecessary once the UX exposes the orchestration loop directly.

## Capability Map
- capability-ralph-run-workspace: Ralph run and iteration workspace

## Requirements
- req-001: Focused views must support scanning runs, inspecting one run in detail, reviewing iteration history, examining verifier and critique context, and acting on continuation decisions.
  Acceptance: A reviewer can identify how a user would inspect a Ralph run, review iteration/verifier state, and make a continuation decision from the subsystem UX alone.; The persistent widget and focused views cover both run-queue triage and one-run deep steering.; The Ralph UX keeps orchestration state intelligible and bounded rather than turning into a generic workflow engine surface.
  Capabilities: capability-ralph-run-workspace
- req-002: The design must preserve Ralph as an orchestration layer distinct from plans, tickets, critique, and workers.
  Acceptance: A reviewer can identify how a user would inspect a Ralph run, review iteration/verifier state, and make a continuation decision from the subsystem UX alone.; The persistent widget and focused views cover both run-queue triage and one-run deep steering.; The Ralph UX keeps orchestration state intelligible and bounded rather than turning into a generic workflow engine surface.
  Capabilities: capability-ralph-run-workspace
- req-003: The home widget must summarize active runs, waiting state, blocking verifier or critique signals, and the most important next orchestration actions.
  Acceptance: A reviewer can identify how a user would inspect a Ralph run, review iteration/verifier state, and make a continuation decision from the subsystem UX alone.; The persistent widget and focused views cover both run-queue triage and one-run deep steering.; The Ralph UX keeps orchestration state intelligible and bounded rather than turning into a generic workflow engine surface.
  Capabilities: capability-ralph-run-workspace
- req-004: The UI must support creating, launching, resuming, pausing, completing, halting, or escalating runs through direct workflows instead of tool-mirroring slash commands.
  Acceptance: A reviewer can identify how a user would inspect a Ralph run, review iteration/verifier state, and make a continuation decision from the subsystem UX alone.; The persistent widget and focused views cover both run-queue triage and one-run deep steering.; The Ralph UX keeps orchestration state intelligible and bounded rather than turning into a generic workflow engine surface.
  Capabilities: capability-ralph-run-workspace
- req-005: The workspace must make run state, decision rationale, and blocking evidence legible enough for a human to trust and steer long-horizon loops.
  Acceptance: A reviewer can identify how a user would inspect a Ralph run, review iteration/verifier state, and make a continuation decision from the subsystem UX alone.; The persistent widget and focused views cover both run-queue triage and one-run deep steering.; The Ralph UX keeps orchestration state intelligible and bounded rather than turning into a generic workflow engine surface.
  Capabilities: capability-ralph-run-workspace
