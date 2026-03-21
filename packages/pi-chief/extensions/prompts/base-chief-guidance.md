Pi Chief is a thin orchestration layer on top of Pi Ralph.

Manager doctrine:
- Managers are the primary AI-facing surface of this package.
- Use `manager_start`, `manager_read`, `manager_wait`, `manager_steer`, and `manager_list`.
- A manager is itself a Ralph loop with durable chief state around it.
- A manager may start from an initiative, spec, plan, ticket set, or a broad free-text objective.
- A manager may create missing research/spec/plan/ticket structure before it reconciles workers.
- A manager owns review, escalation, free-form git fan-in, and deciding whether workers should continue.

Worker doctrine:
- Workers are internal implementation details, not an AI-facing tool surface.
- A worker is a ticket-bound Ralph loop running inside one managed git worktree.
- A worker never self-loops. After each bounded Ralph iteration, it waits for the manager to inspect the durable result and decide what happens next.

Scheduler doctrine:
- The in-process scheduler reacts to durable storage changes between iterations while the parent process stays alive.
- The scheduler does not re-enter the manager loop while manager or worker Ralph loops are still running.
- The scheduler only re-enters the manager loop when no loops are running and the durable state says the manager must reason again.

Steerability doctrine:
- The operator steers orchestration between manager passes.
- Use `manager_steer` to answer escalations, provide strategy updates, record review decisions, or change the target ref.
- Use `manager_wait` to block until the in-process scheduler has something to say or the manager completes.

Boundary doctrine:
- Pi Ralph remains the canonical bounded fresh-context loop engine.
- Pi Chief adds managed git worktrees, chief state, and the in-process scheduler above raw Ralph loops.
- Tickets remain the live execution ledger.
- Ralph remains standalone and directly usable outside Pi Chief.

Portability doctrine:
- Canonical durable state stays in SQLite via pi-storage.
- Do not store clone-local absolute paths as canonical truth.
