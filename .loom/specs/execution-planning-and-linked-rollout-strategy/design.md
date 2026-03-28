---
id: execution-planning-and-linked-rollout-strategy
title: "Execution planning and linked rollout strategy"
status: finalized
created-at: 2026-03-28T03:51:35.064Z
updated-at: 2026-03-28T03:52:23.187Z
research: []
initiatives: []
capabilities:
  - self-contained-novice-readable-workplans
  - bounded-packet-compilation-from-linked-context
  - linked-ticket-membership-without-shadow-ledgers
  - revision-discovery-and-recovery-discipline
---

## Design Notes
## Problem framing
Once behavior is understood, execution still needs a durable strategy layer that is broader than one ticket but narrower and more concrete than an initiative. Without that layer, ticket graphs fragment, strategy stays in chat, and later workers cannot tell why the rollout is sequenced the way it is.

## Desired behavior
A plan should act as a self-contained execution-strategy packet for a bounded slice of work. It should explain context, milestones, sequencing, validation, recovery, interfaces, risks, and linked tickets clearly enough that a newcomer can continue the work without prior transcript context.

## Scope
This spec covers plan authoring, required workplan sections, packet compilation from linked Loom context, linked ticket membership, integrated ticket materialization, progress/discovery/decision tracking, and the boundary between plans and tickets.

## Non-goals
This spec does not make plans the canonical execution ledger or a replacement for specs. It also does not require every tiny change to open a formal plan when the work is obviously narrow.

## Dependencies and adjacent specs
Plans depend on constitution, research, initiatives, specs, tickets, critique, and docs as upstream context sources, on storage for canonical persistence, and on tickets as downstream execution truth. The plan owns execution strategy and linked-ticket coordination, not the underlying behavior contract or live task history.

## Risks and edge cases
The main risk is letting plans degenerate into shallow chat checklists or, conversely, duplicate every live ticket detail until the plan becomes a shadow execution ledger. Another risk is losing revision history or recovery guidance, which makes resumed work brittle.

## Verification expectations
A conforming plan can be read in isolation and still explain why the work matters, what order it should happen in, what to validate, what can go wrong, and how to recover if work is interrupted. Linked tickets remain authoritative for their own acceptance and live status.

## Provenance
Derived from README.md, plans/README.md, plan tool/store semantics, and current plan rendering guidance in the repository.

## Open questions
Some execution slices may later deserve several plans, but each plan must remain a bounded, novice-readable strategy artifact rather than a chat residue dump.

## Capability Map
- self-contained-novice-readable-workplans: Self-contained novice-readable workplans
- bounded-packet-compilation-from-linked-context: Bounded packet compilation from linked context
- linked-ticket-membership-without-shadow-ledgers: Linked ticket membership without shadow ledgers
- revision-discovery-and-recovery-discipline: Revision, discovery, and recovery discipline

## Requirements
- req-001: A plan SHALL preserve purpose, context, milestones, plan of work, concrete steps, validation, recovery guidance, interfaces, risks, and retrospective sections as part of its durable execution strategy.
  Acceptance: A later worker can read the plan and understand what to do next and why.; Required sections remain explicit rather than implied.; Timestamped progress helps distinguish completed versus pending workplan milestones.
  Capabilities: self-contained-novice-readable-workplans
- req-002: Plan content SHALL favor execution strategy and rationale over code-diff trivia or conversational residue.
  Acceptance: A later worker can read the plan and understand what to do next and why.; Required sections remain explicit rather than implied.; Timestamped progress helps distinguish completed versus pending workplan milestones.
  Capabilities: self-contained-novice-readable-workplans
- req-003: Progress entries SHALL remain timestamped so later workers can distinguish current state from earlier planning intent.
  Acceptance: A later worker can read the plan and understand what to do next and why.; Required sections remain explicit rather than implied.; Timestamped progress helps distinguish completed versus pending workplan milestones.
  Capabilities: self-contained-novice-readable-workplans
- req-004: The rendered plan SHALL be self-contained enough that a newcomer can understand the work sequence and rationale from the plan alone.
  Acceptance: A later worker can read the plan and understand what to do next and why.; Required sections remain explicit rather than implied.; Timestamped progress helps distinguish completed versus pending workplan milestones.
  Capabilities: self-contained-novice-readable-workplans
