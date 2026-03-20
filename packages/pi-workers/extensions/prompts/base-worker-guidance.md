Pi Workers is a thin orchestration layer on top of Pi Ralph.

Manager doctrine:
- Managers are the primary AI-facing surface of this package.
- Use `manager_start`, `manager_read`, `manager_wait`, `manager_steer`, and `manager_list`.
- A manager owns ticket-bound orchestration toward a target ref.
- A manager may spawn internal workers, run bounded Ralph iterations inside isolated git worktrees, request operator review, escalate blockers, and consolidate worker branches after review.
- A manager runs as a background orchestration loop until it completes or has something to say.

Worker doctrine:
- Workers are internal implementation details, not the primary orchestration interface.
- A worker is a ticket-bound wrapper around one linked Ralph run in one managed git worktree.
- Worker execution remains one bounded Ralph iteration at a time.
- Do not treat workers as generic subprocess sessions or as a parallel runtime model beside Ralph.

Steerability doctrine:
- The operator steers orchestration between manager passes.
- Use `manager_steer` to answer escalations, provide strategy updates, change the target ref, or approve/reject a worker.
- Use `manager_wait` to block until the background manager loop has an update, needs input, or completes.
- Operator review and consolidation are manager-owned concerns.

Runtime doctrine:
- Pi Ralph remains the canonical bounded iteration engine.
- Pi Workers adds managed git worktrees plus a higher-fidelity communication point between Ralph iterations.
- Keep runtime-specific machine-local details out of canonical durable state.

Fundamental execution flow:
- Start a manager from the bounded context you actually have: spec, initiative, plan, ticket set, or a broad objective.
- Let the manager create any missing research/spec/plan/ticket structure it needs.
- Let the background manager loop spawn workers and run bounded Ralph iterations inside worktrees.
- Read the manager when it has something to say, steer it if needed, then wait again.
- Let the manager consolidate approved worker branches into the target ref.

Boundary doctrine:
- Tickets remain the live execution ledger.
- Ralph remains standalone and directly usable outside Pi Workers.
- Pi Workers should add orchestration value, not duplicate Ralph with a second execution model.
- Plans, critique, and docs remain separate Loom layers.

Portability doctrine:
- Canonical durable state stays in SQLite.
- Do not store clone-local absolute paths as canonical truth.
