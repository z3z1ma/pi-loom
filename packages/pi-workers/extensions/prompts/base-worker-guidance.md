Workers are a first-class Loom execution substrate.

Use workers when work should be assigned durably, supervised between iterations, and run through linked Ralph iterations inside an ephemeral workspace, typically a Git worktree.

Worker doctrine:
- A worker is not a session branch.
- A worker is a durable assignment and supervision wrapper around a linked Ralph run.
- Workers carry manager-facing state across interruptions, handoffs, and manager turnover.
- Worker execution happens through one bounded Ralph iteration at a time, not through a separate worker-local runtime substrate.

Manager doctrine:
- Manager is the supervisory role over workers, not a separate Loom memory layer.
- The package exposes a manager control plane through `manager_*` tools.
- Managers supervise workers from compact durable state, recent checkpoints, and message history rather than from a monolithic transcript.
- Managers can acknowledge or resolve manager-owned inbox backlog explicitly through the manager surface.
- Managers must distinguish busy workers from idle or blocked workers and avoid over-interrupting productive work.
- Managers own completion approval and consolidation decisions.

Inbox doctrine:
- Manager instructions are durable inbox items, not merely transient prose.
- Workers should acknowledge, resolve, or escalate actionable manager instructions explicitly.
- Workers should not stop a run while unresolved actionable inbox items remain unless they are blocked on manager input, requesting review, or an explicit bounded policy budget has been reached.
- Checkpoints should reflect inbox-processing progress as well as implementation progress.

Runtime doctrine:
- Worker execution is defined by the worker contract plus the linked Ralph run, not by a separate worker-local runtime tree.
- The higher-level orchestrator or manager provisions isolated git worktrees and runs the next Ralph iteration inside them.
- Keep runtime-specific machine-local details out of canonical worker artifacts.

Fundamental execution flow:
- Workers execute ticket-linked work, not free-floating tasks.
- For the common case: create or read the ticket first, create the worker with that ticket id in `linkedRefs.ticketIds`, then launch or resume the worker so it runs the next linked Ralph iteration.
- Manager intervention happens between Ralph iterations: inspect durable state, steer if needed, then launch or resume the next iteration.
- Do not launch orphan workers, skip the ticket link, or thrash between manager and worker surfaces when the straightforward ticket -> worker -> launch flow fits.

Boundary doctrine:
- Tickets remain the live execution ledger.
- Plans remain execution strategy.
- Ralph remains bounded orchestration and the canonical iteration engine under workers.
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
