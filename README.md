# pi-loom

A `pi-packages`-style workspace for durable, AI-native extensions.

This repository currently ships ten packages: `pi-constitution`, which gives pi a durable constitutional memory layer under `.loom/constitution/`; `pi-research`, which gives pi a durable discovery and evidence layer under `.loom/research/`; `pi-initiatives`, which gives pi a local, repo-visible strategic memory layer under `.loom/initiatives/`; `pi-specs`, which adds first-class specification memory under `.loom/specs/`; `pi-plans`, which adds a durable execution-strategy layer under `.loom/plans/`; `pi-ticketing`, which provides the execution ledger under `.loom/tickets/`; `pi-workers`, which adds a workspace-backed manager-worker execution substrate under `.loom/workers/`; `pi-critique`, which adds durable adversarial review packets, runs, findings, and launch descriptors under `.loom/critiques/`; `pi-ralph`, which adds bounded Ralph-loop orchestration records and fresh-context launch descriptors under `.loom/ralph/`; and `pi-docs`, which adds durable high-level documentation memory under `.loom/docs/`. The design is guided by `CONSTITUTION.md`, informed by `.agents/resources/pi-packages/`, and selectively inspired by `.agents/resources/agent-loom/` without attempting compatibility with either `agent-loom`.

Constitutional memory is the highest-order project context in this workspace. It captures durable vision, principles, constraints, roadmap items, and decisions that shape every lower layer. It is intentionally separate from `AGENTS.md`: constitutional artifacts in `.loom/constitution/` define enduring project truth, while `AGENTS.md` remains operational guidance for how the harness or a directory should behave during execution.

## Workspace layout

- `packages/pi-constitution/` — constitutional memory extension package
- `packages/pi-research/` — research memory extension package
- `packages/pi-initiatives/` — initiative memory extension package
- `packages/pi-plans/` — planning memory extension package
- `packages/pi-ticketing/` — ticketing extension package
- `packages/pi-workers/` — workspace-backed worker execution substrate package
- `packages/pi-specs/` — specification memory extension package
- `packages/pi-critique/` — critique memory extension package
- `packages/pi-ralph/` — Ralph loop orchestration extension package
- `packages/pi-docs/` — documentation memory extension package
- `.agents/resources/` — reference material

## Development

```bash
npm install
npm run lint
npm run typecheck
npm run test
npm run check
```

To try the ticketing package locally once dependencies are installed:

```bash
cd packages/pi-ticketing
omp -e .
```

This workspace targets pi extensions, and the local interactive entrypoint is `omp`.

## Strategic-to-execution stack

The current Loom stack is:

- constitutional memory for durable project vision, principles, constraints, roadmap intent, and logged decisions
- research for durable discovery, evidence, and upstream context
- initiatives for durable strategic outcome context
- specs for durable bounded change contracts that bridge research into execution planning
- plans for durable execution strategy and linked multi-ticket rollouts
- tickets for durable execution state
- workers for durable workspace-backed execution units, manager-worker messaging, checkpoints, approvals, and consolidation records
- critique for durable adversarial review packets, verdicts, findings, and follow-up work
- docs for durable high-level architecture, workflow, concept, and operations understanding after completed work changes the system narrative

Specs are the bridge between that durable research context and execution, turning validated understanding into bounded change contracts. Plans then sit between specs (or broader initiative/workspace context) and tickets: they keep a thin execution narrative plus a linked ticket set without trying to replace ticket fidelity. When specs project tickets, those tickets may retain explicit research provenance alongside their spec and initiative links, and plans can group the resulting execution slice without scraping ticket detail back out of markdown.

Initiatives should link back to constitutional roadmap items where applicable so strategic work can be traced to explicit constitutional commitments rather than only to local execution metadata.

Critique is not merely a ticket review note and not the same thing as Ralph looping. It is the durable review layer that can judge a ticket, spec, initiative, research artifact, constitutional change, or broader workspace target against the surrounding project context.

Documentation is the post-completion explanatory layer. It keeps architecture overviews, usage guides, conceptual docs, and operational procedures truthful after tangible codebase changes are actually complete. It remains distinct from critique and from plans: critique tries to find flaws before sign-off, plans sequence the work while it is still live, and documentation updates the durable system narrative after the accepted reality is known.

## Execution ledger layer

The execution layer focuses on a local durable ticket ledger:

- markdown ticket files with structured frontmatter
- append-only journal sidecars
- attachments and checkpoints as first-class records
- dependency graph queries for ready/blocked work
- AI-facing tools plus built-in ticketing guidance

Broader general-purpose worker coordination beyond the bounded local manager-worker substrate remains intentionally deferred. The current orchestration surface is still Ralph-specific and composes with plans, tickets, workers, critique, and related Loom artifacts rather than replacing them with a generic workflow engine.

## Loom artifact commit policy

