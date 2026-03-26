---
id: specification-layer-semantics
title: "Specification layer semantics"
status: active
type: concept
section: concepts
audience:
  - ai
  - human
source: workspace:workspace
topics:
  - behavior-contracts
  - layer-semantics
  - specifications
outputs: []
upstream-path: specs/README.md
---

# Specification layer semantics

Pi Loom treats a specification as a standalone declarative contract for intended system behavior.

A specification is not a work order, migration note, or patch plan. It should still make sense when read in isolation by someone who has not seen the current codebase or the originating chat. The spec names a stable capability or behavior slice, declares what must be true, explains why that behavior matters, and records the constraints, scenarios, acceptance signals, and edge cases that make the contract usable downstream.

## Core doctrine

- Specs describe what behavior must hold, not how the current code should be edited.
- Specs should remain valid even if the implementation strategy or rollout order changes.
- Specs may compose with neighboring specs, but each spec must stand on its own as a coherent contract for one bounded behavior slice.
- Plans translate accepted specs into implementation strategy and linked ticket sequencing.
- Tickets carry the live execution truth for that implementation work.

## Title doctrine

A spec title should read like the name of something the system supports, not like a to-do item.

Prefer stable capability names such as `Dark theme support`, `Offline draft recovery`, or `Critique layer durability` over delta-oriented titles such as `Add dark mode`, `Implement draft restore`, or `Refactor critique storage`.

This distinction matters because the title becomes part of the durable interface between research, initiatives, plans, tickets, critique, docs, and future agents. Delta-style titles couple the record to one moment's implementation plan. Capability-style titles keep the record truthful even after the implementation changes or the rollout is complete.

## Layer boundary implications

The spec layer is where bounded product intent becomes explicit enough to validate before execution.

- Research stays the evidence and discovery layer.
- Initiatives stay the strategic why/outcome layer and group related specs without replacing them.
- Specs stay the declarative behavior-contract layer.
- Plans stay the execution-strategy layer.
- Tickets stay the execution ledger.

If a document starts to read like rollout choreography, task sequencing, or code churn against the current tree, that content belongs in a plan or ticket rather than in the spec itself.

## Verification expectations

Cross-module guidance and quality gates should reinforce this doctrine. Prompt language, READMEs, tool descriptions, and adjacent-layer tests should all continue to describe specs as standalone declarative behavior contracts. Analysis and checklist logic should reject obviously delta-style titles so the rule is enforced, not merely suggested.
