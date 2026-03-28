# First-pass subsystem specification backfill

## Purpose / Big Picture

## Purpose / Big Picture
Pi Loom aims to let durable specifications define package behavior strongly enough that later execution and even regeneration can start from explicit contracts rather than code archaeology. The current spec corpus already covers multi-repository Loom spaces, workspace projections, and curated documentation governance, but many major subsystem contracts remained implicit in code and repo docs. This plan captured the bounded first pass of reverse-engineering those missing subsystem contracts into finalized Loom specs without forking architecture or turning specs into implementation task lists.

## Progress

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- [x] (2026-03-28T03:45:00Z) Inspected constitutional memory, existing spec corpus, repository architecture docs, and representative layer files to map missing subsystem contracts.
- [x] (2026-03-28T03:46:00Z) Created durable research and initiative scaffolding for the subsystem spec backfill effort.
- [x] (2026-03-28T04:05:00Z) Drafted, analyzed, and finalized ten new subsystem specs covering storage, preparation, execution, critique, Ralph, and docs maintenance layers.
- [x] (2026-03-28T04:08:00Z) Closed the plan and recorded the resulting spec inventory plus the discovered post-finalization link limitation in surrounding durable artifacts.

## Surprises & Discoveries

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Observation: Existing finalized spec coverage already handles multi-repository spaces and curated documentation governance, while workspace projections already have a separate mutable spec.
  Evidence: spec_read outputs for `first-class-multi-repository-loom-spaces`, `curated-documentation-governance`, and `workspace-projections-for-canonical-loom-records`.

- Observation: The repository's architecture docs and representative source files were sufficient to reverse-engineer ten truthful first-pass subsystem contracts without inventing new architecture.
  Evidence: Created finalized specs linked in this plan after reading README, CONSTITUTION.md, DATA_PLANE.md, storage docs, layer READMEs, and representative index/store/tool files.

- Observation: Finalized specs cannot currently accept later initiative or research membership updates through the existing link workflow.
  Evidence: Attempts to update initiative/research with finalized spec membership returned errors that the finalized spec could not change initiative or research links.

## Decision Log

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Decision: Create one broad but behavior-first spec per major missing subsystem instead of many thin records in the first pass.
  Rationale: This maximizes immediate contract coverage while keeping each spec substantial enough to stand on its own and leaves room for future superseding narrower specs if deeper decomposition becomes necessary.
  Date/Author: 2026-03-28 / AI session

## Outcomes & Retrospective

## Outcomes & Retrospective
This first-pass subsystem backfill is complete. Ten new finalized specs now cover the major missing subsystem contracts: storage substrate, constitution, research, initiatives, spec lifecycle, plans, tickets, critique, Ralph orchestration, and bounded documentation maintenance. The work stayed bounded by intentionally leaving multi-repository spaces, workspace projections, and documentation governance with their existing dedicated specs. A future second pass can supersede or refine any broad subsystem contract that later execution work needs in more detail. One structural limitation surfaced during the pass: once specs are finalized, the current workflow does not allow adding research or initiative membership to those specs afterward, so the surrounding artifacts preserve the inventory textually instead.

## Context and Orientation

## Context and Orientation
The repository organizes pi-loom as a layered coordination substrate: constitution, research, initiatives, specs, plans, tickets, Ralph, critique, docs, plus shared storage/projection infrastructure. Canonical truth lives in SQLite via the storage layer. Repo-visible projections, packets, plan/doc renderings, and runtime artifacts are derived surfaces rather than alternate stores. Existing finalized coverage already handled multi-repository Loom spaces and curated documentation governance; an existing mutable spec covered workspace projections. This plan therefore targeted the remaining missing major subsystem contracts: canonical storage substrate, constitutional memory, research memory, initiative memory, spec lifecycle, planning layer, ticket ledger, critique layer, Ralph orchestration, and documentation maintenance workflows.

