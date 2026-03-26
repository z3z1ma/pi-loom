# Pi Chief manager-as-Ralph cutover

## Purpose / Big Picture

Replace the bespoke manager runtime and worker-local protocol in the old package with a manager-first orchestration layer built directly on Pi Ralph loops, then rename the package to Pi Chief so the workspace and docs tell the truth about the role.

## Progress

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- [x] (2026-03-20T00:00:00Z) Created cutover plan and linked tickets for manager-as-Ralph, worker-state collapse, and pi-chief rename.
- [x] (2026-03-20T00:00:01Z) Rebased the manager runtime onto a linked Ralph run, simplified the daemon to poll durable state between iterations, and renamed internal chief-loop tools to reconcile/record semantics.
- [x] (2026-03-20T00:00:02Z) Collapsed worker state, renamed the package to pi-chief, updated docs/prompts/tests/root metadata, and passed focused chief plus Ralph verification.

Linked ticket snapshot from the live execution ledger:
- [x] Ticket pl-0080 — Refactor manager orchestration onto Ralph-backed chief loop (Manager Ralph loop cutover)
- [x] Ticket pl-0081 — Collapse worker state into a thin Ralph-backed worktree wrapper (Worker state simplification)
- [x] Ticket pl-0082 — Rename pi-workers package to pi-chief and align docs/tests (Package rename and docs alignment)

## Surprises & Discoveries

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Observation: The previous bespoke manager runtime was loading the Pi Ralph extension root instead of the workspace root, which meant manager subprocesses would not reliably see chief-internal tools; Pi Ralph runtime now resolves the workspace extension root from the working tree.
  Evidence: packages/pi-ralph/extensions/domain/runtime.ts now resolves the nearest package.json with pi.extensions from the provided cwd before falling back to the package-local Ralph root.

## Decision Log

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Decision: Rename the package to pi-chief while keeping the public manager_* tool family for now.
  Rationale: The package is no longer fundamentally about workers, but the manager term still accurately describes the public orchestration role. Renaming the package improves truth without forcing an unnecessary tool-family rename in the same cutover.
  Date/Author: 2026-03-20 / assistant

- Decision: Make the manager itself a Ralph loop rather than maintaining a bespoke manager AI runtime.
  Rationale: This collapses orchestration concepts onto one bounded loop primitive, reduces code, and lets the daemon multiplex durable Ralph iterations instead of owning a second execution model.
  Date/Author: 2026-03-20 / assistant

- Decision: Remove worker-local inbox/checkpoint/approval protocol instead of preserving legacy tolerance or compatibility shims.
  Rationale: The final model only needs manager ids, ticket ids, worktree descriptors, linked Ralph runs, pending instructions, and minimal status/outcome state on workers. Everything else duplicated Ralph or the manager loop.
  Date/Author: 2026-03-20 / assistant

## Outcomes & Retrospective

The package now tells the truth: it is a chief orchestration layer, not a worker CRUD surface. Managers and workers now share the same raw Ralph loop mechanism, the daemon multiplexes durable state rather than inventing a second execution engine, and the codebase is substantially smaller and cleaner than the earlier manager/worker runtime direction.

## Context and Orientation

Pi Chief is now the manager-first orchestration layer above Pi Ralph. Each manager owns one linked Ralph run for its own bounded reasoning. Each worker owns one linked Ralph run for one ticket in one managed git worktree. The TypeScript daemon only polls durable storage between iterations and only re-enters manager reasoning when no loops are running and worker state says the manager must think again. Free-form git consolidation remains a manager intelligence seam rather than a hardcoded TypeScript merge helper.

## Projection Context

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Status: completed
- Source target: workspace:.
- Scope paths: https-github-com-z3z1ma-pi-loom-git:AGENTS.md, https-github-com-z3z1ma-pi-loom-git:package-lock.json, https-github-com-z3z1ma-pi-loom-git:package.json, https-github-com-z3z1ma-pi-loom-git:packages/pi-chief, https-github-com-z3z1ma-pi-loom-git:packages/pi-ralph, https-github-com-z3z1ma-pi-loom-git:packages/pi-storage, https-github-com-z3z1ma-pi-loom-git:README.md
- Roadmap: item-003
- Research: ralph-backed-worker-manager-architecture-cutover
- Specs: add-inbox-driven-manager-worker-control-plane, add-ralph-loop-orchestration-extension, add-workspace-backed-manager-worker-substrate
- Tickets: pl-0080, pl-0081, pl-0082
- Docs: pi-chief-orchestration-overview

## Milestones

1. Manager became a Ralph-backed loop with a linked manager Ralph run and daemon-driven re-entry rules. 2. Worker state collapsed into a thin ticket/worktree/Ralph wrapper. 3. Package renamed from pi-workers to pi-chief across workspace registration, imports, docs, prompts, and tests. 4. Focused verification passed for chief and Ralph integration flows.

