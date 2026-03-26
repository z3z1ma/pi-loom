# Production-readiness rollout for first-class multi-repository Loom spaces

## Purpose / Big Picture

Deliver first-class multi-repository Loom spaces as a truthful, ergonomic, and production-ready operating mode. The work must let Pi run from a parent directory above several repositories or from within any participating repository while preserving explicit space, repository, and worktree identity across canonical storage, human UX, AI tool surfaces, runtime launches, exported artifacts, and diagnostics. The plan exists because the current codebase already contains strong storage primitives but still operationally collapses most behavior to one cwd-derived repository; the rollout must therefore be executed as a coordinated cutover across storage, layer packages, runtime helpers, migrations, and tests rather than as isolated package-local patches.

## Progress

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- [x] (2026-03-24T12:02:00.000Z) Delivered first-class multi-repository runtime scope with worktree path resolution for Ralph, Critique, and Docs. Verified with comprehensive test suite pass.

Linked ticket snapshot from the live execution ledger:
- [x] Ticket pl-0096 — Deliver production-ready multi-repository Loom spaces (umbrella-epic)
- [x] Ticket pl-0097 — Cut over canonical space, repository, and worktree identity (identity-cutover)
- [x] Ticket pl-0098 — Implement multi-repository space discovery, enrollment, and selection flows (discovery-selection)
- [x] Ticket pl-0099 — Add repository-qualified addressing across Loom tools, stores, and graph surfaces (addressing-and-store-scope)
- [x] Ticket pl-0100 — Expose active scope diagnostics and repository-qualified operator UX (diagnostics-and-ux)
- [x] Ticket pl-0101 — Make path-bearing operations repository-safe (path-safety)
- [x] Ticket pl-0102 — Unify repository-targeted runtime propagation across Ralph, critique, docs, and nested sessions (runtime-propagation)
- [x] Ticket pl-0103 — Make export/import, migration, and degraded modes truthful for multi-repository spaces (migration-and-sync)
- [x] Ticket pl-0104 — Build the end-to-end multi-repository verification and regression suite (verification-gate)
- [x] Ticket pl-0105 — Update durable docs and operator guidance for multi-repository Loom spaces (docs-and-guidance)

## Surprises & Discoveries

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Observation: The current codebase is significantly closer at the storage substrate than at the runtime/tool-entrypoint layer.
  Evidence: Research `multi-repository-loom-coordination-readiness` found strong space/repository/worktree/entity primitives in `pi-storage`, while runtime and tool surfaces still collapse scope to one cwd.

- Observation: Ticketing already contains practical cross-repository coexistence behavior worth preserving as precedent.
  Evidence: `packages/pi-ticketing/extensions/domain/store.ts` already persists `owningRepositoryId` and avoids ticket prefix collisions across repositories within one space.

- Observation: Finalized specs cannot currently accept new initiative links after finalization.
  Evidence: Initiative creation encountered the error that the finalized spec `first-class-multi-repository-loom-spaces` cannot change initiative links, so the strategic relationship is currently preserved via roadmap/initiative context rather than direct reverse linkage.

## Decision Log

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Decision: Use the initiative `first-class-multi-repository-loom-spaces` as the source target for this work plan and carry the finalized spec in plan context refs rather than trying to mutate the finalized spec record.
  Rationale: The plan needs one durable strategic owner today, and the current implementation rejects post-finalization initiative-link updates on the spec itself. The plan must tell the truth about that limitation while still binding execution to the finalized specification.
  Date/Author: 2026-03-22 / OpenAI Codex

- Decision: Sequence the rollout as identity/storage cutover first, then tool/runtime scoping, then migration/export hardening, then production verification.
  Rationale: Wrong-repository safety depends on a single truthful scope model. Downstream tool and runtime work cannot converge safely until identity semantics stop being cwd-derived folklore.
  Date/Author: 2026-03-22 / OpenAI Codex

