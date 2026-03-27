# Curated documentation governance and drift-control rollout

## Purpose / Big Picture

Turn the docs layer from a loosely additive memory surface into a curated, topic owned, drift resistant explanatory system with explicit lifecycle, audit, publication, and workflow enforcement.

## Progress

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- [x] (2026-03-27T00:00:00Z) Created the execution plan for docs governance and drift control after confirming no active Loom plan already covered this work.
- [x] (2026-03-27T07:10:00Z) Materialized and linked the initial ticket graph (pl-0123 through pl-0130) with sequencing roles and dependency edges for the rollout.
- [x] (2026-03-27T10:55:00Z) Completed all linked tickets, resolved the single critique finding through follow-up ticket pl-0131, and left the workspace docs audit and final critique in a clean pass state.

Linked ticket snapshot from the live execution ledger:
- [x] Ticket pl-0123 — Define the curated documentation governance specification (governance-spec)
- [x] Ticket pl-0124 — Add topic ownership and lifecycle metadata to the docs canonical model (canonical-model)
- [x] Ticket pl-0125 — Teach docs tools, packets, renders, and projections about curated surfaces (curated-surface)
- [x] Ticket pl-0126 — Build the documentation drift audit and critique workflow (audit-review)
- [x] Ticket pl-0127 — Enforce documentation-impact decisions in execution workflows (workflow-gates)
- [x] Ticket pl-0128 — Add curated retrieval and publication defaults for documentation (retrieval-publication)
- [x] Ticket pl-0129 — Backfill the current documentation corpus into the governed model (corpus-backfill)
- [x] Ticket pl-0130 — Run end-to-end review and publish the docs governance operating guide (final-verification)
- [x] Ticket pl-0131 — Re-verify governed docs corpus after docs-governance rollout (critique-followup)

## Surprises & Discoveries

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- (none yet)

## Decision Log

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- (none yet)

## Outcomes & Retrospective

Completed outcome: the docs layer now behaves as a curated, topic-owned explanatory surface rather than a flat additive pile. The rollout produced a finalized governance spec, upgraded canonical metadata and lifecycle semantics, topic-aware tool and packet surfaces, audit and critique-backed drift detection, workflow closeout gates, curated retrieval/publication defaults, a migrated governed corpus, and a durable operating overview. One critique cycle surfaced a real blocker in the post-migration verification path; that blocker was resolved through follow-up ticket pl-0131 rather than waived, and the critique was then resolved pass with no open findings. The important retrospective lesson is that verification metadata must have a first-class truth path distinct enough to avoid self-invalidating audit timestamps, and that final critique should be expected to find integration debt even after targeted ticket-level verification passes.

## Context and Orientation

The existing docs module already has several strong primitives worth preserving: durable canonical records, revisions, packet-based fresh updates, context refs into Loom layers, and immutable archival history. The missing pieces are curation controls. There is no enforced topic map, no hard uniqueness rule for active overview pages, no surfaced supersession flow, no overlap or staleness audit, no required docs-impact decision during execution closeout, and no retrieval policy that strongly prefers curated current truth over historical residue. Constitutional guidance says docs are the accepted explanatory layer rather than a generic execution log or API reference generator, so this rollout must preserve that boundary while making the docs surface sparse, canonical, and trustworthy.

This plan is workspace-scoped because no active finalized spec covered the work when the rollout began. The first ticket now establishes that missing contract. Downstream tickets should use the finalized docs-governance spec as the behavior target while continuing to treat canonical SQLite records as the source of truth and `.loom/` outputs as derived review surfaces.

## Projection Context

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Status: completed
- Source target: workspace:pi-loom
- Scope paths: https-github-com-z3z1ma-pi-loom-git:docs/, https-github-com-z3z1ma-pi-loom-git:ticketing/, https-github-com-z3z1ma-pi-loom-git:specs/, https-github-com-z3z1ma-pi-loom-git:plans/, https-github-com-z3z1ma-pi-loom-git:critique/, https-github-com-z3z1ma-pi-loom-git:storage/
- Specs: curated-documentation-governance

## Milestones

1. Governance contract finalized: pl-0123 lands a finalized spec that defines topic ownership, lifecycle, successor semantics, provenance, audit classes, retrieval defaults, and docs-impact workflow dispositions.
2. Canonical model and surface updated: pl-0124 and pl-0125 extend docs state, tools, packets, renders, and projections so governed metadata is representable and visible.
3. Enforcement added: pl-0126 and pl-0127 introduce drift audit coverage and docs-impact workflow gating so governance rules are enforceable rather than aspirational.
4. Retrieval and corpus aligned: pl-0128 and pl-0129 make active canonical docs win by default and migrate the existing corpus into the governed topic map.
5. Rollout verified and documented: pl-0130 completes end-to-end validation, critique, and the durable operating guide for future maintainers.

