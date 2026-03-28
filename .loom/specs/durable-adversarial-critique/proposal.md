---
id: durable-adversarial-critique
title: "Durable adversarial critique"
status: finalized
created-at: 2026-03-28T03:53:09.872Z
updated-at: 2026-03-28T03:54:00.371Z
research: []
initiatives: []
capabilities:
  - bounded-review-targets-and-contextual-packets
  - durable-runs-with-verdicts-evidence-and-risk
  - structured-findings-and-follow-up-actions
  - layer-boundaries-between-critique-execution-and-ralph
---

## Overview
Pi Loom maintains critique as the durable adversarial review layer for judging tickets, specs, initiatives, research, constitutional changes, documentation, or broader workspace targets against their intended contract and likely failure modes. A critique must preserve a bounded review question, packetized context, run verdicts, evidence, structured findings, and follow-up actions strongly enough that review survives beyond the current chat and remains distinct from execution or orchestration.

## Capabilities
- bounded-review-targets-and-contextual-packets: Bounded review targets and contextual packets
- durable-runs-with-verdicts-evidence-and-risk: Durable runs with verdicts, evidence, and residual risk
- structured-findings-and-follow-up-actions: Structured findings and follow-up actions
- layer-boundaries-between-critique-execution-and-ralph: Layer boundaries between critique, execution, and Ralph

## Requirements
- req-001: A critique SHALL preserve the target under review, the review question, the relevant focus areas, and explicit scope boundaries.
  Acceptance: A fresh reviewer can understand what is being reviewed and what standard it must satisfy.; The packet includes the context needed to judge the work, not just a diff.; Unknowns are recorded explicitly when evidence is incomplete.
  Capabilities: bounded-review-targets-and-contextual-packets
- req-002: Critique packets SHALL include the surrounding constitutional, research, initiative, spec, plan, ticket, and documentation context that materially shapes the review question.
  Acceptance: A fresh reviewer can understand what is being reviewed and what standard it must satisfy.; The packet includes the context needed to judge the work, not just a diff.; Unknowns are recorded explicitly when evidence is incomplete.
  Capabilities: bounded-review-targets-and-contextual-packets
- req-003: Missing or uncertain context SHALL be surfaced explicitly instead of hidden behind an overconfident verdict.
  Acceptance: A fresh reviewer can understand what is being reviewed and what standard it must satisfy.; The packet includes the context needed to judge the work, not just a diff.; Unknowns are recorded explicitly when evidence is incomplete.
  Capabilities: bounded-review-targets-and-contextual-packets
- req-004: The packet SHALL remain bounded and review-oriented rather than becoming a dump of uncurated transcript history.
  Acceptance: A fresh reviewer can understand what is being reviewed and what standard it must satisfy.; The packet includes the context needed to judge the work, not just a diff.; Unknowns are recorded explicitly when evidence is incomplete.
  Capabilities: bounded-review-targets-and-contextual-packets
- req-005: Critique history SHALL survive beyond the current session so later reviewers can continue from the last truthful state.
  Acceptance: A later reader can inspect the verdict and understand its basis.; Residual uncertainty remains visible when verification is incomplete.; Successive critique runs can build on one another without losing earlier review provenance.
  Capabilities: durable-runs-with-verdicts-evidence-and-risk
- req-006: Each critique run SHALL record a verdict, a substantial summary, the focus areas reviewed, and whether fresh context was used.
  Acceptance: A later reader can inspect the verdict and understand its basis.; Residual uncertainty remains visible when verification is incomplete.; Successive critique runs can build on one another without losing earlier review provenance.
  Capabilities: durable-runs-with-verdicts-evidence-and-risk
- req-007: Residual risk, missing evidence, or unverified assumptions SHALL remain explicit instead of being smoothed over by a pass verdict.
  Acceptance: A later reader can inspect the verdict and understand its basis.; Residual uncertainty remains visible when verification is incomplete.; Successive critique runs can build on one another without losing earlier review provenance.
  Capabilities: durable-runs-with-verdicts-evidence-and-risk
- req-008: Runs SHALL explain the evidence and reasoning chain strongly enough that later readers can understand why the verdict was reached.
  Acceptance: A later reader can inspect the verdict and understand its basis.; Residual uncertainty remains visible when verification is incomplete.; Successive critique runs can build on one another without losing earlier review provenance.
  Capabilities: durable-runs-with-verdicts-evidence-and-risk
- req-009: A finding SHALL explain why the issue matters and how it could fail, not merely state that something 'looks wrong.'
  Acceptance: A finding is actionable without replaying the review conversation.; Finding status tells later readers whether the issue still needs work or has been accepted or resolved.; Follow-up tickets preserve their critique origin instead of losing the review trail.
  Capabilities: structured-findings-and-follow-up-actions
- req-010: Accepted findings MAY be converted into follow-up tickets while preserving the critique provenance that motivated the execution work.
  Acceptance: A finding is actionable without replaying the review conversation.; Finding status tells later readers whether the issue still needs work or has been accepted or resolved.; Follow-up tickets preserve their critique origin instead of losing the review trail.
  Capabilities: structured-findings-and-follow-up-actions
- req-011: Finding lifecycle state SHALL distinguish open, accepted, rejected, fixed, or superseded conditions truthfully.
  Acceptance: A finding is actionable without replaying the review conversation.; Finding status tells later readers whether the issue still needs work or has been accepted or resolved.; Follow-up tickets preserve their critique origin instead of losing the review trail.
  Capabilities: structured-findings-and-follow-up-actions
- req-012: Findings SHALL preserve kind, severity, confidence, title, summary, evidence, affected scope, and recommended action as structured records.
  Acceptance: A finding is actionable without replaying the review conversation.; Finding status tells later readers whether the issue still needs work or has been accepted or resolved.; Follow-up tickets preserve their critique origin instead of losing the review trail.
  Capabilities: structured-findings-and-follow-up-actions
- req-013: Critique SHALL remain distinct from tickets, plans, docs, and Ralph runs rather than being flattened into their fields or journal text.
  Acceptance: Ralph can interact with critique without owning or replacing the critique layer.; Responding to critique does not destroy the review provenance itself.; Review history remains durable and queryable outside the execution transcript.
  Capabilities: layer-boundaries-between-critique-execution-and-ralph
- req-014: Documentation updates or plan changes that respond to critique SHALL not erase the original critique verdict or findings.
  Acceptance: Ralph can interact with critique without owning or replacing the critique layer.; Responding to critique does not destroy the review provenance itself.; Review history remains durable and queryable outside the execution transcript.
  Capabilities: layer-boundaries-between-critique-execution-and-ralph
- req-015: Ralph MAY launch or consume critique, but critique records SHALL remain independently useful whether or not a Ralph loop is active.
  Acceptance: Ralph can interact with critique without owning or replacing the critique layer.; Responding to critique does not destroy the review provenance itself.; Review history remains durable and queryable outside the execution transcript.
  Capabilities: layer-boundaries-between-critique-execution-and-ralph
- req-016: Ticket review status or chat self-review SHALL NOT be treated as a complete substitute for a durable critique record when adversarial review must survive beyond the current turn.
  Acceptance: Ralph can interact with critique without owning or replacing the critique layer.; Responding to critique does not destroy the review provenance itself.; Review history remains durable and queryable outside the execution transcript.
  Capabilities: layer-boundaries-between-critique-execution-and-ralph

## Clarifications
(none)