- Decision: Fail closed during partial adoption instead of preserving hidden cwd fallbacks.
  Rationale: The constitutional direction for Pi Loom prefers one truthful design over prolonged compatibility shims. In this initiative, silent fallback is more dangerous than temporary explicit errors because the failure mode is wrong-repository execution.
  Date/Author: 2026-03-22 / OpenAI Codex

## Outcomes & Retrospective

This section is intentionally future-facing at creation time. On completion, record the final production readiness outcome here: what shipped, what safety guarantees became true, what remaining follow-up work was consciously deferred, how the rollout compared with this plan, and which parts of the design proved more or less difficult than expected. Until then, the target outcome is a truthful multi-repository Loom operating model that can be resumed, audited, and extended without transcript archaeology or cwd folklore.

## Context and Orientation

## Big picture
Pi Loom already knows about spaces, repositories, worktrees, repository-owned entities, and canonical links in SQLite-backed storage. The missing contract is not data shape alone; it is operational truth. Today, `resolveWorkspaceIdentity(cwd)` and `openWorkspaceStorage(cwd)` derive one space/repository/worktree from one cwd. Layer stores and tools then reopen canonical storage through that cwd-scoped identity, while runtime helpers launch subprocesses or nested sessions with one cwd and uneven scope propagation. That behavior is acceptable for one-repository usage and unacceptable for the production target of one parent directory containing several service repositories.

## Governing context
- Roadmap item: `item-005` First-class multi-repository Loom spaces.
- Initiative: `first-class-multi-repository-loom-spaces`.
- Research: `multi-repository-loom-coordination-readiness`.
- Governing finalized specification: `first-class-multi-repository-loom-spaces`.

## Current state grounded in code
- Storage primitives already exist for spaces, repositories, worktrees, entities, links, events, and runtime attachments.
- Ticketing is the strongest current layer for multi-repo coexistence because it preserves `owningRepositoryId` and avoids ticket prefix collisions across repositories in one space.
- Plans, specs, and research already do much of their cross-layer lookup through canonical storage, which reduces migration risk.
- The main blockers are single-cwd identity bootstrap, repo-agnostic addressing, single-root runtime launches, path-bearing operations that still resolve against one cwd, incomplete multi-repo export semantics, weak worktree identity, and lack of end-to-end multi-repo verification.

## Plan posture
This is a full-cutover plan, not a compatibility-bridge plan. The repository constitution explicitly prefers one truthful design over long-lived shims. The execution strategy therefore aims to introduce one explicit multi-repo scope model and then remove or hard-fail legacy behavior that would silently invent synthetic repository identity or misroute work.

## Non-goals at the plan level
- Do not create a generic workflow engine.
- Do not treat clone-local runtime details as canonical shared truth.
- Do not defer correctness through indefinite legacy aliases or dual-path cwd semantics.
- Do not require a network-shared database to ship this milestone; the semantics must remain SQLite-first and future-backend-portable.

## Projection Context

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Status: active
- Source target: initiative:first-class-multi-repository-loom-spaces
- Scope paths: https-github-com-z3z1ma-pi-loom-git:CONSTITUTION.md, https-github-com-z3z1ma-pi-loom-git:packages/pi-constitution, https-github-com-z3z1ma-pi-loom-git:packages/pi-critique, https-github-com-z3z1ma-pi-loom-git:packages/pi-docs, https-github-com-z3z1ma-pi-loom-git:packages/pi-plans, https-github-com-z3z1ma-pi-loom-git:packages/pi-ralph-wiggum, https-github-com-z3z1ma-pi-loom-git:packages/pi-research, https-github-com-z3z1ma-pi-loom-git:packages/pi-specs, https-github-com-z3z1ma-pi-loom-git:packages/pi-storage, https-github-com-z3z1ma-pi-loom-git:packages/pi-ticketing, https-github-com-z3z1ma-pi-loom-git:README.md
- Roadmap: item-005
- Initiatives: first-class-multi-repository-loom-spaces
- Research: multi-repository-loom-coordination-readiness
- Specs: first-class-multi-repository-loom-spaces

