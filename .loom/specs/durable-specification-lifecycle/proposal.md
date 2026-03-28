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

## Overview
Pi Loom maintains specifications as behavior-first, implementation-decoupled contracts whose lifecycle moves from mutable drafting through governed finalization and optional archival. A specification must preserve proposal framing, design notes, capability summaries, requirements, scenarios, acceptance, clarification history, and lineage strongly enough that later planning and execution can rely on the spec as the intended behavior contract rather than as a migration note or task list.

## Capabilities
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

## Clarifications
(none)
