---
id: durable-specification-lifecycle
title: "Durable specification lifecycle"
status: finalized
created-at: 2026-03-28T03:50:49.579Z
updated-at: 2026-03-28T03:51:41.165Z
research: []
initiatives: []
capabilities:
  - mutable-drafting-through-governed-finalization
  - behavior-first-capabilities-requirements-and-scenarios
  - clarification-history-and-lineage
  - quality-gates-and-readable-contract-surfaces
---

## Design Notes
## Problem framing
Pi Loom treats specifications as the declarative contract between upstream discovery/strategy and downstream planning/execution. Without an explicit spec-layer contract, teams drift into writing delta-style task lists, vague blurbs, or mutable pseudo-docs that do not survive code churn.

## Desired behavior
A specification should remain a bounded, self-contained behavior contract whose wording still makes sense if the implementation changes. The spec layer must preserve strong lifecycle boundaries between mutable drafting, finalization, and archival, and it must expose enough structure for later planning to inherit stable intent.

## Scope
This spec covers specification authoring and lifecycle state, clarification/decision history, capability and requirement structure, quality gates, canonical capability summaries, lineage, and the boundary between specs and plans/tickets.

## Non-goals
This spec does not restate the behavior of every individual product spec. It does not turn specs into execution plans or ticket ledgers. It also does not require every tiny localized fix to become a standalone spec.

## Dependencies and adjacent specs
The spec layer depends on research and initiatives when ambiguity or strategic context matters, on canonical storage for persistence, and on plans and tickets for downstream execution. Existing finalized specs for multi-repository spaces and documentation governance are examples of the kind of output this lifecycle must support, but are not redefined here.

## Risks and edge cases
The main risks are finalizing thin or implementation-coupled records, losing the difference between mutable and immutable states, or letting capability lineage become ambiguous when a spec is superseded or archived. Another risk is confusing canonical capability summaries with editable replacement specs.

## Verification expectations
A conforming spec record can be read in isolation and still explain the intended behavior, rationale, key scenarios, requirements, and acceptance expectations. Finalization should be blocked until the record is concrete enough to act as the downstream contract.

## Provenance
Derived from specs/README.md, spec tool/store contracts, analyzer and checklist semantics, existing finalized specs in the repository, and the spec extension wiring.

## Open questions
The specific decomposition of future product specs may evolve, but the lifecycle and quality-bar behaviors defined here must remain stable enough that downstream plans can trust finalized specs.

## Capability Map
- mutable-drafting-through-governed-finalization: Mutable drafting through governed finalization
- behavior-first-capabilities-requirements-and-scenarios: Behavior-first capabilities, requirements, and scenarios
- clarification-history-and-lineage: Clarification history and lineage
- quality-gates-and-readable-contract-surfaces: Quality gates and readable contract surfaces

## Requirements
- req-001: A spec SHALL begin life as a mutable draft that can be proposed, clarified, retitled, and specified before it becomes the durable contract for downstream work.
  Acceptance: Archived specs remain readable historical truth rather than disappearing or reopening implicitly.; Drafts can evolve until they are concrete enough to finalize.; Finalized specs are treated as immutable contract history.
  Capabilities: mutable-drafting-through-governed-finalization
- req-002: Archive SHALL remain a terminal historical state that preserves the finalized record and lineage instead of serving as a hidden mutable branch.
  Acceptance: Archived specs remain readable historical truth rather than disappearing or reopening implicitly.; Drafts can evolve until they are concrete enough to finalize.; Finalized specs are treated as immutable contract history.
  Capabilities: mutable-drafting-through-governed-finalization
- req-003: Finalization SHALL require the spec to have concrete capability and requirement detail strong enough to stand alone as intended behavior.
  Acceptance: Archived specs remain readable historical truth rather than disappearing or reopening implicitly.; Drafts can evolve until they are concrete enough to finalize.; Finalized specs are treated as immutable contract history.
  Capabilities: mutable-drafting-through-governed-finalization
- req-004: Once finalized, a spec SHALL become read-only for ordinary mutation so later work cannot silently rewrite governed contract history.
  Acceptance: Archived specs remain readable historical truth rather than disappearing or reopening implicitly.; Drafts can evolve until they are concrete enough to finalize.; Finalized specs are treated as immutable contract history.
  Capabilities: mutable-drafting-through-governed-finalization
- req-005: A specification SHALL name stable capabilities or behavior slices rather than implementation tasks or rollout deltas.
  Acceptance: A reader can understand what the system should support without reading implementation code.; Acceptance criteria are explicit enough to anchor planning and review.; Capabilities include concrete scenarios that illustrate expected behavior boundaries.
  Capabilities: behavior-first-capabilities-requirements-and-scenarios
