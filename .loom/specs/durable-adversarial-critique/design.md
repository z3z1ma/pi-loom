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

## Design Notes
## Problem framing
Execution and planning quality cannot rely on optimistic self-reporting. Pi Loom therefore needs a review layer that survives beyond one chat and judges work against its contract, surrounding context, and likely failure modes.

## Desired behavior
A critique should behave as a durable adversarial review packet: it defines a bounded review target and question, compiles the relevant surrounding context, records run verdicts and evidence, and preserves actionable findings or follow-up work.

## Scope
This spec covers critique targets, packets, verdict-bearing runs, structured findings, ticketification of accepted findings, and the distinction between critique, execution, and Ralph orchestration.

## Non-goals
This spec does not turn critique into a generic chat commentary log or a replacement for tickets, specs, or docs. It also does not require every tiny edit to create a critique when ordinary verification is sufficient.

## Dependencies and adjacent specs
Critique depends on constitution, research, initiatives, specs, plans, tickets, and docs as review context, and it may create follow-up tickets when findings require execution. Ralph may invoke critique repeatedly, but critique remains its own durable layer.

## Risks and edge cases
The main risks are shallow verdicts with no evidence, findings that do not explain why they matter, or critique packets that omit the very context needed to judge correctness. Another risk is using ticket review status as a substitute for critique, which loses durable reasoning.

## Verification expectations
A conforming critique record can be read later and still explain what was reviewed, what question was asked, what context and evidence were considered, what verdict was reached, what residual risk remains, and what follow-up action is warranted.

## Provenance
Derived from README.md, critique layer guidance, critique tool contracts, and the critique extension wiring in the current repository.

## Open questions
The set of focus areas may evolve, but critique must remain a durable review primitive rather than a transient compliment or complaint surface.

## Capability Map
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
