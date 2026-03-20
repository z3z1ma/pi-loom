# @pi-loom/pi-workers

Pi Workers is a thin orchestration layer on top of Pi Ralph.

The package exists to add two things Ralph does not provide by itself:

- managed git worktrees for ticket-bound execution branches
- a durable manager layer that runs, pauses, steers, approves, escalates, and consolidates work between bounded Ralph iterations

Ralph remains the canonical bounded iteration engine. Workers are internal wrappers around Ralph runs in managed worktrees. Managers are the primary AI-facing interface.

## AI-facing tool surface

`pi-workers` now exposes a manager-first tool surface:

- `manager_list` — rediscover durable managers
- `manager_read` — inspect one manager, its linked workers, and pending manager output
- `manager_start` — create a manager and start its background orchestration loop
- `manager_wait` — block until the manager has something to say or finishes
- `manager_steer` — answer escalations, provide guidance, change the target ref, or approve/reject a worker, then let the background loop continue

There is intentionally no worker tool surface anymore. Workers are internal implementation details.

## Operating model

1. Start a manager from whatever bounded context you have: a spec, initiative, plan, ticket set, or broad free-text objective.
2. The background manager loop creates any missing research/planning/ticket structure it needs.
3. The background manager loop spawns internal workers as needed.
4. Each worker runs one bounded Ralph iteration at a time inside its own git worktree.
5. Between iterations, the manager inspects durable Ralph-backed worker state.
6. When a worker needs operator review or hits a blocker, the manager emits an update and waits.
7. Use `manager_wait` to block for those updates and `manager_steer` to answer them.
8. After review, the manager consolidates the worker branch into the target ref.

The manager is supposed to keep running in the background until it has something to say or until it finishes.

## Current scope

The current implementation is intentionally narrow and concrete:

- worker spawning is still ticket-driven once tickets exist
- managers may start from broader context and create those tickets later
- durable state lives in SQLite via pi-storage
- local worktrees remain ephemeral runtime state for the current clone

This package should stay simpler than Ralph, not more complicated than Ralph.

## Local use

```bash
cd packages/pi-workers
omp -e .
```
