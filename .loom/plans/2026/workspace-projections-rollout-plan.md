# Workspace projections rollout plan

## Purpose / Big Picture

Turn the specified workspace-projection model into a shippable implementation without blurring the boundary between interactive authoring and packet-driven autonomous execution. The rollout must add a first-class projection subsystem that lets humans inspect and edit constitution, specs, plans, initiatives, research, docs, and selected tickets from disk while ensuring canonical state remains in SQLite, reconcile stays explicit, dirty state is truthful, and Git churn stays intentionally bounded.

## Progress

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- [x] (2026-03-26T00:00:00.000Z) Created the rollout plan from the specified workspace-projection contract and research synthesis; ticket creation and linking are the next execution step.
- [x] (2026-03-26T07:40:00.000Z) Created execution tickets pl-0115 through pl-0122, attached detailed acceptance/verification guidance, linked them to the rollout plan, and recorded dependency sequencing for the delivery path.
- [x] (2026-03-26T10:00:24.000Z) Recorded the final adversarial critique (`workspace-projections-rollout-final-critique`, run `run-001`) with verdict `pass`, reconfirmed the targeted workspace-projection verification bundle (10 Vitest files / 40 tests), and closed the rollout with no rollout-specific follow-up tickets required.

Linked ticket snapshot from the live execution ledger:
- [x] Ticket pl-0115 — Build shared workspace projection substrate (Shared projection substrate, manifest contract, low-churn writer, and .loom bootstrap)
- [x] Ticket pl-0116 — Project constitution, specs, and initiatives into .loom (Constitution/spec/initiative projection families and lifecycle-safe reconcile boundaries)
- [x] Ticket pl-0117 — Project research, plans, and docs into .loom (Research/plan/docs projection families with date-path and docs-quality rendering)
- [x] Ticket pl-0118 — Implement bounded ticket projections (Bounded ticket projection family with retention, pruning, pinning, and Git-safe defaults)
- [x] Ticket pl-0119 — Add projection reconcile engine and operator surfaces (Explicit reconcile engine, conflict handling, and command/tool operator surfaces)
- [x] Ticket pl-0120 — Integrate workspace projections into Pi lifecycle and execution gating (Pi lifecycle bootstrap, post-write refresh, dirty-state visibility, and execution gating)
- [x] Ticket pl-0121 — Verify workspace projections and update repository guidance (Verification matrix completion plus README, AGENTS, and docs-memory updates)
- [x] Ticket pl-0122 — Critique and close the workspace projections rollout (Final critique, follow-up triage, and truthful closure)

## Surprises & Discoveries

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Observation: Pi currently exposes `session_start` and `before_agent_start` broadly, with some modules also using `session_switch` and `session_fork`; no generic session-end import hook is present in the current codebase, which reinforces the v1 choice to keep reconcile explicit rather than background-automatic.
  Evidence: Repository search across extension `index.ts` files and lifecycle handlers during plan preparation.

- Observation: The existing storage layer already contains sync-bundle and projected-artifact primitives, which reduces risk for a shared projection contract but does not yet solve human-editable repo-visible projections, family manifests, or dirty-state gating.
  Evidence: `storage/sync.ts`, `storage/artifacts.ts`, and the completed data-plane plan context.

## Decision Log

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Decision: Keep workspace projections separate from packets and exclude critique/Ralph from `.loom/` projections.
  Rationale: This preserves the mental model that packets are bounded autonomous handoffs while projections are human-facing authoring surfaces; critique and Ralph packet/run artifacts are operational rather than repository-value-add surfaces.
  Date/Author: 2026-03-26 / assistant

- Decision: Use explicit reconcile/import in v1 and fail closed on dirty-state-sensitive actions rather than introducing background file-save sync.
  Rationale: Pi's current lifecycle hooks and the product's trust model favor explicit, auditable mutation points over hidden sync that could silently diverge from canonical truth.
  Date/Author: 2026-03-26 / assistant

- Decision: Default ticket projections to bounded recent/open/active-plan scope and ignore `.loom/tickets/` in Git by default.
  Rationale: Ticket history grows without bound; a bounded local projection surface preserves usefulness without forcing high-churn execution artifacts into repository history.
  Date/Author: 2026-03-26 / assistant

## Outcomes & Retrospective

Success means Pi Loom gains a truthful, low-churn, repository-visible authoring surface without diluting canonical storage or packet semantics. A newcomer should be able to inspect `.loom/` to understand the active constitution/spec/plan/research/docs context, edit approved sections, reconcile those edits explicitly, and trust that autonomous execution still runs from canonical state. The final retrospective should evaluate whether the family manifest model stayed simple enough, whether ticket retention defaults matched real operator expectations, and whether the lifecycle integration preserved both human UX and headless parity without inventing hidden background magic.