- req-006: Capabilities SHALL link to concrete requirements and scenarios so the spec remains testable and understandable in isolation.
  Acceptance: A reader can understand what the system should support without reading implementation code.; Acceptance criteria are explicit enough to anchor planning and review.; Capabilities include concrete scenarios that illustrate expected behavior boundaries.
  Capabilities: behavior-first-capabilities-requirements-and-scenarios
- req-007: Design notes MAY record rationale, constraints, tradeoffs, provenance, and open questions, but the spec's core behavior SHALL still be legible from the capability/requirement/scenario structure.
  Acceptance: A reader can understand what the system should support without reading implementation code.; Acceptance criteria are explicit enough to anchor planning and review.; Capabilities include concrete scenarios that illustrate expected behavior boundaries.
  Capabilities: behavior-first-capabilities-requirements-and-scenarios
- req-008: Requirements SHALL include explicit acceptance criteria so downstream planning and review know what must be true when the capability is satisfied.
  Acceptance: A reader can understand what the system should support without reading implementation code.; Acceptance criteria are explicit enough to anchor planning and review.; Capabilities include concrete scenarios that illustrate expected behavior boundaries.
  Capabilities: behavior-first-capabilities-requirements-and-scenarios
- req-009: Canonical capability summaries derived from finalized specs SHALL preserve provenance back to their source specifications.
  Acceptance: A later reader can inspect how a spec's meaning was clarified before finalization.; Canonical capability summaries remain traceable to their source specs.; Lineage between earlier and later specs remains discoverable.
  Capabilities: clarification-history-and-lineage
- req-010: Clarifications or design decisions about a mutable spec SHALL be recorded durably rather than left only in chat.
  Acceptance: A later reader can inspect how a spec's meaning was clarified before finalization.; Canonical capability summaries remain traceable to their source specs.; Lineage between earlier and later specs remains discoverable.
  Capabilities: clarification-history-and-lineage
- req-011: Retitling or clarification updates SHALL preserve the same mutable spec identity instead of creating confusing duplicate drafts for small wording corrections.
  Acceptance: A later reader can inspect how a spec's meaning was clarified before finalization.; Canonical capability summaries remain traceable to their source specs.; Lineage between earlier and later specs remains discoverable.
  Capabilities: clarification-history-and-lineage
- req-012: Supersession metadata SHALL make it possible to trace which earlier specs a later spec refines or replaces.
  Acceptance: A later reader can inspect how a spec's meaning was clarified before finalization.; Canonical capability summaries remain traceable to their source specs.; Lineage between earlier and later specs remains discoverable.
  Capabilities: clarification-history-and-lineage
- req-013: Checklist and analysis artifacts SHALL remain derived review surfaces that help validate the spec itself while the draft is still mutable.
  Acceptance: A spec that fails the analyzer cannot finalize until blocking defects are fixed.; Downstream execution tools can trust a finalized spec as a stable behavior contract rather than a half-written note.; Readable proposal/design artifacts stay consistent with the underlying canonical record.
  Capabilities: quality-gates-and-readable-contract-surfaces
- req-014: Plans and tickets SHALL treat finalized specs as upstream behavioral input, while the spec layer itself SHALL avoid becoming an execution choreography surface.
  Acceptance: A spec that fails the analyzer cannot finalize until blocking defects are fixed.; Downstream execution tools can trust a finalized spec as a stable behavior contract rather than a half-written note.; Readable proposal/design artifacts stay consistent with the underlying canonical record.
  Capabilities: quality-gates-and-readable-contract-surfaces
- req-015: Proposal and design views SHALL remain readable summaries of the canonical spec record rather than alternate source-of-truth documents.
  Acceptance: A spec that fails the analyzer cannot finalize until blocking defects are fixed.; Downstream execution tools can trust a finalized spec as a stable behavior contract rather than a half-written note.; Readable proposal/design artifacts stay consistent with the underlying canonical record.
  Capabilities: quality-gates-and-readable-contract-surfaces
- req-016: The spec system SHALL analyze draft records for blocking defects such as empty summaries, missing capabilities, missing requirements, or delta-style titles before finalization.
  Acceptance: A spec that fails the analyzer cannot finalize until blocking defects are fixed.; Downstream execution tools can trust a finalized spec as a stable behavior contract rather than a half-written note.; Readable proposal/design artifacts stay consistent with the underlying canonical record.
  Capabilities: quality-gates-and-readable-contract-surfaces
