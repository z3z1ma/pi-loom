---
id: completion-approval-and-consolidation
title: "Completion approval and consolidation"
change: add-workspace-backed-manager-worker-substrate
updated-at: 2026-03-16T02:19:49.118Z
source-changes:
  - add-workspace-backed-manager-worker-substrate
---

## Summary
Require structured completion evidence and make the manager the explicit point of approval and fan-in for non-parallelizable consolidation work.

## Requirements
- Approved workers SHALL enter an explicit consolidation flow that records chosen fan-in strategy, validation outcome, merge or patch result, conflict state, and any rollback or follow-up requirement durably.
- Managers SHALL record explicit approve, reject_for_revision, or escalate decisions, and worker completion SHALL NOT imply automatic merge or fan-in.
- Workers SHALL request completion through a structured completion payload that records claimed scope complete, validation evidence, remaining risks, and workspace/branch state rather than by prose alone.

## Scenarios
- A worker claims completion but lacks required evidence, so the manager rejects the request and sends a structured revision message.
- A worker finishes an isolated feature slice and asks the manager to approve and merge it into a feature branch.
- Two workers complete related slices, and the manager sequentially fans them into the target branch while recording conflicts and validation results.
