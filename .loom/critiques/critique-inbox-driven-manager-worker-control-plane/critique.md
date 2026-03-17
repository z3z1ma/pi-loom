---
id: critique-inbox-driven-manager-worker-control-plane
title: "Critique inbox-driven manager-worker control plane"
status: resolved
verdict: pass
target: workspace:manager-worker-control-plane-next-phase
focus:
  - architecture
  - correctness
  - docs
  - edge_cases
  - maintainability
updated-at: 2026-03-16T05:15:08.786Z
open-findings: []
followup-tickets: []
---

## Review Question
Does the implemented inbox-driven manager-worker control plane satisfy the finalized successor spec and closed tickets t-0031 through t-0039 while preserving ticket primacy, bounded manager scheduling, runtime portability, and the intended SDK-first/RPC-fallback architecture?

## Packet Summary
workspace:manager-worker-control-plane-next-phase; 5 focus area(s); 0 roadmap; 0 initiative; 0 research; 0 spec; 9 ticket

## Focus Areas
architecture, correctness, docs, edge_cases, maintainability

## Scope Paths
- AGENTS.md
- packages/pi-plans
- packages/pi-ralph
- packages/pi-ticketing
- packages/pi-workers
- README.md

## Non-Goals
- Do not critique unrelated pre-existing code outside the touched scope unless it is now made incorrect by the new control-plane work.
- Do not demand a full actor mesh or sidecar architecture that this spec explicitly defers.

## Current Verdict
pass

## Top Concerns
(none)

## Runs
- run-001 [verification/needs_revision] fresh=yes Reviewer found four material concerns: `/manager resume ... run` records a fictitious running launch without executing it, scheduler resume candidates exclude workers unblocked by manager messages if their status is still blocked/waiting, the manager surface cannot resolve manager-owned inbox backlog directly, and `lastRuntimeKind` is persisted at prepare time rather than when execution actually starts.
- run-002 [verification/pass] fresh=no Post-fix review found no remaining material concern in the previously reported manager/scheduler/runtime issues. The control plane now executes and finalizes manager-driven resumes truthfully, schedules unblocked workers again, exposes manager-side inbox resolution, records runtime kind only when execution starts, and handles SDK setup failures without leaving false running state. Full workspace verification is green under lint, typecheck, and tests.

## All Findings
- finding-001 [bug/high/fixed] Manager resume command fakes a running launch without execution
- finding-002 [bug/high/fixed] Scheduler excludes legitimately unblocked workers from resume candidates
- finding-003 [architecture/high/fixed] Manager surface cannot resolve manager-owned inbox backlog
- finding-004 [unsafe_assumption/medium/fixed] lastRuntimeKind is updated at prepare time instead of execution time