## Milestones

## Milestone 1 — Canonical scope contract and identity cutover
Define and implement the canonical model for active space, active repository, and active worktree selection. Replace cwd-derived synthetic repository behavior with explicit discovery and selection semantics. Harden repository and worktree identity so clone-local runtime state remains attributable without collisions.

## Milestone 2 — Repository-qualified addressing across Loom surfaces
Thread the explicit scope model through tool schemas, slash-command flows, store APIs, refs, dashboard/query responses, path-bearing fields, and graph rendering so every repo-sensitive action is repository-safe and every ambiguous read/write path has a truthful disambiguation story.

## Milestone 3 — Runtime propagation and execution safety
Unify repository/worktree propagation across Ralph, critique, docs, constitutional/session initialization, verifier helpers, and nested harness sessions. Remove single-cwd launch assumptions from runtime-sensitive flows and ensure all code-sensitive execution targets explicit repository/worktree scope.

## Milestone 4 — Export/import, migration, and degraded-mode truthfulness
Make full-space export/import truly space-complete, make partial exports explicit, ship migration flows from legacy single-repo assumptions, and define how the system behaves when repositories or worktrees are unavailable locally.

## Milestone 5 — Production-readiness verification and rollout gating
Add comprehensive end-to-end coverage and release gates that prove the system can safely operate above multiple repositories. Production readiness is achieved only when wrong-repository execution, synthetic parent-directory identities, ambiguous path writes, and partial-export lies are mechanically prevented or detected.

## Plan of Work

## Workstream A — Canonical storage and identity
1. Redesign workspace bootstrap around explicit space selection rather than one cwd-implied repository.
2. Introduce space and repository enumeration/discovery primitives suitable for parent-directory startup.
3. Strengthen worktree identity to distinguish same-repo same-branch clones and detached worktrees.
4. Define canonical repository enrollment metadata and health/availability status.
5. Ensure all identity and migration logic remains portable to future shared backends.

## Workstream B — API and tool-surface scoping
1. Inventory every AI-facing tool and human-facing command whose semantics depend on cwd, path resolution, or repo-local execution.
2. Add explicit repository/worktree-aware parameters or repository-qualified refs where ambiguity exists.
3. Preserve ergonomic broad-first discovery at space scope and intentional narrowing to repository scope.
4. Standardize machine-readable repository qualification in result payloads so follow-up calls are safe.
5. Remove or hard-fail path and ref forms that cannot be made truthful in multi-repo mode.

## Workstream C — Runtime orchestration and subprocess propagation
1. Create one authoritative runtime scope propagation contract used by Ralph, critique, docs, and nested sessions.
2. Thread space/repository/worktree scope through runtime attachments, logs, and durable iteration artifacts.
3. Update fresh-process launches to execute against explicit repository/worktree targets instead of a guessed cwd.
4. Ensure queueing/locking behavior preserves per-repository identity rather than flattening runs into one workspace-wide cwd assumption.

## Workstream D — UX, diagnostics, and observability
1. Make active scope visible: current space, current repository, current worktree, discovery source, persisted binding source, ambiguity state.
2. Design compact repository-qualified identifiers for list/search/dashboard output.
3. Provide deterministic prompts and errors for ambiguous selections, unavailable repositories, stale bindings, and wrong-space refs.
4. Add operator-visible health views that distinguish canonical absence from local unavailability.

## Workstream E — Migration, export/import, and release safety
1. Migrate legacy single-repo state into explicit multi-repo semantics without data loss or semantic drift.
2. Make export/import semantics truthful at space vs repository scope.
3. Build regression tests that enforce safe failure under ambiguity and safe success under explicit scope.
4. Define rollout gates that require end-to-end evidence before the feature is considered production-ready.

## Concrete Steps

