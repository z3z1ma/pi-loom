---
id: design-widget-first-ralph-ux
title: "Design widget-first Ralph UX"
status: specified
created-at: 2026-03-17T05:56:15.232Z
updated-at: 2026-03-17T05:59:05.726Z
research: []
initiatives: []
capabilities:
  - capability-ralph-run-workspace
---

## Overview
Define the human-facing Ralph orchestration experience around a persistent run-status widget, focused iteration/timeline/verifier views, and direct workflows for steering bounded loops without tool-mirroring commands.

## Capabilities
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

## Clarifications
(none)
