---
id: critique-ticket-workbench-revamp
title: "Critique ticket workbench revamp"
status: resolved
verdict: pass
target: workspace:pi-loom
focus:
  - correctness
  - edge_cases
  - maintainability
  - tests
updated-at: 2026-03-17T20:12:07.718Z
open-findings: []
followup-tickets: []
---

## Review Question
Does the new ticket overlay workbench implementation fully replace the old interactive action-list model without breaking `/ticket` semantics, fallback behavior, or maintainability expectations?

## Packet Summary
workspace:pi-loom; 4 focus area(s); 0 roadmap; 0 initiative; 0 research; 1 spec; 4 ticket

## Focus Areas
correctness, edge_cases, maintainability, tests

## Scope Paths
- package.json
- packages/pi-ticketing/__tests__/commands.test.ts
- packages/pi-ticketing/extensions/commands/ticket.ts
- packages/pi-ticketing/extensions/ui/ticket-workbench-model.ts
- packages/pi-ticketing/extensions/ui/ticket-workspace.ts
- packages/pi-ticketing/README.md

## Non-Goals
- Do not evaluate visual taste beyond whether the interaction architecture and keyboard flow are coherent and truthful.
- Do not review unrelated pre-existing workspace typecheck failures outside pi-ticketing.

## Current Verdict
pass

## Top Concerns
(none)

## Runs
- run-001 [verification/needs_revision] fresh=yes Fresh-context review found three correctness issues in the overlay workbench: tab-driven detail selection could target the wrong ticket, failed detail loads could remain in an endless loading state, and closed-ticket status actions could offer invalid mutations when detail data was unavailable.
- run-002 [verification/pass] fresh=no Addressed all three critique findings by preserving the source-tab selection when entering Detail, surfacing summary-only fallback when detail loading fails without endless retry, and using summary state for closed-ticket status actions. Added regression tests for each edge case and re-ran the full pi-ticketing test package plus targeted Biome checks.

## All Findings
- finding-001 [bug/high/fixed] Preserve the selected ticket when switching into the Detail tab
- finding-002 [edge_case/medium/fixed] Surface failed detail loads instead of retrying forever
- finding-003 [edge_case/medium/fixed] Use summary state for closed-ticket status actions when detail is missing
