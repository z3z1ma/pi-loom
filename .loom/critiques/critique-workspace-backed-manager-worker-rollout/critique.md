---
id: critique-workspace-backed-manager-worker-rollout
title: "Critique workspace-backed manager-worker rollout"
status: resolved
verdict: pass
target: workspace:workspace-backed-manager-worker-substrate-rollout
focus:
  - architecture
  - correctness
  - docs
  - edge_cases
  - maintainability
  - process
updated-at: 2026-03-16T01:27:06.700Z
open-findings: []
followup-tickets: []
---

## Review Question
Does the implemented workspace-backed manager-worker substrate satisfy the finalized spec and all closed rollout tickets while preserving ticket/plan/Ralph boundaries, portability constraints, and recovery/supervision semantics?

## Packet Summary
workspace:workspace-backed-manager-worker-substrate-rollout; 6 focus area(s); 1 roadmap; 1 initiative; 1 research; 1 spec; 12 ticket

## Focus Areas
architecture, correctness, docs, edge_cases, maintainability, process

## Scope Paths
- AGENTS.md
- package.json
- packages/pi-plans
- packages/pi-ralph
- packages/pi-ticketing
- packages/pi-workers
- README.md

## Non-Goals
- Do not critique unrelated pre-existing formatting churn outside touched files unless it changes reviewability or correctness.
- Do not request new features beyond the finalized spec.

## Current Verdict
pass

## Top Concerns
(none)

## Runs
- run-001 [verification/concerns] fresh=yes Fresh review found several real concerns in the worker substrate: workers can be created without linked tickets, consolidation can bypass approval, launch state is persisted as active before any subprocess starts and never updated after execution, retirement cleanup trusts arbitrary workspace paths too broadly, and architectural docs/constitutional enumerations still omit the worker layer in some places.
- run-002 [verification/pass] fresh=no After fixing the accepted findings, the worker substrate now enforces ticket-linked creation, requires approval before any consolidation outcome, keeps prepare-only launch state truthful, persists launch execution results durably, constrains retirement cleanup to managed runtime paths, and updates AGENTS/constitutional docs to include the worker layer. Independent post-fix spotchecks found no remaining documentation concern and no remaining correctness concern from the previously reported set. Workspace verification is green under lint, typecheck, and the full test suite.

## All Findings
- finding-001 [architecture/medium/fixed] Workers can be created without linked tickets
- finding-002 [bug/high/fixed] Consolidation bypasses approval gate
- finding-003 [unsafe_assumption/high/fixed] Prepared launches are persisted as active work
- finding-004 [bug/high/fixed] Worker execution results are not persisted back into launch state
- finding-005 [security/high/fixed] Retirement cleanup trusts arbitrary workspace paths too broadly
- finding-006 [docs_gap/medium/fixed] Governance documents still omit the worker layer in key enumerations