## Step 1 — Inventory and classify every single-cwd assumption
Audit storage bootstrap, all `create*Store(ctx.cwd)` entrypoints, projected-link resolution assumptions, path-bearing fields, runtime launch helpers, sync/export helpers, diagnostics, and any direct `cwd` usage that chooses repository identity. Produce a concrete implementation matrix that classifies each call site into one of: safe at space scope, requires repository qualification, requires worktree qualification, or must be deleted.

## Step 2 — Introduce the canonical scope model
Implement the explicit active-scope abstraction used across packages: active space, optional active repository, optional active worktree, plus discovery provenance and ambiguity state. This should become the only authoritative model for startup and follow-up operations. It must be serializable, inspectable, and usable by both tool and UI layers.

## Step 3 — Replace identity bootstrap
Refactor storage bootstrap so `resolveWorkspaceIdentity(cwd)`-style behavior no longer invents a single repository from a parent directory. Introduce discovery and selection APIs that enumerate spaces and repositories truthfully. Preserve the single-repo case as the unambiguous special case of the new model.

## Step 4 — Harden repository and worktree identity
Replace weak worktree logical keys with a collision-resistant identity scheme that can distinguish multiple clones/worktrees of the same repository on the same branch. Ensure runtime attachments, exports, and diagnostics bind to this stronger identity.

## Step 5 — Thread repository-safe addressing through tools and stores
Update ticket, plan, spec, research, critique, Ralph, docs, and constitutional tool families so repo-sensitive actions can accept explicit repository/worktree scope or repository-qualified refs. At the same time, preserve broad-first discovery surfaces at space scope. Ensure machine-readable results always carry enough qualification for safe follow-up.

## Step 6 — Fix path-bearing semantics
Audit every field or API that accepts or emits a path: attachments, checkpoints, scope paths, docs output paths, runtime artifacts, launch descriptors, and any repo-local markdown references. Make repository qualification explicit whenever one active repository is not guaranteed. Reject ambiguous bare relative paths.

## Step 7 — Unify runtime propagation
Define one runtime-scope payload shared by Ralph, critique, docs, and any nested harness session. Replace per-package cwd-only launch assumptions with explicit repository/worktree targets plus the active space context needed for canonical record lookups. Ensure runtime artifacts preserve repository/worktree attribution.

## Step 8 — Make export/import truthful
Refactor sync/export/import so full-space exports include all repositories/worktrees and partial exports are explicit. Ensure hydration preserves repository and worktree identity instead of rebinding to importer cwd. Add conflict reporting that names the affected repository/worktree scope.

## Step 9 — Implement degraded-mode behavior
Add repository availability and worktree availability handling so space-level reads continue even when some repositories are not locally attached, while repo-sensitive execution fails with clear, actionable guidance.

## Step 10 — Build comprehensive verification coverage
Create end-to-end tests using temporary parent directories containing multiple git repositories and multiple clones/worktrees of the same repository. Cover ambiguous startup, explicit space selection, repository-qualified reads/writes, runtime launches, path safety, export/import, migration, stale bindings, unavailable repositories, and wrong-space protection.

## Step 11 — Execute final cutover and cleanup
Remove obsolete single-cwd shortcuts that would reintroduce synthetic repository identities or silent wrong-repository execution. Update high-level documentation and durable docs memory after implementation reality is accepted. Only then declare the feature production-ready.

## Validation and Acceptance