## Projection Context

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- Status: completed
- Source target: initiative:subsystem-specification-backfill
- Scope paths: https-github-com-z3z1ma-pi-loom-git:README.md, https-github-com-z3z1ma-pi-loom-git:CONSTITUTION.md, https-github-com-z3z1ma-pi-loom-git:DATA_PLANE.md, https-github-com-z3z1ma-pi-loom-git:storage/README.md, https-github-com-z3z1ma-pi-loom-git:storage/contract.ts, https-github-com-z3z1ma-pi-loom-git:storage/projections.ts, https-github-com-z3z1ma-pi-loom-git:constitution/, https-github-com-z3z1ma-pi-loom-git:research/, https-github-com-z3z1ma-pi-loom-git:initiatives/, https-github-com-z3z1ma-pi-loom-git:specs/, https-github-com-z3z1ma-pi-loom-git:plans/, https-github-com-z3z1ma-pi-loom-git:ticketing/, https-github-com-z3z1ma-pi-loom-git:critique/, https-github-com-z3z1ma-pi-loom-git:ralph/, https-github-com-z3z1ma-pi-loom-git:docs/
- Initiatives: subsystem-specification-backfill
- Research: reverse-engineered-specification-backfill-for-pi-loom
- Specs: bounded-documentation-maintenance, canonical-loom-storage-substrate, constitutional-memory-management, curated-documentation-governance, durable-adversarial-critique, durable-specification-lifecycle, execution-planning-and-linked-rollout-strategy, first-class-multi-repository-loom-spaces, research-knowledge-records, strategic-initiative-tracking, ticket-bound-ralph-orchestration, ticket-execution-ledger, workspace-projections-for-canonical-loom-records

## Milestones

## Milestones
1. Confirm durable context and avoid overlap with existing finalized specs.
2. Create a strategic backfill container in research and initiatives so the work stays discoverable.
3. Draft behavior-first specs for each missing major subsystem with detailed capabilities, scenarios, requirements, acceptance criteria, and design notes.
4. Run spec analysis/checklist gates and finalize only the specs whose contracts are concrete and non-overlapping.
5. Record the resulting spec inventory durably in the surrounding plan, initiative, and research context for future refinement.

## Plan of Work

## Plan of Work
- Use constitutional memory, existing specs, README-level architecture docs, layer READMEs, and representative source files as the evidence base.
- Keep one bounded spec per major missing subsystem, with multiple capabilities inside each spec instead of exploding into dozens of thin records.
- Reuse existing finalized specs as boundaries: do not restate multi-repository space semantics, workspace projection semantics, or documentation governance semantics except where a neighboring subsystem depends on them.
- Prefer stable declarative wording: describe what the subsystem must preserve, expose, reject, or derive, not which current functions happen to implement it.
- Finalize each spec only after the analyzer confirms it is complete enough to stand on its own.

## Concrete Steps

## Concrete Steps
1. Read existing durable context and current spec corpus.
2. Create research and initiative scaffolding for the backfill program.
3. Draft specs in this order so cross-cutting foundations come first: canonical storage substrate, preparation layers (constitution, research, initiatives, spec lifecycle), execution layers (plans, tickets, critique), orchestration/docs layers (Ralph, docs maintenance).
4. For each draft, record detailed design notes, capability summaries, requirements, scenarios, and explicit acceptance criteria.
5. Run `spec_analyze` in `both` mode, fix any blocking issues, and finalize the spec.
6. Refresh surrounding research, initiative, and plan context so later sessions can rediscover the resulting spec set.
7. Summarize any structural limitations encountered during the backfill so later refinement work starts from truth.

## Validation and Acceptance

## Validation and Acceptance
- Each new spec reaches `finalized` status.
- Analyzer/checklist gates pass without blocking defects.
- No created spec duplicates the scope of existing finalized specs for multi-repository spaces or curated documentation governance.
- The new corpus covers the major missing subsystem contracts named in this plan.
- The created spec inventory is recorded durably in the surrounding plan, initiative, and research context, even where formal bidirectional spec links remain unavailable after finalization.

## Idempotence and Recovery

