# Hybrid branch-family allocation for Ralph worktree runs

## Purpose / Big Picture

Make worktree-backed Ralph execution truthful for real delivery workflows such as Jira follow-up work after an earlier branch was merged. The system must support a new Loom ticket under an existing external delivery ticket like UDP-100 and deterministically provision UDP-100-1 (or the next family member) without guessing from transient local branch state.

## Progress

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- [x] (2026-03-25T00:00:00.000Z) Inspected the current Ralph/worktree behavior and confirmed that option four requires a durable branch-family contract rather than better local-branch heuristics.
- [ ] (2026-03-25T00:00:00.000Z) Translate the hybrid design into implementation tickets after the plan is approved.

Linked ticket snapshot from the live execution ledger:
- [x] Ticket pl-0109 — Define canonical branch-family reservation contract (core-contract)
- [x] Ticket pl-0110 — Expose ticket-level branch intent and durable override controls (ticket-branch-intent)
- [x] Ticket pl-0111 — Allocate Ralph worktree branches through canonical reservations (ralph-integration)
- [x] Ticket pl-0112 — Align critique and docs worktree runtimes with branch reservation policy (sibling-runtime-alignment)
- [x] Ticket pl-0113 — Remove legacy branch heuristics and perform one-off catalog backfill (cleanup-and-backfill)
- [x] Ticket pl-0108 — Document the durable branch-family workflow for follow-up tickets (docs-and-guidance)

## Surprises & Discoveries

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Observation: Current ticket external refs are normalized and sorted, so 'first external ref' is not a stable semantic notion of branch identity.
  Evidence: ticketing/domain/normalize.ts sorts normalized string lists; ralph/domain/worktree.ts consumes the first external ref when preferExternalRefNaming is enabled.

- Observation: Ralph already has the right retry invariant: same bound run reuses the stored worktree/branch and does not allocate on each iteration.
  Evidence: ralph/domain/loop.ts creates worktree executionEnv only when ensureRalphRun creates the run, then later launches use run.state.executionEnv.worktreeRoot.

## Decision Log

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Decision: Keep Ralph run identity bound to ticket/plan and solve branch lineage with ticket/storage state instead of minting new run identities for follow-up work.
  Rationale: The user problem is about new execution tickets under the same external delivery ticket, not about changing Ralph's idempotent run model.
  Date/Author: 2026-03-25 / ChatGPT

- Decision: Prefer explicit branch-family metadata over implicit external-ref ordering.
  Rationale: External refs mix multiple concepts and are alphabetically normalized today, so they cannot serve as trustworthy branch lineage truth.
  Date/Author: 2026-03-25 / ChatGPT

## Outcomes & Retrospective

Planned outcome: Pi Loom can represent branch lineage truthfully across follow-up tickets and repositories without making Ralph infer merge history from git state. Retrospective should later record whether the ticket-level contract was enough for operators/AI to use correctly and whether additional lifecycle tooling was needed.

## Context and Orientation

Today Ralph is idempotent by bound ticket/plan and only chooses a worktree branch when the run is first created. That run model should remain. The broken part is branch selection: current code derives the base from ticket.ref or the alphabetically first external ref and only adds a suffix when a local branch already exists. That is not durable enough for merged follow-up work, multi-repository spaces, or tickets whose external refs mix plan/critique/Jira identifiers. This plan keeps Ralph bounded and moves branch-family truth into durable ticket and storage layers.

## Projection Context

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Status: active
- Source target: research:ralph-branch-family-allocation-for-worktree-runs
- Scope paths: https-github-com-z3z1ma-pi-loom-git:ralph, https-github-com-z3z1ma-pi-loom-git:ticketing, https-github-com-z3z1ma-pi-loom-git:storage, https-github-com-z3z1ma-pi-loom-git:docs, https-github-com-z3z1ma-pi-loom-git:critique, https-github-com-z3z1ma-pi-loom-git:README.md
- Research: ralph-branch-family-allocation-for-worktree-runs

## Milestones

Milestone 1: define the durable contract for branch intent and canonical allocation, including repository scoping, lifecycle semantics, and migration rules. Milestone 2: implement ticket/store/tool support for branch-family metadata and allocator-backed branch reservation. Milestone 3: wire Ralph and other worktree-backed runtimes to consume the new contract and stop relying on arbitrary external-ref ordering. Milestone 4: land migration/backfill, documentation, and tests that prove merged follow-up and multi-repository scenarios work truthfully.

## Plan of Work

First settle the domain contract before touching Ralph heuristics. Introduce explicit ticket-level branch intent and a canonical allocator keyed by repository and branch family. Then update worktree-backed consumers to request branch reservations from that allocator while preserving same-run reuse of already allocated branches. Only after the core contract is stable should migration, backfill, docs, and cleanup remove the old heuristic assumptions.

## Concrete Steps