## Outcome-focused acceptance
The rollout is complete only when all of the following are observable and reproducible:
1. Starting Pi from a parent directory above multiple enrolled repositories results in either a truthful active space or a deterministic selection/error path; it never invents a synthetic repository identity.
2. Broad space-level discovery can list and search plans, tickets, specs, and related entities across multiple repositories, while repo-sensitive writes, file operations, and runtime launches require or inherit explicit repository/worktree scope.
3. Identically named or similarly structured paths across different repositories cannot be accidentally read from or written to through bare ambiguous inputs.
4. Ralph, critique, docs, and any nested runtime helpers preserve explicit repository/worktree targeting in their launches, artifacts, diagnostics, and failure reports.
5. Full-space export/import reproduces the same repository graph and cross-repository links on another machine without collapsing records to the importer cwd.
6. Two clones or worktrees of the same repository on the same branch retain distinct worktree identities and runtime attachments.
7. Degraded modes remain truthful: unavailable repositories stay visible at space scope, but code-sensitive actions against them block with actionable diagnostics.
8. Migration from legacy single-repository behavior preserves prior canonical history while eliminating synthetic cwd-based repository assumptions.

## Required verification layers
- Unit coverage for identity normalization, repository/worktree scoping, ambiguity detection, path normalization, export/import metadata, and migration transforms.
- Integration coverage for tool/store/runtime interplay across multiple repositories in one parent directory.
- End-to-end scenario coverage for parent-directory startup, explicit repository selection, cross-repository plan/ticket/spec flows, and runtime launches.
- Negative tests for wrong-space refs, ambiguous bare paths, stale persisted bindings, missing repositories, conflicting worktree identities, and misleading partial exports.
- Regression gates specifically asserting that parent-directory startup no longer falls back to cwd-as-repository and that repo-sensitive operations cannot proceed under ambiguity.

## Release gate
Do not mark the initiative production-ready until the complete multi-repository suite passes and manual smoke testing confirms the parent-directory UX, repository-qualified tool flows, and runtime propagation behavior in realistic multi-repo fixtures.

## Idempotence and Recovery

## Idempotence
- Discovery and selection operations must be repeatable without duplicating spaces, repositories, or worktrees.
- Enrollment operations must be safe to rerun against already enrolled repositories.
- Migration steps must be written so partially completed runs can be resumed or retried without creating duplicate canonical identities.
- Export/import hydration must be conflict-aware and repeatable when the incoming state matches existing state.

## Recovery strategy
- Before any breaking schema or identity migration, back up the catalog and preserve enough metadata to reconstruct the pre-cutover mapping.
- Roll storage and identity changes behind explicit migration checkpoints so failures can stop before repo-sensitive tool/runtime cutover if needed.
- If tool/runtime surfaces ship before all downstream packages are updated, fail closed: ambiguous or unsupported multi-repo actions must error rather than using legacy cwd fallbacks.
- Keep a clear recovery story for stale bindings, moved repositories, detached worktrees, and partially imported bundles.
- Maintain a migration ledger or equivalent durable evidence so operators can see which repositories/spaces were upgraded and which still require intervention.

## Artifacts and Notes

## Expected artifacts
- Durable plan packet and rendered plan.
- Updated canonical storage and identity records for spaces, repositories, and worktrees.
- New or revised runtime attachment and launch-descriptor conventions carrying repository/worktree scope.
- Multi-repo integration fixtures and temporary-workspace test helpers.
- Updated documentation memory explaining the accepted operating model after landing.

## Key implementation notes
- Tickets are already the strongest foundation for cross-repo coexistence; reuse that evidence rather than reinventing ownership semantics elsewhere.
- Plans/specs/research already rely on canonical storage for much of their cross-layer lookup; preserve that advantage and eliminate remaining path-based shortcuts.
- The current inability to back-link a finalized spec to a new initiative is a known graph limitation. Do not solve multi-repo execution by papering over that limitation with chat-only context; handle it explicitly in planning and, if needed, in follow-up graph-hardening work.
- Keep all repository-qualified renderings compact enough for AI follow-up, but never at the cost of ambiguity.

## Interfaces and Dependencies

## Upstream dependencies
- Constitution and roadmap context define this as the next active roadmap item.
- Research `multi-repository-loom-coordination-readiness` provides the evidence base for current gaps.
- Finalized spec `first-class-multi-repository-loom-spaces` defines the desired production behavior.

