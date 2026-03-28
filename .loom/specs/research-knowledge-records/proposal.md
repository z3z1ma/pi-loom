---
id: research-knowledge-records
title: "Research knowledge records"
status: finalized
created-at: 2026-03-28T03:49:15.877Z
updated-at: 2026-03-28T03:50:07.275Z
research: []
initiatives: []
capabilities:
  - investigation-framing-and-lifecycle
  - explicit-hypotheses-with-evidence-and-results
  - artifact-backed-reusable-evidence
  - cross-layer-linkage-and-overview-rollups
---

## Overview
Pi Loom maintains a research memory layer for exploratory, ambiguous, and reusable discovery work. A research record must preserve the question, objective, scope, methodology, hypotheses, evidence, artifacts, conclusions, recommendations, open questions, and downstream links strongly enough that later agents can reuse the investigation without reconstructing the original conversation or repeating rejected paths.

## Capabilities
- investigation-framing-and-lifecycle: Investigation framing and lifecycle
- explicit-hypotheses-with-evidence-and-results: Explicit hypotheses with evidence and results
- artifact-backed-reusable-evidence: Artifact-backed reusable evidence
- cross-layer-linkage-and-overview-rollups: Cross-layer linkage and overview rollups

## Requirements
- req-001: Research MAY be skipped for narrow obvious fixes, but when discovery is material the investigation SHALL exist before downstream strategy or execution tries to compensate for missing evidence.
  Acceptance: A new reader can determine what the investigation is about, what it excludes, and whether it is still active.; Research lifecycle state distinguishes ongoing discovery from synthesized or retired work.; The record explains enough context that downstream layers do not need to reconstruct the original chat to understand why the research exists.
  Capabilities: investigation-framing-and-lifecycle
- req-002: Research records SHALL preserve the investigation question, objective, scope, non-goals, and methodology as first-class durable fields rather than burying them only in prose.
  Acceptance: A new reader can determine what the investigation is about, what it excludes, and whether it is still active.; Research lifecycle state distinguishes ongoing discovery from synthesized or retired work.; The record explains enough context that downstream layers do not need to reconstruct the original chat to understand why the research exists.
  Capabilities: investigation-framing-and-lifecycle
- req-003: Research status SHALL communicate whether the investigation is proposed, active, paused, synthesized, archived, or superseded so later work can reason about whether uncertainty is still live.
  Acceptance: A new reader can determine what the investigation is about, what it excludes, and whether it is still active.; Research lifecycle state distinguishes ongoing discovery from synthesized or retired work.; The record explains enough context that downstream layers do not need to reconstruct the original chat to understand why the research exists.
  Capabilities: investigation-framing-and-lifecycle
- req-004: Status summaries, conclusions, recommendations, and open questions SHALL remain explicit so readers can quickly understand the current position without losing the detailed context beneath it.
  Acceptance: A new reader can determine what the investigation is about, what it excludes, and whether it is still active.; Research lifecycle state distinguishes ongoing discovery from synthesized or retired work.; The record explains enough context that downstream layers do not need to reconstruct the original chat to understand why the research exists.
  Capabilities: investigation-framing-and-lifecycle
- req-005: Confidence changes SHALL be explainable from recorded evidence and results rather than from unexplained status flips.
  Acceptance: A reader can inspect the current hypothesis set and understand the state of the investigation's key claims.; Confidence levels are grounded in recorded evidence and results.; Earlier rejected paths remain visible so later investigators do not repeat them blindly.
  Capabilities: explicit-hypotheses-with-evidence-and-results
- req-006: Hypotheses SHALL record a statement, status, confidence, evidence, and results so readers can distinguish claims from supporting observations.
  Acceptance: A reader can inspect the current hypothesis set and understand the state of the investigation's key claims.; Confidence levels are grounded in recorded evidence and results.; Earlier rejected paths remain visible so later investigators do not repeat them blindly.
  Capabilities: explicit-hypotheses-with-evidence-and-results