Maintain Loom state as repo-relative workspace data.

- Store durable paths as workspace-root-relative values such as `.loom/specs/changes/add-dark-mode/proposal.md`, never as absolute clone-local paths.
- Commit canonical Loom records: primary markdown artifacts (`initiative.md`, `plan.md`, `packet.md`, `run.md`, `doc.md`, `critique.md`, proposal/design/task docs, canonical capabilities), machine state (`state.json`), stable inventories, and append-only histories such as `decisions.jsonl`, `hypotheses.jsonl`, `iterations.jsonl`, `revisions.jsonl`, `runs.jsonl`, `findings.jsonl`, and ticket journals.
- Commit repo-visible summaries when a package treats them as durable state, including stable `dashboard.json` artifacts after volatile churn fields are removed.
- Do not commit runtime-only handoff descriptors whose purpose is launching or resuming a fresh session or subprocess. Today that specifically includes `.loom/**/launch.json`.
- Treat append-only history as canonical evidence, but treat launch descriptors as disposable runtime scaffolding.
- If a package documents an artifact as durable and repo-visible, prefer committing it; do not hide canonical Loom state behind broad ignore rules.

## Planning layer

The Loom layer between specs and ticket execution is durable planning memory:

- plans live under `.loom/plans/`
- plans compile bounded packets from constitution, research, initiative, spec, ticket, critique, and docs context
- each plan keeps `state.json`, `packet.md`, `plan.md`, and `dashboard.json`
- `plan.md` is intentionally thin and ExecPlan-shaped: it references linked tickets instead of replacing their execution detail
- linked tickets remain the live execution system of record, while the plan stays the durable execution-strategy container

## Critique layer

The critique layer provides durable adversarial review memory:

- critique records live under `.loom/critiques/`
- each critique compiles a `packet.md` for a fresh reviewer context
- `/critique launch` opens a fresh session handoff, while `critique_launch` executes the same packet in a separate fresh `pi` process and returns the review result synchronously; callers should allow a long timeout because the tool blocks until the critic exits and must land a durable `critique_run`
- runs and findings append durably instead of being flattened into chat
- accepted findings can create follow-up tickets without collapsing critique into ticket metadata
- critique remains reusable by loop orchestration without being equivalent to Ralph loop mode

## Ralph orchestration layer

The bounded Ralph loop layer provides durable orchestration over the lower Loom artifacts:

- Ralph runs live under `.loom/ralph/`
- each run keeps `state.json`, `packet.md`, `run.md`, `iterations.jsonl`, `dashboard.json`, and `launch.json`
- Ralph orchestrates bounded plan → execute → critique → revise loops without replacing plans, tickets, critique, or docs as canonical records
- fresh iterations are expected to rehydrate from durable Loom context rather than from one unbounded transcript
- loop control is policy-driven and intended to expose explicit continuation, pause, escalation, and stop decisions

## Documentation layer

The final Loom memory layer is durable documentation memory:

- documentation records live under `.loom/docs/`
- docs are organized as a focused corpus of overviews, guides, concepts, and operations docs instead of one giant markdown file
- each document keeps `state.json`, `packet.md`, `doc.md`, `revisions.jsonl`, and `dashboard.json`
- documentation packets compile linked constitution, initiative, research, spec, ticket, and critique context into a bounded maintainer handoff
- `/docs update` opens a fresh session handoff, while `docs_update` executes the same packet in a separate fresh `pi` process and requires a durable revision to land
- the layer stays high-level and explanatory rather than turning into API reference generation

## Spec-driven workflow layer

The Loom layer between research and ticketing is durable specification memory:

- spec changes live under `.loom/specs/changes/`
- canonical capabilities live under `.loom/specs/capabilities/`
- specs translate research and initiative context into bounded implementation contracts
- finalized specs can deterministically project sequenced tickets into `.loom/tickets/`
- projected tickets retain explicit provenance back to their originating research, spec change, capabilities, and requirements

## Initiative memory layer

The Loom coordination layer between research and specs is durable initiative memory:

- initiatives live under `.loom/initiatives/`
- initiatives group related research threads, multiple spec changes, and multiple ticket streams around a larger objective
- initiatives can reference constitutional roadmap items so machine and human views show which constitutional commitments they advance
- linked specs and tickets retain explicit initiative membership for cross-layer traceability
- dashboards summarize strategic status over linked specs, tickets, milestones, and risks

## Research memory layer

The Loom layer upstream of initiatives is durable research memory:

- research lives under `.loom/research/`
- research records discovery, evidence, constraints, and open questions before commitment to execution
- research remains distinct from constitutional memory: it informs project choices, but it does not replace the durable constitutional source of truth in `.loom/constitution/`
- linked initiatives, specs, and projected tickets can retain explicit research provenance for cross-layer traceability
- the layer stays focused on durable findings rather than execution logs or speculative runtime features
