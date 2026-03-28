---
id: strategic-initiative-tracking
title: "Strategic initiative tracking"
status: finalized
created-at: 2026-03-28T03:50:02.302Z
updated-at: 2026-03-28T03:50:53.807Z
research: []
initiatives: []
capabilities:
  - objective-scope-and-success-context
  - milestones-dependencies-and-risks
  - cross-layer-membership-and-roadmap-traceability
  - strategic-decisions-and-overview-rollups
---

## Overview
Pi Loom maintains initiatives as durable strategic outcome containers for long-horizon work that spans multiple specs, tickets, or research streams. An initiative must preserve objective, rationale, scope, milestones, success metrics, dependencies, risks, status summaries, and explicit links to research, specs, tickets, and roadmap context strongly enough that later planning and execution can inherit the strategy without turning the initiative itself into a task list or pseudo-spec.

## Capabilities
- objective-scope-and-success-context: Objective, scope, and success context
- milestones-dependencies-and-risks: Milestones, dependencies, and risks
- cross-layer-membership-and-roadmap-traceability: Cross-layer membership and roadmap traceability
- strategic-decisions-and-overview-rollups: Strategic decisions and overview rollups

## Requirements
- req-001: An initiative SHALL preserve a clear objective and intended outcomes so later work can understand why the program exists.
  Acceptance: A reader can explain what the initiative is trying to achieve and what is deliberately excluded.; Success criteria and ownership are visible without opening lower-layer artifacts first.; The initiative provides enough strategic context to justify later linked specs or plans.
  Capabilities: objective-scope-and-success-context
- req-002: Scope and non-goals SHALL remain explicit to prevent an initiative from expanding into an undefined bucket for any loosely related work.
  Acceptance: A reader can explain what the initiative is trying to achieve and what is deliberately excluded.; Success criteria and ownership are visible without opening lower-layer artifacts first.; The initiative provides enough strategic context to justify later linked specs or plans.
  Capabilities: objective-scope-and-success-context
- req-003: Success metrics, target window, owners, and strategic status summaries SHALL remain part of the initiative record so it can orient later prioritization and review.
  Acceptance: A reader can explain what the initiative is trying to achieve and what is deliberately excluded.; Success criteria and ownership are visible without opening lower-layer artifacts first.; The initiative provides enough strategic context to justify later linked specs or plans.
  Capabilities: objective-scope-and-success-context
- req-004: The initiative SHALL remain detailed enough to stand alone for strategic reasoning without replaying the originating chat.
  Acceptance: A reader can explain what the initiative is trying to achieve and what is deliberately excluded.; Success criteria and ownership are visible without opening lower-layer artifacts first.; The initiative provides enough strategic context to justify later linked specs or plans.
  Capabilities: objective-scope-and-success-context
- req-005: Dependencies and risks SHALL remain explicit enough that later plans can inherit the real sequencing constraints instead of improvising around hidden assumptions.
  Acceptance: A later planner can understand the major sequencing boundaries from the initiative alone.; Milestones remain distinct, individually addressable strategic checkpoints.; Risks and dependencies stay visible as the initiative evolves.
  Capabilities: milestones-dependencies-and-risks
- req-006: Milestone progress SHALL stay strategic rather than pretending to be ticket-by-ticket execution truth.
  Acceptance: A later planner can understand the major sequencing boundaries from the initiative alone.; Milestones remain distinct, individually addressable strategic checkpoints.; Risks and dependencies stay visible as the initiative evolves.
  Capabilities: milestones-dependencies-and-risks
- req-007: Milestones SHALL be durable initiative child records with stable identity, title, status, and description so broad progress can be tracked without flattening everything into prose.
  Acceptance: A later planner can understand the major sequencing boundaries from the initiative alone.; Milestones remain distinct, individually addressable strategic checkpoints.; Risks and dependencies stay visible as the initiative evolves.
  Capabilities: milestones-dependencies-and-risks
- req-008: Updating initiative status SHALL not erase or hide the risks and dependencies that continue to shape the program.
  Acceptance: A later planner can understand the major sequencing boundaries from the initiative alone.; Milestones remain distinct, individually addressable strategic checkpoints.; Risks and dependencies stay visible as the initiative evolves.
  Capabilities: milestones-dependencies-and-risks
- req-009: Adding or removing linked artifacts SHALL update the initiative's strategic context truthfully rather than leaving stale membership behind.
  Acceptance: A reader can discover the broader strategic container from linked specs or tickets.; Cross-layer linkage does not require the initiative to duplicate the full content of the linked records.; The initiative shows its upstream research and roadmap context explicitly.
  Capabilities: cross-layer-membership-and-roadmap-traceability
- req-010: An initiative MAY link to constitutional roadmap items, research records, spec changes, and tickets, but those linked artifacts SHALL remain authoritative for their own layer-specific truth.
  Acceptance: A reader can discover the broader strategic container from linked specs or tickets.; Cross-layer linkage does not require the initiative to duplicate the full content of the linked records.; The initiative shows its upstream research and roadmap context explicitly.
  Capabilities: cross-layer-membership-and-roadmap-traceability
- req-011: Cross-layer links SHALL make it possible to trace which strategic program a spec or ticket belongs to without inferring membership from filenames or chat memory.
  Acceptance: A reader can discover the broader strategic container from linked specs or tickets.; Cross-layer linkage does not require the initiative to duplicate the full content of the linked records.; The initiative shows its upstream research and roadmap context explicitly.
  Capabilities: cross-layer-membership-and-roadmap-traceability
- req-012: Initiative linkage SHALL help later readers understand both upstream rationale and downstream execution spread.
  Acceptance: A reader can discover the broader strategic container from linked specs or tickets.; Cross-layer linkage does not require the initiative to duplicate the full content of the linked records.; The initiative shows its upstream research and roadmap context explicitly.
  Capabilities: cross-layer-membership-and-roadmap-traceability
- req-013: Linked status rollups SHALL remain derived from canonical linked records rather than becoming a shadow execution ledger inside the initiative.
  Acceptance: A reader can inspect initiative decisions as durable provenance.; Overview data helps later planning or review rediscover the state of the initiative graph.; Rollups summarize linked work without replacing the authoritative lower-layer records.
  Capabilities: strategic-decisions-and-overview-rollups
- req-014: Overview surfaces SHALL summarize linked research, specs, tickets, milestones, and roadmap references in machine-usable form for later strategic reasoning.
  Acceptance: A reader can inspect initiative decisions as durable provenance.; Overview data helps later planning or review rediscover the state of the initiative graph.; Rollups summarize linked work without replacing the authoritative lower-layer records.
  Capabilities: strategic-decisions-and-overview-rollups
- req-015: Strategic decisions about an initiative SHALL be recorded durably with question, answer, and decision kind so the program's rationale survives beyond one session.
  Acceptance: A reader can inspect initiative decisions as durable provenance.; Overview data helps later planning or review rediscover the state of the initiative graph.; Rollups summarize linked work without replacing the authoritative lower-layer records.
  Capabilities: strategic-decisions-and-overview-rollups
- req-016: The initiative overview SHALL help later callers reason about status and gaps without flattening lower-layer truth into stale duplicates.
  Acceptance: A reader can inspect initiative decisions as durable provenance.; Overview data helps later planning or review rediscover the state of the initiative graph.; Rollups summarize linked work without replacing the authoritative lower-layer records.
  Capabilities: strategic-decisions-and-overview-rollups

## Clarifications
(none)
