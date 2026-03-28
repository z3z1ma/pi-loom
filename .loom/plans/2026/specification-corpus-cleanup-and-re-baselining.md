# Specification corpus cleanup and re-baselining

## Purpose / Big Picture

Reset the existing specification corpus so the durable spec layer once again reflects stable behavior contracts instead of completed rollout tasks, obsolete manager/worker designs, or verb-framed UX proposals. This cleanup is the prerequisite for rebuilding the corpus from the codebase under the tighter current spec guidance.

## Progress

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- [x] (2026-03-28T00:00:00Z) Inventoried the current spec corpus and compared it against constitutional direction, current README guidance, and current implementation evidence.
- [x] (2026-03-28T00:24:00Z) Archived 17 legacy specs, leaving curated-documentation-governance, first-class-multi-repository-loom-spaces, and workspace-projections-for-canonical-loom-records as the retained baseline set.
- [ ] (2026-03-28T00:25:00Z) Resolve the remaining lifecycle/tooling exception for three specified add-* specs and one proposed placeholder spec that could not be archived cleanly in this pass.

Linked ticket snapshot from the live execution ledger:
- [ ] Ticket pl-0132 [in_progress] — Archive obsolete specification corpus (cleanup)
- [ ] Ticket pl-0133 [ready] — Reverse-engineer current capability specs from code (follow-on)

## Surprises & Discoveries

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Observation: The active specified corpus is dominated by widget-first UX proposals and removed manager/worker architecture rather than stable current capability contracts.
  Evidence: spec_list results plus spec_read outputs for the specified corpus.

- Observation: Spec archival is only allowed from finalized state, so specified specs must be finalized before they can be retired cleanly.
  Evidence: specs/README.md and specs/domain/store.ts archiveChange guard.

- Observation: Three specified add-* specs still cannot be archived because finalize is blocked by spec analysis, and the current tool/projection surfaces do not permit title-frontmatter cleanup through normal reconcile flow.
  Evidence: spec_write finalize failures for add-workspace-backed-manager-worker-substrate, add-ralph-loop-orchestration-extension, and add-inbox-driven-manager-worker-control-plane; projection_write reconcile rejected title frontmatter edits.

## Decision Log

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Decision: Use this cleanup pass to retire stale current-spec truth before attempting any code-derived replacements.
  Rationale: Leaving obsolete or implementation-shaped specs active makes the future reverse-engineering pass harder because stale records still compete with current truth.
  Date/Author: 2026-03-28 / pi

## Outcomes & Retrospective

Pending execution. Expected outcome is a dramatically smaller active spec corpus that can serve as the truthful baseline for reverse-engineered replacement specs.

## Context and Orientation

Pi Loom's current spec contract is stricter than the repository's earlier habits. Older specs include completed migration steps, deprecated manager/worker architecture, candidate widget-first UX sketches, and other artifacts that no longer read like durable behavior contracts. Constitutional direction now keeps Ralph as the only shipped orchestration package, treats workspace projections and multi-repository scope as active product truth, and expects specs to describe stable capabilities rather than implementation tasks. The cleanup must therefore distinguish between (a) specs that still describe current system behavior in a behavior-first way and (b) specs that should move to archived history because they are obsolete, implementation-shaped, or too weak to keep as current spec truth.

## Projection Context

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Status: active
- Source target: workspace:spec-corpus-reset
- Scope paths: none
- Context refs: none

## Milestones

1. Audit the full spec corpus against the current spec contract and current code/constitutional direction.
2. Create durable execution tracking for cleanup plus the follow-on reverse-engineering work.
3. Archive every finalized legacy spec that no longer deserves to stay active, and finalize-then-archive specified specs that are clearly obsolete or misframed.
4. Re-list the corpus and record the retained baseline set that will survive into the reverse-engineering phase.
5. Leave the repository ready for a second pass that recreates current capability specs from implementation reality.

## Plan of Work