Closure retrospective:
- The shipped v1 keeps the core contract truthful: canonical state remains in SQLite, `.loom/` stays an opt-in derived surface, packet/review/runtime artifacts stay distinct from projections, and ticket projections default to local-only Git hygiene.
- Final critique did not find rollout-specific correctness, lifecycle, documentation, or roadmap-alignment gaps that required reopening implementation work.
- The rollout now has durable spec, research, plan, ticket, docs, and critique coverage, so future follow-on work can extend projection families or UX from a coherent baseline rather than reconstructing intent from chat.

## Context and Orientation

The upstream spec `workspace-projections-for-canonical-loom-records` defines the target behavior: `.loom/<module>/...` markdown projections for selected Loom families, one manifest per family, low-churn rendering, revision-aware reconcile, explicit import semantics, Pi lifecycle integration, and bounded ticket exports. Existing repository doctrine already states that markdown and packets are derived from canonical records; this rollout extends that doctrine from read-only exports into human-editable projections for the interactive half of the product. The current codebase already has useful primitives in `storage/sync.ts` and `storage/artifacts.ts`, plus per-family renderers and durable stores, but it has no projection registry, no family manifest contract, no dirty-state/reconcile workflow, and no `.loom` bootstrap semantics. The implementation must preserve the separation between workspace projections and autonomous execution packets: packets remain bounded one-shot handoffs, while projections become the durable human-facing disk surface. A prior completed plan, `data-plane-completion-execution-plan`, is relevant only as substrate background because it hardened artifact projection conventions and storage helpers; this rollout builds on that foundation rather than reopening it.

## Projection Context

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Status: completed
- Source target: spec:workspace-projections-for-canonical-loom-records
- Scope paths: https-github-com-z3z1ma-pi-loom-git:storage/, https-github-com-z3z1ma-pi-loom-git:constitution/, https-github-com-z3z1ma-pi-loom-git:specs/, https-github-com-z3z1ma-pi-loom-git:plans/, https-github-com-z3z1ma-pi-loom-git:initiatives/, https-github-com-z3z1ma-pi-loom-git:research/, https-github-com-z3z1ma-pi-loom-git:docs/, https-github-com-z3z1ma-pi-loom-git:ticketing/, https-github-com-z3z1ma-pi-loom-git:README.md, https-github-com-z3z1ma-pi-loom-git:AGENTS.md
- Research: human-editable-workspace-projections-for-canonical-loom-records
- Specs: workspace-projections-for-canonical-loom-records
- Tickets: pl-0115, pl-0116, pl-0117, pl-0118, pl-0119, pl-0120, pl-0121, pl-0122
- Critiques: workspace-projections-rollout-final-critique
- Docs: workspace-projections-guide

## Milestones

1. Shared projection substrate and repository bootstrap exist: family manifests, stable hashing/write helpers, path conventions, enablement, and `.loom/.gitignore` defaults are implemented and tested.
2. Stable authoring families project cleanly: constitution, specs, initiatives, research, plans, and docs export into deterministic markdown/manifest layouts, and their editable versus generated boundaries are defined.
3. Ticket projections are bounded and truthful: recent/open/active-plan ticket export, pinning, manifest retention metadata, and safe default gitignore behavior all work without affecting canonical ticket history.
4. Reconcile and lifecycle integration are trustworthy: explicit import/reconcile flows, dirty detection, post-mutation refresh, and fail-closed execution gating all work through Pi command/tool surfaces and headless flows.
5. Verification and narrative updates are complete: tests, docs, critique, and final plan/ticket closure prove the subsystem is trustworthy and understandable.

## Plan of Work

Build the rollout from the inside out but in execution-safe slices. First, establish one shared projection contract under the storage/shared layer so family implementations do not invent divergent manifest formats, hashing rules, file-writing semantics, or dirty-state logic. Next, add export/reconcile support for the lower-churn authoring families so the projection contract is exercised on several record shapes before the higher-churn ticket family arrives. Then implement bounded ticket projections with explicit retention/pinning rules and default Git hygiene. After the family behavior exists, wire the subsystem into Pi's real lifecycle: session bootstrap, explicit reconcile actions, automatic refresh after canonical writes, and fail-closed blocking when packet execution would otherwise run against stale disk edits. Finish with a verification/documentation/review pass that updates README and AGENTS doctrine to reflect the new two-surface model and proves the subsystem behaves deterministically and safely.

## Concrete Steps