1. Add an execution-oriented branch-intent model to tickets: branchFamily as the durable family key, branchMode or equivalent semantics for allocator behavior, and optional explicitBranchName as an escape hatch. Define whether this lives directly in ticket canonical state and projects into frontmatter, or in a ticket-owned execution envelope with truthful projections.
2. Add canonical storage support for branch-family allocation per repository. The allocator should reserve exact branch names, remember the relationship between repositoryId, branchFamily, exactBranchName, and the owning ticket/run context, and survive local branch deletion or clone turnover. Decide the minimum lifecycle states required (for example allocated, active, merged, retired) without turning this into a general branch-management system.
3. Refactor Ralph worktree setup so a new run in worktree mode asks the allocator for an exact branch name instead of calling resolveUniqueWorktreeName directly. Preserve the existing invariant that retries on the same Ralph run reuse executionEnv.branchName and executionEnv.worktreeRoot rather than allocating again.
4. Update sibling worktree-backed runtimes such as critique/docs launch helpers to consume the same reservation or reuse semantics where appropriate, so branch naming policy does not fork across subsystems.
5. Replace the current external-ref heuristic with migration/backfill logic. When an existing ticket has no branchFamily but does have an unambiguous Jira-like external ref, backfill branchFamily from that ref. If the external refs are ambiguous or internal-only, leave branchFamily unset and require operator input rather than silently guessing.
6. Add operator/tool override support. Ralph run inputs should allow an explicit branch override or equivalent emergency control, but this must write the chosen branch back into durable state so later retries and readers see the truth.
7. Remove stale assumptions after the new path lands: worktree helpers should stop treating the first external ref as canonical branch truth, tests should stop encoding that behavior, and docs/tool descriptions should explain the durable branch-family contract instead.

## Validation and Acceptance

Validation must prove observable workflow behavior rather than only unit-level transformations. Required coverage: (a) first Loom ticket under UDP-100 in repo A gets UDP-100, (b) later follow-up Loom ticket under the same family in repo A gets UDP-100-1 even when UDP-100 was merged and deleted locally, (c) the same family in a different repository gets its own first allocation rather than inheriting suffixes globally, (d) retries on the same Ralph run continue using the originally allocated branch/worktree, (e) explicit overrides are preserved durably and do not silently reallocate on rerun, (f) ambiguous legacy external refs fail truthfully instead of guessing a branch family, and (g) old external-ref ordering no longer changes branch outcomes.

## Idempotence and Recovery

The design must preserve Ralph's existing bound-run idempotence. Re-running ralph_run for the same ticket/plan must resolve to the same run and reuse its stored branch allocation. Branch reservation itself should be idempotent for the same ticket/run context and safe to retry after partial failures. If allocator-backed reservation succeeds but worktree provisioning fails, recovery must either reuse the same exact branch reservation on retry or surface a durable partial-failure state that prevents double allocation. Migration/backfill should be restartable and skip tickets already carrying explicit branch intent.

## Artifacts and Notes

Artifacts to produce during implementation: schema and model diffs for ticket/storage changes, allocator-focused tests, Ralph worktree integration tests, migration notes explaining how legacy tickets are interpreted, and updated documentation for operators creating follow-up Loom tickets under shared external delivery tickets. Keep examples concrete with Jira-style families such as UDP-100 -> UDP-100-1 because that is the core user-facing scenario.

## Interfaces and Dependencies

Key codepaths today are ralph/domain/loop.ts, ralph/domain/worktree.ts, ticketing/domain/store.ts, ticketing/domain/models.ts, ticketing/tool surfaces, and any shared storage contract required for canonical reservation records. The allocator contract should live below Ralph so future worktree-backed subsystems can share it. Ticket APIs must expose branch intent explicitly enough that AI and human operators can inspect and set it without spelunking externalRefs. Documentation and prompt guidance must be updated anywhere preferExternalRefNaming currently implies that the first external ref is the branch truth.

## Linked Tickets

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- pl-0109 [closed] Define canonical branch-family reservation contract — core-contract
- pl-0110 [closed] Expose ticket-level branch intent and durable override controls — ticket-branch-intent
- pl-0111 [closed] Allocate Ralph worktree branches through canonical reservations — ralph-integration
- pl-0112 [closed] Align critique and docs worktree runtimes with branch reservation policy — sibling-runtime-alignment
- pl-0113 [closed] Remove legacy branch heuristics and perform one-off catalog backfill — cleanup-and-backfill
- pl-0108 [closed] Document the durable branch-family workflow for follow-up tickets — docs-and-guidance

## Risks and Open Questions

No additional risks or open questions recorded.

## Revision Notes

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- 2026-03-25T00:00:00.000Z — Created the initial option-four execution plan.
  Reason: Capture the agreed hybrid branch-family strategy as a durable implementation plan before coding begins.

- 2026-03-25T06:57:07.572Z — Created durable workplan scaffold from research:ralph-branch-family-allocation-for-worktree-runs.
  Reason: Establish a self-contained execution-strategy artifact that can be resumed without prior chat context.

- 2026-03-25T07:06:09.175Z — Linked ticket pl-0108 as docs-and-guidance.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-25T07:06:33.161Z — Linked ticket pl-0109 as core-contract.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-25T07:06:42.216Z — Linked ticket pl-0110 as ticket-branch-intent.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-25T07:06:46.537Z — Linked ticket pl-0111 as ralph-integration.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-25T07:06:50.750Z — Linked ticket pl-0112 as sibling-runtime-alignment.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-25T07:06:55.967Z — Linked ticket pl-0113 as cleanup-and-backfill.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.