## Idempotence and Recovery
If a draft overlaps an existing spec or fails the analyzer, revise or narrow the mutable draft before finalizing. Do not finalize speculative or implementation-coupled wording. If later evidence shows a created spec is still too broad, treat this first pass as the parent contract and let a future more focused spec supersede or refine it rather than forcing partial truth into the current record.

## Artifacts and Notes

## Artifacts and Notes
Primary evidence: README.md, CONSTITUTION.md, DATA_PLANE.md, storage/README.md, storage/contract.ts, storage/projections.ts, and representative layer README/index/store/tool files. Existing durable spec boundaries: first-class-multi-repository-loom-spaces, workspace-projections-for-canonical-loom-records, curated-documentation-governance. New finalized specs from this plan: canonical-loom-storage-substrate, constitutional-memory-management, research-knowledge-records, strategic-initiative-tracking, durable-specification-lifecycle, execution-planning-and-linked-rollout-strategy, ticket-execution-ledger, durable-adversarial-critique, ticket-bound-ralph-orchestration, bounded-documentation-maintenance.

## Interfaces and Dependencies

## Interfaces and Dependencies
- Depends on constitutional memory for durable architectural boundaries and roadmap commitments.
- Depends on research memory to preserve methodology and evidence for the reverse-engineering pass.
- Depends on existing spec corpus to avoid overlap and to keep lineage truthful.
- Depends on repository docs and representative source files as present-state evidence.
- Produces finalized specs that later plans, tickets, critique runs, and docs maintenance can rely on.

## Linked Tickets

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- (none linked)

## Risks and Open Questions

## Risks and Open Questions
Main risk: accidentally encoding present implementation trivia instead of stable behavior. That risk was managed by keeping each spec behavior-first and by respecting adjacent existing finalized specs. Additional discovered limitation: the current link workflow cannot attach initiative/research membership to already-finalized specs, so surrounding artifacts record the created spec inventory textually and via plan context rather than through direct spec back-links. Remaining open question: which topics, if any, later deserve narrower superseding specs once future work pressures the current broad subsystem contracts?

## Revision Notes

_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._

- 2026-03-28T03:47:00Z — Created the initial subsystem spec backfill plan.
  Reason: The work spans multiple new specs and needs durable execution-strategy context rather than a chat-only checklist.

- 2026-03-28T03:46:27.143Z — Created durable workplan scaffold from initiative:subsystem-specification-backfill.
  Reason: Establish a self-contained execution-strategy artifact that can be resumed without prior chat context.

- 2026-03-28T03:47:00Z — Created the initial subsystem spec backfill plan.
  Reason: The work spans multiple new specs and needs durable execution-strategy context rather than a chat-only checklist.

- 2026-03-28T04:06:00Z — Marked the plan complete with the finalized first-pass subsystem spec set and refreshed linked spec context.
  Reason: The bounded spec-backfill work described by this plan is now complete.

- 2026-03-28T03:56:58.686Z — Updated title, status, summary, purpose, context and orientation, milestones, plan of work, concrete steps, validation, idempotence and recovery, artifacts and notes, interfaces and dependencies, risks and open questions, outcomes and retrospective, scope paths, source target, context refs, progress, surprises and discoveries, decision log, revision notes.
  Reason: Keep the workplan aligned with the current execution strategy and observable validation story.

- 2026-03-28T03:47:00Z — Created the initial subsystem spec backfill plan.
  Reason: The work spans multiple new specs and needs durable execution-strategy context rather than a chat-only checklist.

- 2026-03-28T04:08:00Z — Corrected the completion narrative to reflect that formal initiative/research-to-spec links are not available after spec finalization in the current workflow.
  Reason: The plan must remain truthful about what was completed and what structural limitation was discovered.

- 2026-03-28T03:59:01.825Z — Updated title, status, summary, purpose, context and orientation, milestones, plan of work, concrete steps, validation, idempotence and recovery, artifacts and notes, interfaces and dependencies, risks and open questions, outcomes and retrospective, scope paths, source target, context refs, progress, surprises and discoveries, decision log, revision notes.
  Reason: Keep the workplan aligned with the current execution strategy and observable validation story.