1. Define the shared projection model in storage/shared code: module-family identifiers, manifest schema, revision-token semantics, stable content hashing, low-churn file-write policy, deterministic ordering rules, `.loom` root/path helpers, and default `.gitignore` content.
2. Introduce a projection registry/config surface that lets each family declare file naming, editability mode, reconcile parser, protected sections, and retention behavior.
3. Implement constitution/spec/initiative projection rendering and reconcile behavior, making sure immutable/finalized records fail closed where edits are not allowed.
4. Implement research/plan/docs projection rendering and reconcile behavior, including immutable created-date plan paths and docs-friendly narrative rendering suitable for primary-doc usage.
5. Implement ticket projection membership logic, bounded retention, pinning, manifest retention metadata, and pruning rules that never mutate canonical tickets.
6. Add explicit export/import/reconcile/status tool or command surfaces and a dirty-state scanner that operates from manifests rather than ad hoc filesystem heuristics.
7. Integrate projection refresh into successful canonical write paths for enabled families and block autonomous packet execution or dependent canonical mutations when dirty projections would make canonical truth stale relative to disk edits.
8. Expand tests across storage, family stores, lifecycle hooks, and operator flows; then update README, AGENTS-facing guidance, and durable docs to explain the new projection model and safe Git defaults.
9. Run final critique against the projection subsystem, resolve findings, and close the rollout once verification evidence is durable.

## Validation and Acceptance

Outcome-focused validation is required before the rollout is considered done:
- Exporting unchanged canonical state twice must produce byte-stable `.loom/` outputs with no diff noise.
- Editing an allowed markdown section and reconciling it must mutate the targeted canonical record only when the base revision still matches.
- Reconciling a stale or protected-section edit must fail closed with a conflict or explicit rejection, never a silent overwrite.
- Ticket pruning must remove disk projections only; canonical ticket reads, journals, dependencies, and history must remain intact.
- Session startup must bootstrap projection structure and dirty-state discovery without auto-importing manual disk edits.
- Canonical writes through tools/commands must refresh only the affected projection files/family manifest entries when meaningful content changed.
- Packet-based autonomous execution must be blocked when required upstream projections are dirty and unreconciled.
- README, AGENTS-facing guidance, and durable docs must all describe packets versus workspace projections truthfully after implementation.
Verification evidence should include targeted Vitest coverage for storage/projection helpers and each touched family, plus targeted typecheck/lint coverage for the changed modules and a final critique run recorded in critique memory.

Final closure evidence:
- Critique `workspace-projections-rollout-final-critique` resolved with adversarial run `run-001`, verdict `pass`, zero open findings, and zero rollout follow-up tickets.
- `npm run test -- storage/__tests__/projections.test.ts constitution/__tests__/projection.test.ts research/__tests__/projection.test.ts initiatives/__tests__/projection.test.ts specs/__tests__/projection.test.ts plans/__tests__/projection.test.ts docs/__tests__/projection.test.ts ticketing/__tests__/store.test.ts ticketing/__tests__/tools.test.ts specs/__tests__/tools.test.ts` passed on 2026-03-26 (10 files / 40 tests).
- `projection_status(family=all)` reported each family as `not exported`, which matches the shipped explicit-export/no-autosync model rather than indicating drift.
- Durable docs memory still contains active guide `workspace-projections-guide` sourced from `README.md`.

## Idempotence and Recovery

Projection export and reconcile must be safely repeatable. Export should compare stable content hashes and rewrite only when content or stable metadata actually changed. Manifest-driven dirty detection must survive interrupted sessions without inventing canonical changes. Reconcile must behave like a conditional mutation against a declared base revision: if the base no longer matches, the system records or surfaces a conflict instead of partially applying edits. Ticket pruning and `.gitignore` bootstrap must be safe to rerun. If any family export fails mid-refresh, previously written projections remain readable and the manifest should still let operators identify which family or record needs regeneration. Recovery steps must include: re-export one family, re-export all enabled families, discard dirty disk edits for one projection, and rebuild manifests from canonical state when index drift is detected.

## Artifacts and Notes

Primary upstream artifacts are the spec `workspace-projections-for-canonical-loom-records` and the research record `human-editable-workspace-projections-for-canonical-loom-records`. Anticipated repository surfaces include new shared projection helpers under `storage/`, touched family stores/renderers under `constitution/`, `specs/`, `plans/`, `initiatives/`, `research/`, `docs/`, and `ticketing/`, plus README/AGENTS/doc updates that explain the two-surface model. The plan intentionally keeps critique and Ralph out of `.loom/` projections. Ticket projections are expected to be ignored by Git by default, and `.loom/.gitignore` must be treated as a first-class product artifact rather than an afterthought.

