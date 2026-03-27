---
id: pi-chief-orchestration-overview
title: "Pi Chief orchestration overview"
status: archived
type: overview
section: overviews
topic-id: null
topic-role: legacy
publication-status: legacy-migration-debt
publication-summary: "Legacy readable doc with missing governed topic ownership metadata."
recommended-action: backfill-topic-metadata
current-owner: null
active-owners: []
audience:
  - ai
  - human
source: workspace:.
verified-at: null
verification-source: null
successor: null
successor-title: null
predecessors: []
retirement-reason: null
topics:
  - chief
  - daemon
  - manager
  - ralph
  - workers
outputs: []
upstream-path: null
---

# Pi Chief orchestration overview

Pi Chief is the manager-first orchestration layer above Pi Ralph.

The core idea is intentionally simple:

- a manager is a Ralph loop
- each worker is also a Ralph loop
- every worker is bound to exactly one ticket and exactly one git worktree
- a plain TypeScript daemon polls durable state between iterations
- the daemon only re-enters manager reasoning when no loops are running and the durable state says the manager must think again

This replaces the earlier bespoke manager runtime and the older worker-local protocol/state machine with a smaller, more truthful model.

## Public AI-facing surface

Normal sessions see only the manager-first tool family:

- `manager_list`
- `manager_read`
- `manager_start`
- `manager_wait`
- `manager_steer`

Workers are not an AI-facing tool surface. They are internal implementation details.

## Manager model

A durable manager record stores the orchestration container around one linked Ralph run:

- manager identity and broad objective
- target ref for eventual consolidation
- linked strategic refs such as initiative/spec/plan/tickets
- the linked manager Ralph run id
- child worker ids
- operator/manager message history

The manager's own bounded reasoning step happens through its linked Ralph run, not through a second custom execution substrate.

## Worker model

A worker is intentionally thin. It stores only what Pi Chief needs that Ralph does not already own:

- worker identity/title/objective/summary
- manager ref
- one ticket id
- one linked Ralph run id
- one managed git worktree descriptor
- pending instructions for the next worker iteration
- current launch attachment/runtime metadata
- a minimal orchestration status (`queued`, `running`, `waiting_for_manager`, `completed`, `failed`, `retired`)

The worker does not carry a second inbox/checkpoint/approval workflow on top of Ralph. When a worker Ralph iteration finishes successfully, the worker simply becomes `waiting_for_manager` so the manager can inspect the durable Ralph output and decide what happens next.

## Daemon model

The daemon is intentionally non-intelligent. It polls durable storage and applies a small set of deterministic rules:

- stop if the manager is terminal or waiting for operator input
- sleep while any manager or worker loop is currently running
- invoke the manager loop when no workers exist yet, when the manager's ticket set and worker set diverge, or when one or more workers are waiting for manager judgment

This keeps cost under control because the daemon does not poll the LLM provider. It polls storage and only invokes the LLM when actual reasoning is needed.

## Internal chief-loop tools

The manager's own Ralph loop sees two internal tools that ordinary sessions do not:

- `manager_reconcile` — ensure workers/worktrees exist for the current ticket set and start queued worker loops
- `manager_record` — persist manager-loop outcomes, operator messages, linked-ref changes, and worker state updates

These tools are reserved for the internal manager subprocess through `PI_CHIEF_INTERNAL_MANAGER=1` so the normal AI surface stays clean.

## Git consolidation seam

Pi Chief does not hardcode merge policy into TypeScript. The manager loop uses free-form git commands through the normal bash tool when it decides to merge or otherwise consolidate worker output into the target ref. After the git work is done, the manager records the truthful outcome back into durable chief state.

This keeps the intelligence seam in the model where it belongs: the manager decides *how* to review and merge, while the deterministic substrate keeps durable state and launches loops.

## Relationship to Pi Ralph

Pi Ralph remains standalone and directly usable. Pi Chief does not replace Ralph. Instead, Pi Chief adds:

- a durable manager record around a manager Ralph run
- managed git worktrees for child worker loops
- a polling daemon that multiplexes manager and worker Ralph loops through storage

The result is a smaller architecture with fewer overlapping concepts and less code than the earlier worker/manager runtime design.
