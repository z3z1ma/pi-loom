---
project: pi-loom
items: 5
updated-at: 2026-03-26T07:17:03.487Z
---

## Strategic Direction
Solidify Pi Loom as a layered, adapter-friendly coordination substrate: keep the data plane canonical and portable, keep layer boundaries explicit, keep Ralph bounded while deferring any future workspace-backed execution control plane to a greenfield redesign, and add a coherent widget-first human UX without losing headless tool parity.

## Current Focus
- Define the shared widget-first human UX framework across Loom subsystems while preserving authoritative slash-command, tool, and headless recovery surfaces.
- Keep Ralph, critique, and docs as separate first-class orchestration, review, and explanatory layers rather than letting execution collapse into one workflow bucket.
- Preserve direct Ralph orchestration today while deferring any future workspace-backed manager/worker control plane to a later greenfield redesign instead of carrying the removed chief-wiggum prototype.
- Stabilize the canonical SQLite data plane as the adapter contract by hardening link, event, runtime-attachment, and artifact-projection conventions while keeping exports derived.

## Now
- item-001 [now/completed] Canonical data plane cutover milestone
  Summary: The first major cutover milestone is complete: Pi Loom now treats SQLite-backed entities, links, events, runtime attachments, and selected artifact projections as canonical truth across the implemented packages.
  Rationale: This completed milestone turned the storage substrate from a future boundary into the active product contract and retired the older assumption that package-local blobs or repo exports were the only durable source of truth.
  Initiatives: loom-storage-substrate-migration
  Research: sqlite-data-plane-audit-and-enrichment-opportunities
  Specs: canonical-data-plane-completion, canonical-graph-cutover-phase-1
- item-002 [now/active] Storage substrate migration and adapter contract hardening
  Summary: Continue the broader migration from file-backed or package-local truth toward a stable adapter-facing Loom substrate by hardening indexing, conflict semantics, graph coverage, and package adoption of the canonical SQLite contract.
  Rationale: The core cutover landed, but the product vision still depends on making the shared data plane robust enough for future adapters, broader package coverage, and eventual networked backends without regressing truth boundaries.
  Initiatives: loom-storage-substrate-migration
  Research: sqlite-data-plane-audit-and-enrichment-opportunities, sqlite-first-storage-substrate-and-sync-architecture
  Specs: canonical-data-plane-completion, canonical-graph-cutover-phase-1, sqlite-first-canonical-storage-substrate

## Next
- item-004 [next/candidate] Widget-first Loom operator experience
  Summary: Define a common widget-first human interaction model across Loom subsystems so humans enter through focused workspaces and persistent home surfaces while AI and headless flows continue to operate over the same canonical records.
  Rationale: Several packages already expose focused human surfaces, and the planned specs show a repo-wide shift away from sprawling slash-command trees toward more economic operator UX that still needs coherent cross-package design and headless-safe parity.
  Specs: define-widget-first-loom-subsystem-ux-framework, design-widget-first-constitution-ux, design-widget-first-critique-ux, design-widget-first-docs-ux, design-widget-first-initiatives-ux, design-widget-first-plans-ux, design-widget-first-ralph-ux, design-widget-first-research-ux, design-widget-first-specs-ux, design-widget-first-ticketing-ux, design-widget-first-workers-ux
- item-005 [next/active] First-class multi-repository Loom spaces
  Summary: Establish multi-repository Loom spaces as a first-class operating mode so Pi can run from a parent directory above multiple service repositories while preserving explicit space, repository, and worktree identity across canonical records, tool surfaces, runtime launches, and exported artifacts.
  Rationale: The canonical storage layer already contains strong primitives for spaces, repositories, worktrees, and repository-owned entities, but the product contract still collapses most behavior to one cwd-derived repository identity. That gap blocks the next major evolution of Loom: using one shared coordination substrate across several repositories that together form a coherent system. This roadmap item prioritizes turning the existing storage foundation into a truthful, ergonomic, production-ready multi-repository operating model rather than continuing to rely on single-repo assumptions in discovery, addressing, runtime routing, path handling, export semantics, and verification.
  Initiatives: first-class-multi-repository-loom-spaces
  Research: multi-repository-loom-coordination-readiness
  Specs: first-class-multi-repository-loom-spaces

