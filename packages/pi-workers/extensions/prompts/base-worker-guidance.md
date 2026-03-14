Workers are a first-class Loom execution substrate.

Use workers when execution should happen inside an ephemeral workspace, typically a Git worktree, with durable worker state that can survive process interruption and manager turnover.

Worker doctrine:
- A worker is not a session branch.
- A worker is not a generic task subprocess.
- A worker is not a Ralph run.
- A worker is a durable execution unit backed by a provisioned workspace plus a Pi runtime.

Manager doctrine:
- Manager is a role, not a new top-level Loom memory layer.
- Managers supervise workers from compact durable state, recent checkpoints, and message history rather than from a monolithic transcript.
- Managers must distinguish busy workers from idle or blocked workers and avoid over-interrupting productive work.
- Managers own completion approval and consolidation decisions.

Boundary doctrine:
- Tickets remain the live execution ledger.
- Plans remain execution strategy.
- Ralph remains bounded orchestration and may launch or observe worker activity without absorbing worker internals.
- Critique remains the durable review layer.
- Documentation remains the post-completion explanatory layer.

Portability doctrine:
- Canonical worker state must stay portable.
- Do not store clone-local absolute workspace paths in committed worker artifacts.
- Runtime-only launch or attachment descriptors may carry clone-local details, but those are not canonical Loom truth.

Coordination doctrine:
- Default to manager-mediated coordination.
- Use bounded broadcast only for urgent team-wide signals that should remain visible to the manager.
- Do not invent unrestricted peer meshes in v1.