## Interfaces and Dependencies

Key interface boundaries:
- storage/shared layer owns the projection contract, family manifest shape, path conventions, stable hashing, low-churn writes, and rebuild/reconcile primitives.
- each family store owns how canonical state is rendered into markdown, which sections are editable, and how reconcile maps edited sections back into canonical mutations.
- Pi command/tool surfaces own explicit export/import/reconcile/status operations and must preserve headless parity.
- packet launch flows, especially Ralph-bound execution, depend on truthful dirty-state checks so bounded execution does not run from stale canonical context.
- repository-qualified scope and worktree identity rules from the current storage/runtime model still apply; multi-repository compatibility should be preserved even if the first implementation is repository-local.
Dependencies include the canonical storage substrate, per-family renderers/parsers, ticket/plan linkage semantics, docs update flows, and critique for final adversarial review.

## Linked Tickets

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- pl-0115 [closed] Build shared workspace projection substrate — Shared projection substrate, manifest contract, low-churn writer, and .loom bootstrap
- pl-0116 [closed] Project constitution, specs, and initiatives into .loom — Constitution/spec/initiative projection families and lifecycle-safe reconcile boundaries
- pl-0117 [closed] Project research, plans, and docs into .loom — Research/plan/docs projection families with date-path and docs-quality rendering
- pl-0118 [closed] Implement bounded ticket projections — Bounded ticket projection family with retention, pruning, pinning, and Git-safe defaults
- pl-0119 [closed] Add projection reconcile engine and operator surfaces — Explicit reconcile engine, conflict handling, and command/tool operator surfaces
- pl-0120 [closed] Integrate workspace projections into Pi lifecycle and execution gating — Pi lifecycle bootstrap, post-write refresh, dirty-state visibility, and execution gating
- pl-0121 [closed] Verify workspace projections and update repository guidance — Verification matrix completion plus README, AGENTS, and docs-memory updates
- pl-0122 [closed] Critique and close the workspace projections rollout — Final critique, follow-up triage, and truthful closure

## Risks and Open Questions

No additional risks or open questions recorded.

## Revision Notes

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- 2026-03-26T00:00:00.000Z — Created the initial workspace projections rollout plan from the specified contract and research synthesis.
  Reason: The user requested a maximum-fidelity implementation plan followed by detailed execution tickets linked in sequence.

- 2026-03-26T07:32:45.317Z — Created durable workplan scaffold from spec:workspace-projections-for-canonical-loom-records.
  Reason: Establish a self-contained execution-strategy artifact that can be resumed without prior chat context.

- 2026-03-26T07:36:57.588Z — Linked ticket pl-0117 as Research/plan/docs projection families with date-path and docs-quality rendering.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-26T07:37:04.590Z — Linked ticket pl-0115 as Shared projection substrate, manifest contract, low-churn writer, and .loom bootstrap.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-26T07:37:13.205Z — Linked ticket pl-0117 as Research/plan/docs projection families with date-path and docs-quality rendering.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-26T07:37:20.170Z — Linked ticket pl-0116 as Constitution/spec/initiative projection families and lifecycle-safe reconcile boundaries.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-26T07:37:24.828Z — Linked ticket pl-0117 as Research/plan/docs projection families with date-path and docs-quality rendering.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-26T07:37:30.102Z — Linked ticket pl-0118 as Bounded ticket projection family with retention, pruning, pinning, and Git-safe defaults.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-26T07:37:34.412Z — Linked ticket pl-0119 as Explicit reconcile engine, conflict handling, and command/tool operator surfaces.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-26T07:37:44.662Z — Linked ticket pl-0122 as Final critique, follow-up triage, and truthful closure.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-26T07:38:01.436Z — Linked ticket pl-0120 as Pi lifecycle bootstrap, post-write refresh, dirty-state visibility, and execution gating.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-26T07:38:07.577Z — Linked ticket pl-0121 as Verification matrix completion plus README, AGENTS, and docs-memory updates.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-26T07:38:23.148Z — Updated context refs, progress.
  Reason: Keep the workplan aligned with the current execution strategy and observable validation story.

- 2026-03-26T10:00:24.000Z — Closed the workspace projections rollout after the final adversarial critique passed with no rollout findings.
  Reason: Keep the workplan aligned with the accepted shipped state and durable closure evidence.

- 2026-03-26T10:01:11.437Z — Updated status, validation, outcomes and retrospective, context refs, progress, revision notes.
  Reason: Keep the workplan aligned with the current execution strategy and observable validation story.