## Later
- item-003 [later/paused] Workspace-backed execution and bounded orchestration redesign
  Summary: Pause the current workspace-backed execution/control-plane effort after removing the shipped `pi-chief-wiggum` package. Any future manager/worker orchestration should restart from a greenfield design while `pi-ralph-wiggum` remains the only shipped orchestration package.
  Rationale: Removing `pi-chief-wiggum` avoids hardening a manager-first implementation the project no longer wants to carry forward. Keeping the roadmap item, but pausing and rewording it, preserves the strategic problem statement and linked research/spec context without implying that the removed package still represents active shipped architecture.
  Research: evaluate-pi-control-surfaces-for-long-lived-workers, prepare-manager-worker-architecture-from-pi-supervisor-and-pi-extension-interfaces, state-of-the-art-for-ralph-loop-orchestration
  Specs: add-inbox-driven-manager-worker-control-plane, add-ralph-loop-orchestration-extension, add-workspace-backed-manager-worker-substrate

## Recent Constitutional Decisions
- 2026-03-20T00:57:06.128Z [clarification] How should constitutional memory describe the initiatives and specs layers?
  Answer: Treat initiatives as the strategic-memory layer above specs and tickets, and treat specs as the bounded bridge layer between strategy and execution. `/initiative` + `initiative_*` and `/spec` + `spec_*` are first-class surfaces over canonical SQLite-backed state; both layers also initialize their ledgers during session_start and before_agent_start and append layer-specific guidance at agent start. Initiative summaries, spec reviews, checklists, and dashboards are derived artifacts rather than canonical truth. Specs preserve append-only clarification history and own spec-to-ticket alignment once a spec is finalized, including propagation of initiative provenance into linked execution tickets; spec-to-ticket sync is a canonical-memory operation, not a file-generation workflow.
  Affects: constitution:constraints, constitution:principles, constitution:roadmap:item-002, constitution:vision
- 2026-03-20T00:57:33.292Z [clarification] How should constitutional memory describe the workers/manager and critique layers?
  Answer: Treat workers as the workspace-backed execution substrate and critique as the distinct durable review layer, both backed by canonical SQLite state. `/worker` + `worker_*`, `/manager` + `manager_*`, and `/critique` + `critique_*` are first-class surfaces over that state; these layers also initialize their ledgers during session_start and before_agent_start and append layer-specific guidance at agent start. Workers are not session branches or generic subprocesses, managers are a bounded control plane rather than a top-level Loom layer, tickets remain the live execution ledger, and runtime workspaces plus launch descriptors remain ephemeral or runtime-only. Critique owns fresh-review packets, launches, runs, findings, and follow-up ticket linkage without replacing tickets or genericizing review into prose.
  Affects: constitution:constraints, constitution:principles, constitution:roadmap:item-003, constitution:vision
- 2026-03-20T00:57:57.173Z [clarification] How should constitutional memory describe the plans and ticketing layers?
  Answer: Treat plans as the SQLite-backed execution-strategy layer and tickets as the SQLite-backed live execution ledger. `/workplan` + `plan_*` and `/ticket` + ticket_list/ticket_read/ticket_write/ticket_graph/ticket_checkpoint are first-class surfaces over canonical records; both layers initialize during session_start and before_agent_start, and both append layer-specific guidance at agent start. Plans coordinate linked ticket sets through bounded planning packets and derived plan views without replacing ticket truth. Tickets are detail-first, self-contained execution records with journals, checkpoints, attachments, provenance, and audit history; their human UX may be widget-first and asymmetrical with the AI tool surface, but rendered markdown, packet views, checkpoint docs, and similar outputs remain derived exports rather than canonical truth.
  Affects: constitution:constraints, constitution:principles, constitution:roadmap:item-003, constitution:roadmap:item-004, constitution:vision
- 2026-03-20T00:59:35.101Z [clarification] What does 'adapter contract' mean for the Loom data plane after the completion cutover?
  Answer: The strategic leverage is not building a standalone adapter SDK product for third parties to interact with the data plane in the abstract. The real goal is harness portability: Pi remains the primary deeply integrated harness today, while the canonical entity/link/event/runtime/artifact contract should stay portable enough that Loom can be integrated into other coding harnesses such as OpenCode and, where technically feasible, Claude Code and Codex. In that framing, the data plane is the shared substrate and each harness integration is an adapter layer over the same canonical truth. Future work should therefore optimize for portable storage semantics, stable event/link/artifact conventions, and harness-specific integration points rather than prematurely centering a generic SDK deliverable.
  Affects: canonical-data-plane-completion, DATA_PLANE.md, data-plane-completion-execution-plan