## Internal interfaces likely to change
- Storage identity resolution and workspace opening APIs in `packages/pi-storage/storage`.
- Repository/worktree records and any discovery/enrollment APIs.
- Tool schemas across ticket, plan, spec, research, critique, Ralph, docs, and constitution layers.
- Store constructors and any API that currently assumes `ctx.cwd` is sufficient to resolve scope.
- Runtime launch helpers for Ralph, critique, and docs.
- Export/import helpers in `pi-storage`.
- Dashboard and render helpers that must display repository qualification.
- Test helpers and fixture generators for seeded git repositories and multi-clone setups.

## External/behavioral interfaces
- Human slash-command UX and widget/home surfaces.
- AI-facing tool contracts and machine-readable payloads.
- Durable canonical identifiers and repository-qualified refs.
- Export/import bundle metadata and backup procedures.

## Coupling warnings
This initiative is inherently cross-package. Identity changes land first, but tool addressing, runtime propagation, path handling, and verification must converge on the same scope model. Partial adoption is itself a product bug.

## Linked Tickets

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- pl-0096 [closed] Deliver production-ready multi-repository Loom spaces — umbrella-epic
- pl-0097 [closed] Cut over canonical space, repository, and worktree identity — identity-cutover
- pl-0098 [closed] Implement multi-repository space discovery, enrollment, and selection flows — discovery-selection
- pl-0099 [closed] Add repository-qualified addressing across Loom tools, stores, and graph surfaces — addressing-and-store-scope
- pl-0100 [closed] Expose active scope diagnostics and repository-qualified operator UX — diagnostics-and-ux
- pl-0101 [closed] Make path-bearing operations repository-safe — path-safety
- pl-0102 [closed] Unify repository-targeted runtime propagation across Ralph, critique, docs, and nested sessions — runtime-propagation
- pl-0103 [closed] Make export/import, migration, and degraded modes truthful for multi-repository spaces — migration-and-sync
- pl-0104 [closed] Build the end-to-end multi-repository verification and regression suite — verification-gate
- pl-0105 [closed] Update durable docs and operator guidance for multi-repository Loom spaces — docs-and-guidance

## Risks and Open Questions

No additional risks or open questions recorded.

## Revision Notes

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- 2026-03-22T00:00:00.000Z — Initial plan created
  Reason: Establish a self-contained execution strategy for delivering production-ready multi-repository Loom spaces from the finalized spec, initiative, roadmap item, and synthesized research.

- 2026-03-22T23:16:28.706Z — Created durable workplan scaffold from initiative:first-class-multi-repository-loom-spaces.
  Reason: Establish a self-contained execution-strategy artifact that can be resumed without prior chat context.

- 2026-03-22T23:17:08.226Z — Regenerated the durable workplan without field-level changes.
  Reason: Keep the workplan aligned with the current execution strategy and observable validation story.

- 2026-03-22T23:33:10.388Z — Linked ticket pl-0096 as umbrella-epic.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-22T23:33:24.516Z — Linked ticket pl-0105 as docs-and-guidance.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-22T23:33:43.056Z — Linked ticket pl-0097 as identity-cutover.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-22T23:33:48.494Z — Linked ticket pl-0098 as discovery-selection.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-22T23:33:56.881Z — Linked ticket pl-0099 as addressing-and-store-scope.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-22T23:34:02.035Z — Linked ticket pl-0100 as diagnostics-and-ux.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-22T23:34:07.215Z — Linked ticket pl-0101 as path-safety.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-22T23:34:14.287Z — Linked ticket pl-0102 as runtime-propagation.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-22T23:34:19.415Z — Linked ticket pl-0103 as migration-and-sync.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-22T23:34:24.257Z — Linked ticket pl-0104 as verification-gate.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-22T23:34:44.501Z — Updated progress.
  Reason: Keep the workplan aligned with the current execution strategy and observable validation story.

- 2026-03-24T19:04:07.575Z — Updated progress.
  Reason: Keep the workplan aligned with the current execution strategy and observable validation story.
