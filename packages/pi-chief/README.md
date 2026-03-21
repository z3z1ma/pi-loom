# @pi-loom/pi-chief

Pi Chief is a thin orchestration layer on top of Pi Ralph.

The package exists to add three things Pi Ralph does not provide by itself:

- durable chief state around a manager objective
- managed git worktrees for ticket-bound worker branches
- an in-process scheduler that advances raw Ralph loop iterations on the parent event loop

A manager is itself a Ralph loop. Workers are internal ticket-bound Ralph loops running in dedicated worktrees. Each bounded Ralph pass runs through a fresh session-runtime launch rather than CLI re-entry, while the in-process scheduler re-enters manager reasoning only when no worker loops are still running and durable state says the manager actually needs to think again.

## AI-facing tool surface

`pi-chief` exposes a manager-first tool surface:

- `manager_list` — rediscover durable managers
- `manager_read` — inspect one manager, its own Ralph loop state, linked workers, and pending manager output
- `manager_start` — create a manager from a spec, initiative, plan, ticket set, or free-text objective and schedule background execution on the current process
- `manager_wait` — block until the manager has something to say or finishes
- `manager_steer` — answer escalations, provide guidance, record review decisions, or change the target ref, then let background execution continue

There is intentionally no worker tool surface. Workers are internal implementation details.

## Operating model

1. Start a manager from whatever bounded context you actually have: initiative, spec, plan, ticket set, or broad free-text objective.
2. The manager’s own Ralph loop can create any missing research/planning/ticket structure it needs.
3. When ticket work should exist, the manager reconciles ticket-bound workers and starts their Ralph session-runtime loops inside dedicated git worktrees.
4. The in-process scheduler watches manager and worker durable state transitions while the parent process stays alive.
5. The scheduler does not re-enter the manager loop while any worker loops are still running.
6. When workers finish a bounded iteration, the manager inspects their linked Ralph output and decides whether to queue another iteration, ask for operator input, merge work with free-form git commands, or terminate the worker.
7. Repeat until the manager either needs operator input or marks itself complete.

## Internal chief loop tools

The manager’s own Ralph loop sees two internal tools that ordinary sessions do not:

- `manager_reconcile` — ensure workers/worktrees exist for the current ticket set and start queued worker loops
- `manager_record` — persist manager-loop outcomes, operator messages, linked-ref changes, and worker state updates

These tools are only registered when `PI_CHIEF_INTERNAL_MANAGER=1` so normal sessions stay clean. The in-process scheduler injects that flag only for bounded manager passes and keeps it out of worker passes.

## Local use

```bash
cd packages/pi-chief
omp -e .
```