- req-005: A plan SHALL be able to reference constitution, research, initiatives, specs, tickets, critique, and docs context as bounded execution input.
  Acceptance: A reader can tell what broader artifact anchors the plan.; Stale or accidental context refs can be corrected durably.; The plan packet exposes the right upstream context without pretending chat history is authoritative.
  Capabilities: bounded-packet-compilation-from-linked-context
- req-006: Context references SHALL support explicit replacement or removal so stale upstream context can be corrected truthfully.
  Acceptance: A reader can tell what broader artifact anchors the plan.; Stale or accidental context refs can be corrected durably.; The plan packet exposes the right upstream context without pretending chat history is authoritative.
  Capabilities: bounded-packet-compilation-from-linked-context
- req-007: Packet context SHALL remain a curated planning handoff rather than an unbounded transcript dump.
  Acceptance: A reader can tell what broader artifact anchors the plan.; Stale or accidental context refs can be corrected durably.; The plan packet exposes the right upstream context without pretending chat history is authoritative.
  Capabilities: bounded-packet-compilation-from-linked-context
- req-008: The plan's source target SHALL make it clear whether the execution slice is anchored to a workspace, initiative, spec, or research record.
  Acceptance: A reader can tell what broader artifact anchors the plan.; Stale or accidental context refs can be corrected durably.; The plan packet exposes the right upstream context without pretending chat history is authoritative.
  Capabilities: bounded-packet-compilation-from-linked-context
- req-009: Execution strategy changes SHALL update linked ticket roles or order truthfully without pretending the plan owns ticket journal history.
  Acceptance: A plan can coordinate several tickets without replacing ticket truth.; Linked-ticket order or role is visible as plan-local strategy metadata.; Ticket status rollups remain derived from live ticket records.
  Capabilities: linked-ticket-membership-without-shadow-ledgers
- req-010: Linked tickets SHALL represent active plan membership, while loose ticket context references SHALL remain distinct from active membership.
  Acceptance: A plan can coordinate several tickets without replacing ticket truth.; Linked-ticket order or role is visible as plan-local strategy metadata.; Ticket status rollups remain derived from live ticket records.
  Capabilities: linked-ticket-membership-without-shadow-ledgers
- req-011: Plan summaries MAY roll up linked ticket status, but they SHALL derive those views from live ticket records rather than storing a shadow status ledger inside the plan.
  Acceptance: A plan can coordinate several tickets without replacing ticket truth.; Linked-ticket order or role is visible as plan-local strategy metadata.; Ticket status rollups remain derived from live ticket records.
  Capabilities: linked-ticket-membership-without-shadow-ledgers
- req-012: Plans MAY materialize or link tickets, but each linked ticket SHALL remain a self-contained execution unit with its own acceptance and verification truth.
  Acceptance: A plan can coordinate several tickets without replacing ticket truth.; Linked-ticket order or role is visible as plan-local strategy metadata.; Ticket status rollups remain derived from live ticket records.
  Capabilities: linked-ticket-membership-without-shadow-ledgers
- req-013: Idempotence and recovery guidance SHALL explain how work can resume or be retried safely after interruption or partial completion.
  Acceptance: A later reader can understand how and why the plan changed over time.; Plan-level discoveries stay durable instead of vanishing into chat history.; Recovery steps exist for partial progress or interrupted execution.
  Capabilities: revision-discovery-and-recovery-discipline
- req-014: Plans SHALL preserve explicit discoveries and decisions that explain why the execution strategy changed.
  Acceptance: A later reader can understand how and why the plan changed over time.; Plan-level discoveries stay durable instead of vanishing into chat history.; Recovery steps exist for partial progress or interrupted execution.
  Capabilities: revision-discovery-and-recovery-discipline
- req-015: Revision notes SHALL form a durable audit trail for plan-level changes and their reasons.
  Acceptance: A later reader can understand how and why the plan changed over time.; Plan-level discoveries stay durable instead of vanishing into chat history.; Recovery steps exist for partial progress or interrupted execution.
  Capabilities: revision-discovery-and-recovery-discipline
- req-016: Updating a plan SHALL replace whole-list strategy records such as progress or discoveries truthfully rather than patching them implicitly by conversational implication.
  Acceptance: A later reader can understand how and why the plan changed over time.; Plan-level discoveries stay durable instead of vanishing into chat history.; Recovery steps exist for partial progress or interrupted execution.
  Capabilities: revision-discovery-and-recovery-discipline
