---
id: loom-boundary-and-provenance-integration
title: "Loom boundary and provenance integration"
change: add-workspace-backed-manager-worker-substrate
updated-at: 2026-03-16T02:19:49.118Z
source-changes:
  - add-workspace-backed-manager-worker-substrate
---

## Summary
Integrate worker execution with existing Loom layers without diluting their responsibilities or duplicating their canonical records.

## Requirements
- Every worker SHALL link to at least one ticket and MAY link to plans, specs, research, initiatives, critiques, Ralph runs, and docs through explicit references instead of copied summaries.
- Ralph, plans, critique, and docs SHALL interact with workers through links, packets, launch descriptors, and evidence references rather than by absorbing worker internals into their own records.
- Tickets SHALL remain the canonical live execution ledger; worker state SHALL complement tickets with workspace execution details and SHALL be able to feed key checkpoints, approvals, or outcomes back into ticket history without replacing ticket truth.

## Scenarios
- A critique record reviews a consolidation outcome and references worker evidence without worker artifacts pretending to be critique.
- A plan spawns multiple ticket-attached workers and later links their approved outcomes back into the same execution slice.
- A Ralph run launches a manager process that supervises several workers while Ralph records only run-level decisions and refs.