## Plan of Work

Start by locking the behavior contract before changing the runtime. With the governing spec finalized, extend the canonical docs model so the store can express topic ownership, lifecycle state, successor relationships, provenance, and publication truth without shims. Once the substrate can represent governed state, add the two enforcement layers: an audit path that classifies stale, overlapping, orphaned, and unverified docs, and workflow gates that force significant work to record a docs-impact disposition before closeout.

After enforcement exists, change retrieval and publication defaults so active canonical docs win over historical residue by default. Only then backfill the current documentation corpus, because migration decisions need the final lifecycle and retrieval rules in place. Finish with integrated verification, critique, and an operating guide so the new discipline is durable instead of tribal knowledge.

## Concrete Steps

- pl-0123 (`specs/`, `plans/`, `ticketing/`): create and finalize the governing docs-governance spec, then link it into the plan and bound ticket context.
- pl-0124 (`docs/domain/`, `storage/`): add topic ownership, lifecycle, successor, and provenance fields needed to represent governed state.
- pl-0125 (`docs/tools/`, `docs/domain/`, `bidi/` if projection behavior changes): expose the governed model through tool reads, packets, renders, and projections.
- pl-0126 (`docs/`, `critique/`): build audit classification and review flows for stale, overlapping, orphaned, and unverified docs.
- pl-0127 (`ticketing/`, `plans/`, `docs/`): require explicit docs-impact dispositions during significant execution closeout.
- pl-0128 (`docs/domain/`, `docs/tools/`, retrieval surfaces): prefer active canonical docs by default and demote history unless requested.
- pl-0129 (`docs/`, repository READMEs as upstream sources where appropriate): migrate the current corpus into the governed topic map and resolve duplicates through supersession or archival.
- pl-0130 (`docs/`, `critique/`, targeted tests): run end-to-end verification, critique the rollout, and publish the docs-governance operating guide.

## Validation and Acceptance

Validation is complete when the repository can represent topic-owned docs truthfully, the tool surface exposes the richer lifecycle and successor semantics, an automated audit catches stale/overlapping/orphaned/unverified docs, execution workflows require an explicit docs-impact disposition for significant work, default retrieval returns active canonical docs ahead of historical records, the current docs corpus has been migrated into the governed model, and a critique pass finds no untracked blockers.

Observable evidence should include targeted Vitest coverage, readbacks from docs and plan tools, plan-linked ticket acceptance, critique results for the integrated rollout, and the durable operating guide that explains how curated docs are maintained.

## Idempotence and Recovery

Each ticket should re-read its governing ticket, this plan, and the finalized docs-governance spec before editing code. Plan and ticket linkage writes are safe to repeat when they set the same refs and roles. If a ticket partially updates the docs model, do not paper over mixed state with projections; rerun the targeted ticket until canonical records, tests, and projections agree. Retrieval-default changes should land only after the lifecycle metadata exists, and corpus migration should wait until retrieval and audit behavior are implemented so legacy docs are not misclassified by guesswork.

## Artifacts and Notes

Durable artifacts now include: finalized spec `curated-documentation-governance`; governed operating overview `curated-documentation-governance`; linked and closed rollout tickets `pl-0123` through `pl-0131`; resolved critique `docs-governance-rollout-final-critique`; upgraded docs records and projections carrying topic/lifecycle/provenance metadata; and an active corpus whose workspace-level `docs_audit` reports zero findings.

## Interfaces and Dependencies

Primary areas: `docs/`, `ticketing/`, `specs/`, `plans/`, `critique/`, and `storage/`. The rollout depends on keeping canonical SQLite records authoritative, on preserving the separation between docs, critique, plans, tickets, and Ralph orchestration, and on linking downstream execution to the finalized spec `spec:curated-documentation-governance`. Linked ticket roles remain the plan's active membership model; docs, critique, and ticket records remain their own live systems of record.