## Plan of Work

Implemented the cutover by first rebasing the manager runtime onto Ralph launches/resumes with explicit internal reconcile/record tools, then simplifying worker state and worker runtime behavior, then renaming the package and updating the surrounding repo documentation and imports, and finally running focused verification plus durable memory updates.

## Concrete Steps

- Manager state now stores one linked manager Ralph run id and no longer uses a bespoke manager prompt subprocess.
- The daemon now invokes manager Ralph iterations directly and only when storage says new manager reasoning is required.
- Internal chief-loop tools were renamed to manager_reconcile and manager_record.
- Worker state now stores manager id, ticket id, linked Ralph run id, worktree descriptor, pending instructions, summary, status, and launch metadata only.
- Pi Ralph runtime now resolves the workspace extension root from the working tree so worker and manager subprocesses can access the correct Loom tool surface.
- The package folder and package name are now packages/pi-chief and @pi-loom/pi-chief, with workspace/docs/tests updated accordingly.

## Validation and Acceptance

Focused chief tests passed (packages/pi-chief/__tests__/index.test.ts, prompt-guidance.test.ts, runtime.test.ts, store.test.ts, tools.test.ts, plus packages/pi-storage/__tests__/link-projection-execution.test.ts). Focused Ralph tests also passed (packages/pi-ralph/__tests__/runtime.test.ts, tools.test.ts, store.test.ts, index.test.ts, commands.test.ts). Changed-file TypeScript checks passed cleanly.

## Idempotence and Recovery

Canonical SQLite truth is preserved through the existing storage contract; the package cutover removed old package/runtime surfaces instead of adding shims. If a daemon or subprocess dies mid-run, the next daemon start or manager_wait still reasons from durable manager/worker/Ralph state rather than process memory. Package rename work was completed as a full cutover with no compatibility alias left behind.

## Artifacts and Notes

Durable outputs created during the cutover include research record ralph-backed-worker-manager-architecture-cutover, doc pi-chief-orchestration-overview, tickets pl-0080 through pl-0082, and this completed plan. Root README, AGENTS.md, and package metadata were updated alongside code.

## Interfaces and Dependencies

Public AI-facing interface remains manager_list, manager_read, manager_start, manager_wait, and manager_steer. Internal chief-loop tools are manager_reconcile and manager_record, gated behind PI_CHIEF_INTERNAL_MANAGER=1. Chief depends on Pi Ralph for loop execution/runtime, Pi Ticketing for ticket linkage/journaling, and Pi Storage for canonical persistence.

## Linked Tickets

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- pl-0080 [closed] Refactor manager orchestration onto Ralph-backed chief loop — Manager Ralph loop cutover
- pl-0081 [closed] Collapse worker state into a thin Ralph-backed worktree wrapper — Worker state simplification
- pl-0082 [closed] Rename pi-workers package to pi-chief and align docs/tests — Package rename and docs alignment

## Risks and Open Questions

Open questions remain around future policy refinement rather than stale architecture: whether the daemon should ever auto-reconcile missing workers when ticket sets change, and whether the public family should eventually move from manager_* to chief_* terminology. The architectural duplication and old worker-local protocol debt from the previous design have been removed.

## Revision Notes

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- 2026-03-20T00:00:00Z — Created the initial cutover plan.
  Reason: User requested a comprehensive plan plus implementation for the Pi Chief manager-as-Ralph redesign.

- 2026-03-20T20:28:57.397Z — Created durable workplan scaffold from workspace:..
  Reason: Establish a self-contained execution-strategy artifact that can be resumed without prior chat context.

- 2026-03-20T20:29:13.856Z — Linked ticket pl-0080 as Manager Ralph loop cutover.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-20T20:29:19.150Z — Linked ticket pl-0081 as Worker state simplification.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-20T20:29:24.711Z — Linked ticket pl-0082 as Package rename and docs alignment.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-20T00:00:00Z — Created the initial cutover plan.
  Reason: User requested a comprehensive plan plus implementation for the Pi Chief manager-as-Ralph redesign.

- 2026-03-20T00:00:02Z — Marked the plan completed and rewrote it around the landed Pi Chief architecture.
  Reason: Implementation finished, tickets closed, docs updated, and focused verification passed.

- 2026-03-20T21:12:45.677Z — Updated title, status, summary, purpose, context and orientation, milestones, plan of work, concrete steps, validation, idempotence and recovery, artifacts and notes, interfaces and dependencies, risks and open questions, outcomes and retrospective, scope paths, source target, context refs, progress, surprises and discoveries, decision log, revision notes.
  Reason: Keep the workplan aligned with the current execution strategy and observable validation story.