Use constitutional and code evidence to classify each spec into retain, archive, or follow-up. Retain only the small set of specs that already match the modern contract and still describe current system behavior. For specified legacy specs, first finalize them to preserve their frozen record, then archive them so the historical design remains queryable without claiming current relevance. Keep the follow-on replacement work separate: cleanup should reduce false current truth, not invent fresh replacement specs in the same pass.

## Concrete Steps

- Inventory specified, finalized, and proposed specs in the active repository scope.
- Compare each spec title, proposal framing, and surrounding repository evidence with the modern spec definition.
- Treat manager/worker and Chief-era specs as obsolete unless the current shipped Ralph-native architecture still depends on them.
- Treat migration/cutover/phase specs and design-widget-first sketches as cleanup candidates unless they already read as durable current capabilities.
- Preserve the best current behavior specs as the re-baselining anchor set.
- Create a follow-on ticket for rebuilding current specs from the codebase after cleanup is complete.
- Verify the resulting corpus with spec listings and any affected projections.

## Validation and Acceptance

- The remaining active spec set is small and consists only of specs that still describe current behavior in a durable, behavior-first way.
- Obsolete manager/worker, cutover, and weak UX-design specs no longer appear as active specifications.
- Any spec archived in this pass remains readable through historical state but no longer competes with current truth.
- A follow-on execution path exists for reverse-engineering replacement specs from the codebase.

## Idempotence and Recovery

Archiving is terminal historical cleanup, so classification must be deliberate before mutation. Re-running the plan after a partial pass should simply skip already archived records and continue with any remaining active cleanup targets. If a proposed or otherwise non-archivable record remains, record that explicitly instead of fabricating a stronger lifecycle state just to make it archivable.

## Artifacts and Notes

Primary evidence sources: constitutional roadmap/constraints, current README and layer READMEs, current code in shipped packages, and the durable spec records themselves. Projection state should be checked before relying on `.loom/specs` as a review surface, but canonical spec records remain the source of truth.

## Interfaces and Dependencies

Depends on spec lifecycle rules in the spec store: archive only applies to finalized specs, so specified records that should be retired must be finalized first. Depends on current constitutional direction that Ralph remains the shipped orchestration layer and future manager/worker redesign is deferred. Depends on current implementation evidence in ticketing, storage/projections, docs governance, and multi-repository scope.

## Linked Tickets

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- pl-0132 [in_progress] Archive obsolete specification corpus — cleanup
- pl-0133 [ready] Reverse-engineer current capability specs from code — follow-on

## Risks and Open Questions

Risk: over-archiving a genuinely current spec and losing a useful current contract. Mitigation: retain only when the spec already reads like a stable current capability and is supported by code plus constitutional direction. Risk: lifecycle rules may block direct archival of immature records such as proposed specs. Mitigation: do not fabricate structure just to force archival; record the exception and handle it separately. Open question: whether any borderline specified spec besides workspace projections should remain active after cleanup, or whether it should be recreated in the second phase instead.

## Revision Notes

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- 2026-03-28T00:00:00Z — Created initial cleanup and re-baselining plan.
  Reason: The user requested a systematic spec cleanup as the first step before recreating specs from code.

- 2026-03-28T00:08:39.434Z — Created durable workplan scaffold from workspace:spec-corpus-reset.
  Reason: Establish a self-contained execution-strategy artifact that can be resumed without prior chat context.

- 2026-03-28T00:08:39.497Z — Linked ticket pl-0132 as cleanup.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-28T00:08:39.552Z — Linked ticket pl-0133 as follow-on.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-28T00:25:00Z — Recorded cleanup results after the first archival pass.
  Reason: Keep the durable plan truthful about which specs were archived and which remaining exceptions require a separate lifecycle/tooling decision.

- 2026-03-28T00:15:29.815Z — Updated progress, surprises and discoveries, revision notes.
  Reason: Keep the workplan aligned with the current execution strategy and observable validation story.