## Linked Tickets

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- pl-0123 [closed] Define the curated documentation governance specification — governance-spec
- pl-0124 [closed] Add topic ownership and lifecycle metadata to the docs canonical model — canonical-model
- pl-0125 [closed] Teach docs tools, packets, renders, and projections about curated surfaces — curated-surface
- pl-0126 [closed] Build the documentation drift audit and critique workflow — audit-review
- pl-0127 [closed] Enforce documentation-impact decisions in execution workflows — workflow-gates
- pl-0128 [closed] Add curated retrieval and publication defaults for documentation — retrieval-publication
- pl-0129 [closed] Backfill the current documentation corpus into the governed model — corpus-backfill
- pl-0130 [closed] Run end-to-end review and publish the docs governance operating guide — final-verification
- pl-0131 [closed] Re-verify governed docs corpus after docs-governance rollout — critique-followup

## Risks and Open Questions

Main risks: allowing curated docs to collapse into generic execution logs, inferring topic ownership heuristically from repository structure, or changing retrieval defaults before lifecycle metadata and audit semantics exist. Open policy questions from the initial brainstorming are now resolved by `spec:curated-documentation-governance`; downstream work should raise only implementation-level blockers, not re-open the v1 governance contract.

## Revision Notes

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- 2026-03-27T00:00:00Z — Initial plan creation.
  Reason: Capture the approved docs-governance strategy as a durable Loom plan before materializing the ticket graph.

- 2026-03-27T07:00:01.312Z — Created durable workplan scaffold from workspace:pi-loom.
  Reason: Establish a self-contained execution-strategy artifact that can be resumed without prior chat context.

- 2026-03-27T07:05:12.630Z — Linked ticket pl-0130 as final-verification.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-27T07:05:47.630Z — Linked ticket pl-0123 as governance-spec.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-27T07:05:55.305Z — Linked ticket pl-0124 as canonical-model.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-27T07:06:07.188Z — Linked ticket pl-0125 as curated-surface.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-27T07:06:15.793Z — Linked ticket pl-0126 as audit-review.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-27T07:06:21.213Z — Linked ticket pl-0127 as workflow-gates.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-27T07:06:26.636Z — Linked ticket pl-0128 as retrieval-publication.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-27T07:06:38.115Z — Linked ticket pl-0129 as corpus-backfill.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-27T00:00:00Z — Initial plan creation.
  Reason: Capture the approved docs-governance strategy as a durable Loom plan before materializing the ticket graph.

- 2026-03-27T07:10:00Z — Updated the plan after creating and linking the execution tickets.
  Reason: Make the plan self-contained with the concrete ticket ids, order, and expected artifacts that now implement the rollout strategy.

- 2026-03-27T07:07:02.791Z — Updated concrete steps, artifacts and notes, progress, revision notes.
  Reason: Keep the workplan aligned with the current execution strategy and observable validation story.

- 2026-03-27T07:32:30.000Z — Linked finalized spec curated-documentation-governance into the rollout plan context.
  Reason: pl-0123 produced the governing docs-governance contract that downstream rollout tickets now depend on.

- 2026-03-27T07:33:32.958Z — Updated status, summary, purpose, context and orientation, milestones, plan of work, concrete steps, validation, idempotence and recovery, artifacts and notes, interfaces and dependencies, risks and open questions, outcomes and retrospective, scope paths, source target, context refs, progress, surprises and discoveries, decision log, revision notes.
  Reason: Keep the workplan aligned with the current execution strategy and observable validation story.

- 2026-03-27T07:34:30.000Z — Restored the rollout plan body after linking the finalized governance spec into plan context.
  Reason: Keep the plan self-contained and truthful after adding the new governing spec reference.

- 2026-03-27T07:34:54.808Z — Updated purpose, context and orientation, milestones, plan of work, concrete steps, validation, idempotence and recovery, artifacts and notes, interfaces and dependencies, risks and open questions, scope paths, source target, context refs, revision notes.
  Reason: Keep the workplan aligned with the current execution strategy and observable validation story.

- 2026-03-27T10:32:25.460Z — Linked ticket pl-0131 as critique-followup.
  Reason: Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.

- 2026-03-27T00:00:00Z — Initial plan creation.
  Reason: Capture the approved docs-governance strategy as a durable Loom plan before materializing the ticket graph.

- 2026-03-27T07:10:00Z — Updated the plan after creating and linking the execution tickets.
  Reason: Make the plan self-contained with the concrete ticket ids, order, and expected artifacts that now implement the rollout strategy.

- 2026-03-27T10:55:00Z — Marked the plan completed after final verification and critique resolution.
  Reason: All linked rollout work is closed, the critique cycle passed after follow-up remediation, and the governed docs corpus now audits cleanly.

- 2026-03-27T10:58:03.080Z — Updated status, artifacts and notes, outcomes and retrospective, progress, revision notes.
  Reason: Keep the workplan aligned with the current execution strategy and observable validation story.
