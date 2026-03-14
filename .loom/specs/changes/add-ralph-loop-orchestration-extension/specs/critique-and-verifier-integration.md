---
id: critique-and-verifier-integration
title: "Critique and verifier integration"
change: add-ralph-loop-orchestration-extension
updated-at: 2026-03-15T20:19:13.150Z
source-changes:
  - add-ralph-loop-orchestration-extension
---

## Summary
Drive Ralph revision decisions from external review and verifier signals while keeping critique as a separate Loom layer.

## Requirements
- Ralph SHALL be able to create or link critique targets, launch critique reviews, and persist references to critique verdicts and findings without copying critique internals into Ralph-owned records.
- Ralph SHALL ingest verifier outputs from linked plans, tickets, tests, diagnostics, or other external checks as structured evidence for continuation decisions.
- Ralph SHALL support review or approval pause points where the run waits for critique or operator input before another execution iteration may begin.

## Scenarios
- An operator requires approval before Ralph may continue after a risky change.
- Ralph consumes failed verifier output from a linked ticket or test run and schedules revision.
- Ralph launches a fresh critique after an execution iteration and waits for the verdict.