- 2026-03-20T01:03:55.043Z [clarification] What is a specification in Pi Loom, and how must it differ from plans and current implementation state?
  Answer: A Pi Loom specification is a declarative, implementation-decoupled statement of how a capability or program behavior should work in all relevant scenarios. It must describe the intended behavior, constraints, edge cases, acceptance, and invariants without depending on the current physical implementation, current code shape, or a delta narrative from today's state to a future state. The accumulated spec corpus should be detailed enough that a fresh implementation could be reconstructed from specs alone. Plans are the implementation-aware bridge from current code reality to the behavior described by the spec, and tickets are the live execution ledger for carrying out that plan. Spec titles should therefore name the behavior or capability being specified rather than imperative change verbs like "add" or "implement".
  Affects: constitution:constraints, constitution:principles, constitution:roadmap:item-003, constitution:roadmap:item-004, constitution:vision
- 2026-03-20T01:42:48.110Z [revision] How should Pi Loom handle spec-to-ticket relationships after the spec doctrine cutover?
  Answer: Pi Loom now treats direct spec-to-ticket association as architecturally incoherent and removes it rather than preserving a legacy path. Specs are declarative behavior contracts only. Plans are the sole bridge from specs into ticket graphs and implementation sequencing. Tickets do not carry direct spec metadata, specs do not own linked-ticket state or ticket-generation surfaces, and any workflow that needs execution tickets must route through plan context instead of coupling tickets straight to specs.
  Affects: constitution:constraints, constitution:principles, constitution:roadmap:item-003, constitution:roadmap:item-004
- 2026-03-20T06:12:20.439Z [constraint_update] How much backward-compatibility weight should the worker/manager/Ralph redesign carry, and what must be preserved during the cutover?
  Answer: For Pi Loom's internal-only toolset, backward compatibility is not a design constraint for the worker/manager/Ralph redesign. We can perform full cutovers, rip out obsolete abstractions, and aggressively simplify surface area as long as the canonical SQLite database in the Pi Loom home remains correct and durable. Migration planning should therefore optimize for one truthful design, not compatibility shims, aliases, or prolonged dual-path support. Any transitional code should be short-lived implementation scaffolding that is deleted before the work lands. The non-negotiable preservation boundary is the SQLite-backed Loom state and its semantic integrity, not the current package-local API shapes or runtime wiring.
  Affects: item-003, plan:ralph-backed-worker-manager-cutover, research:ralph-backed-worker-manager-architecture-cutover
- 2026-03-20T21:11:34.850Z [revision] How should the workspace-backed execution substrate be modeled after the manager/worker simplification work?
  Answer: The execution substrate is now Pi Chief, a manager-first orchestration layer on top of Pi Ralph. A manager is itself a Ralph loop. Each worker is a ticket-bound Ralph loop running in one managed git worktree. A plain TypeScript daemon polls durable storage between iterations and only re-enters manager reasoning when no loops are running and the durable state says the manager must think again. Free-form git consolidation remains an intelligence seam inside the manager loop rather than a hardcoded TypeScript merge executor. The package is renamed from pi-workers to pi-chief to match this role, while the public AI-facing tool family remains manager_* for now.
  Affects: docs:pi-chief-orchestration-overview, item-003, plan:pi-chief-manager-as-ralph-cutover, ralph-backed-worker-manager-architecture-cutover
- 2026-03-21T20:19:30.968Z [roadmap_update] How should Pi Loom represent manager/worker orchestration after deleting the shipped `pi-chief-wiggum` package?
  Answer: Treat `pi-chief-wiggum` as removed from the shipped workspace, keep `pi-ralph-wiggum` as the only current orchestration package, and defer any future workspace-backed manager/worker control plane to a later greenfield redesign rather than incrementally preserving the retired manager-first API or runtime model.
  Affects: AGENTS.md, item-003, package.json, pi-chief-orchestration-overview, README.md, wiggum-orchestration-package-overview
- 2026-03-26T07:17:03.487Z [clarification] How should Pi Loom treat specifications when describing them across modules and durable guidance?
  Answer: Specifications are standalone declarative behavior contracts for intended system behavior. A spec must make sense in isolation, remain truthful even if implementation strategy changes, and be titled as a stable capability or behavior rather than an implementation delta or rollout task. Plans own execution strategy and ticket linkage; tickets own live execution truth.
  Affects: constitution/prompts/base-constitutional-guidance.md, docs:specification-layer-semantics, docs/prompts/base-docs-guidance.md, initiatives/prompts/base-initiative-guidance.md, plans/prompts/base-plan-guidance.md, README.md, research/prompts/base-research-guidance.md, specs/prompts/base-spec-guidance.md, ticketing/prompts/base-ticketing-guidance.md
