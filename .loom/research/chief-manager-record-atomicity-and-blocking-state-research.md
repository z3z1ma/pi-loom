---
id: chief-manager-record-atomicity-and-blocking-state-research
title: "Chief manager_record atomicity and blocking-state research"
status: proposed
created-at: 2026-03-21T05:52:13.979Z
tags:
  - bug-scrub
  - chief
  - durable-state
source-refs:
  - packages/pi-chief/__tests__/runtime.test.ts
  - packages/pi-chief/__tests__/store.test.ts
  - packages/pi-chief/extensions/domain/manager-store.ts
---

## Question
Does pi-chief manager_record preserve truthful durable state when manager status and operator messages are mixed with worker updates that can fail validation or storage writes?

## Objective
Document a concrete orchestration-truth risk uncovered during the smoke-test repo bug scrub and capture the evidence needed for follow-up fixes.

## Status Summary
Investigating whether manager_record can leave untruthful durable manager state when operator output is appended before worker update validation and transaction execution.

## Scope
- packages/pi-chief/__tests__/runtime.test.ts
- packages/pi-chief/__tests__/store.test.ts
- packages/pi-chief/extensions/domain/manager-store.ts

## Non-Goals
- Do not broaden to unrelated worker scheduler behavior.
- Do not implement a fix in this bounded iteration.

## Methodology
- Cross-check existing tests for atomicity and blocking semantics.
- Read canonical manager store and runtime code.
- Record evidence-backed conclusions and next-step recommendations.

## Keywords
- atomicity
- manager_record
- orchestration truth
- pi-chief
- waiting_for_input

## Conclusions
(none)

## Recommendations
(none)

## Open Questions
- Should manager_record validate and stage operator messages before mutating in-memory manager state, or move all manager-side mutations fully inside the transaction/persist block?

## Linked Work
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

- ticket:pl-0090

## Hypotheses
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)

## Artifacts
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)