- req-007: Rejected or superseded hypotheses SHALL remain durable history instead of being silently deleted once the investigation changes direction.
  Acceptance: A reader can inspect the current hypothesis set and understand the state of the investigation's key claims.; Confidence levels are grounded in recorded evidence and results.; Earlier rejected paths remain visible so later investigators do not repeat them blindly.
  Capabilities: explicit-hypotheses-with-evidence-and-results
- req-008: Research consumers SHALL be able to tell which findings are supported, rejected, still open, or later superseded.
  Acceptance: A reader can inspect the current hypothesis set and understand the state of the investigation's key claims.; Confidence levels are grounded in recorded evidence and results.; Earlier rejected paths remain visible so later investigators do not repeat them blindly.
  Capabilities: explicit-hypotheses-with-evidence-and-results
- req-009: Artifact records SHALL describe what was examined, how it was examined, and why the observation matters strongly enough that the evidence stands on its own.
  Acceptance: A later agent can read an artifact and understand its relevance without the original chat.; Artifacts can be associated with hypotheses instead of floating as ungrounded notes.; The system can distinguish different artifact kinds such as notes, experiments, sources, datasets, logs, or summaries.
  Capabilities: artifact-backed-reusable-evidence
- req-010: Artifacts MAY link to specific hypotheses when the artifact supports or rejects a claim, making the reasoning graph explicit.
  Acceptance: A later agent can read an artifact and understand its relevance without the original chat.; Artifacts can be associated with hypotheses instead of floating as ungrounded notes.; The system can distinguish different artifact kinds such as notes, experiments, sources, datasets, logs, or summaries.
  Capabilities: artifact-backed-reusable-evidence
- req-011: Research artifacts SHALL preserve a stable id, kind, title, summary, and current stored body so later readers can reuse the evidence package directly.
  Acceptance: A later agent can read an artifact and understand its relevance without the original chat.; Artifacts can be associated with hypotheses instead of floating as ungrounded notes.; The system can distinguish different artifact kinds such as notes, experiments, sources, datasets, logs, or summaries.
  Capabilities: artifact-backed-reusable-evidence
- req-012: Updating an artifact SHALL revise the current canonical artifact state for that artifact id rather than spawning ambiguous duplicate evidence records for minor revisions.
  Acceptance: A later agent can read an artifact and understand its relevance without the original chat.; Artifacts can be associated with hypotheses instead of floating as ungrounded notes.; The system can distinguish different artifact kinds such as notes, experiments, sources, datasets, logs, or summaries.
  Capabilities: artifact-backed-reusable-evidence
- req-013: Linked-work rollups SHALL help later layers rediscover upstream evidence before planning or execution begins.
  Acceptance: A reader can see which downstream artifacts rely on a research record.; Downstream layers can rediscover relevant research before opening related work.; Overview and map surfaces summarize the investigation graph without becoming a competing source of truth.
  Capabilities: cross-layer-linkage-and-overview-rollups
- req-014: Overview and map surfaces SHALL summarize linked hypotheses, artifacts, initiatives, specs, tickets, conclusions, recommendations, and unresolved references from canonical research state.
  Acceptance: A reader can see which downstream artifacts rely on a research record.; Downstream layers can rediscover relevant research before opening related work.; Overview and map surfaces summarize the investigation graph without becoming a competing source of truth.
  Capabilities: cross-layer-linkage-and-overview-rollups
- req-015: Research SHALL be able to link to initiatives, spec changes, and tickets without turning those links into replacements for the linked records themselves.
  Acceptance: A reader can see which downstream artifacts rely on a research record.; Downstream layers can rediscover relevant research before opening related work.; Overview and map surfaces summarize the investigation graph without becoming a competing source of truth.
  Capabilities: cross-layer-linkage-and-overview-rollups
- req-016: Research SHALL remain the evidence layer even when linked downstream work later becomes strategic, declarative, or execution-focused.
  Acceptance: A reader can see which downstream artifacts rely on a research record.; Downstream layers can rediscover relevant research before opening related work.; Overview and map surfaces summarize the investigation graph without becoming a competing source of truth.
  Capabilities: cross-layer-linkage-and-overview-rollups

## Clarifications
(none)
