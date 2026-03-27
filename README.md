# pi-loom

A single repo-root `pi-loom` package for Loom's durable, AI-native memory and execution extensions.

This repository itself is the `pi-loom` package. Its top-level domain directories cover constitution, research, initiatives, specs, plans, ticketing, critique, Ralph orchestration, docs, and storage. Canonical state for all of them is persisted in SQLite via storage helpers and rendered into packets, docs, plans, or other review surfaces only when needed. No checked-in `.loom/` tree is used as product state today; future `.loom/` exports, if added, will be one-way review surfaces derived from SQLite. The design is guided by `CONSTITUTION.md`, informed by `.agents/resources/pi-packages/`, and selectively inspired by `.agents/resources/agent-loom/` while defining its own Loom architecture.

Constitutional memory is the highest-order project context in this workspace. It captures durable vision, principles, constraints, roadmap items, and decisions that shape every lower layer. It is intentionally separate from `AGENTS.md`: constitutional state persisted in SQLite via pi-storage defines enduring project truth, while `AGENTS.md` remains operational guidance for how the harness or a directory should behave during execution.

## Package layout

- `constitution/` — constitutional memory extension area
- `research/` — research memory extension area
- `initiatives/` — initiative memory extension area
- `plans/` — planning memory extension area
- `ticketing/` — ticketing extension area
- `specs/` — specification memory extension area
- `critique/` — critique memory extension area
- `ralph/` — Ralph Wiggum loop orchestration area
- `docs/` — documentation memory extension area
- `storage/` — shared storage implementation area
- `.agents/resources/` — reference material

## Multi-repository operating model

Pi Loom is no longer modeled as "one session equals one cwd-derived repository." The canonical coordination boundary is a Loom space, and one space may contain multiple enrolled repositories plus multiple local worktrees for the same repository.

- startup may begin from a parent directory above several repositories or from inside one participating repository
- `scope_read` surfaces the discovered space, enrolled repositories, current active repository/worktree binding, and any stale-binding or availability diagnostics
- `scope_write` is the explicit operator path for selecting, revoking, enrolling, or unenrolling repository scope when discovery is ambiguous or a different repository/worktree should become active
- broad list/search reads stay valid at space scope and return repository-qualified results; repository-sensitive writes and path-bearing operations must either run under an unambiguous active repository selection or provide explicit `repositoryId` / `worktreeId` targeting
- runtime launches for Ralph, docs, and critique propagate explicit space/repository/worktree scope into the fresh process and record that scope in durable runtime artifacts instead of guessing from the child process cwd
- degraded mode is explicit: a repository may remain canonically enrolled even when no local worktree is currently available; space-level reads still work, while repository-bound actions fail closed with diagnostics instead of inventing a replacement repository identity

Portable path handling follows the same rule. In ambiguous parent-directory sessions, bare relative paths such as `README.md` are rejected for repository-bound records; callers must use repository-qualified display paths such as `<repo-slug>:README.md` so exported references, linked outputs, and later hydration stay truthful across clones.

Export and import behavior is scope-aware. A full export represents the whole space (`scope.kind = "space"`, `partial = false`). A repository-scoped export is explicitly partial (`scope.kind = "repository"`, `partial = true`) and excludes unrelated repositories instead of pretending to be a full-space snapshot.

## Development

```bash
npm install
npm run lint
npm run typecheck
npm run test
npm run test:integration
npm run check
```

`npm run test` is the fast default lane. It runs only the unit/helper suite.


Run the opt-in integration lane explicitly when you need the cross-package SQLite-backed flows:

```bash
npm run test:integration
```

To load Pi Loom locally once dependencies are installed:

```bash
omp -e .
```

This workspace targets pi extensions, and the local interactive entrypoint is `omp`.

## Strategic-to-execution stack

The current Loom stack is:

- constitutional memory for durable project vision, principles, constraints, roadmap intent, and logged decisions
- research for durable discovery, evidence, and upstream context
- initiatives for durable strategic outcome context
- specs for durable standalone declarative behavior contracts that stay independent of current implementation details and continue to make sense even when implementation strategy changes
- plans for durable execution strategy and linked multi-ticket rollouts
- tickets for durable execution state
- Ralph orchestration for bounded plan/execute/review loops that compose with tickets and related Loom context without replacing tickets as shared repo truth
- critique for durable adversarial review packets, verdicts, findings, and follow-up work
- docs for durable high-level architecture, workflow, concept, and operations understanding after completed work changes the system narrative

Specs capture the intended behavior of the system independent of the current code shape. Each spec should stand on its own as a bounded contract for one capability or behavior slice rather than reading like a work order or migration note. Plans sit between specs (or broader initiative/workspace context) and tickets: they translate declarative contracts into repository-specific implementation strategy without rewriting the contract itself, keep a thin execution narrative plus a linked ticket set, and carry ticket linkage so specs can stay declarative rather than turning into rollout documents.

Initiatives should link back to constitutional roadmap items where applicable so strategic work can be traced to explicit constitutional commitments rather than only to local execution metadata.

Critique is the durable review layer for judging a ticket, spec, initiative, research artifact, constitutional change, or broader workspace target against the surrounding project context.

Documentation is the post-completion explanatory layer. It keeps architecture overviews, usage guides, conceptual docs, and operational procedures truthful after tangible codebase changes are actually complete. Critique tests the work before sign-off, plans sequence the live work, and documentation updates the durable system narrative after the accepted reality is known.

## Operating model: collaborative preparation, bounded fresh-context execution

Pi Loom is designed around a deliberate split between preparation work that benefits from humans staying deeply in the loop and execution work that benefits from humans moving up to the supervisory layer.

On the preparation side, humans and AI collaborate to create and maintain the durable context that makes later runs predictable. The artifacts may still be authored by AI, but this is the phase where human conversation, steering, and review add the most value:

- constitution defines the hard project rules and durable direction
- research captures durable knowledge before execution outruns understanding
- initiatives connect codebase work to business or product strategy
- specs declare the behavior the system is supposed to exhibit
- plans translate those contracts into execution strategy
- tickets define the concrete units of work worth attempting

This is where goals are clarified, tradeoffs are resolved, ambiguity is squeezed out, and execution units are shaped. Pi Loom treats that collaborative preparation as a first-class engineering activity, not as overhead.

On the execution side, Ralph, critique, and docs update consume that curated context through bounded packets. A packet is the carefully assembled opening context window for one fresh run: it gathers the strategic why, the execution strategy, the concrete target, and the supporting research/docs/spec context needed for one job.

That design is intentional:

- it avoids the gradual context drift and compaction loss that plague long-running steering conversations
- it keeps one logical unit of work from biasing the next one with stale transcript residue
- it lets humans pause between units, reassess outcomes, and decide what the next best action actually is
- it makes a weak result a signal to improve the packet inputs, not an excuse to keep layering contradictory guidance into one exhausted session

In practice, a Ralph run is usually tightly bound to one ticket under one governing plan. It is a one-shot attempt against one logical unit of work, not a roaming multi-task agent. Multiple Ralph iterations are normal: a run may checkpoint, update the ticket, refresh the packet with the latest state plus a concise handoff, and try again. The power comes from re-curating the context window each time rather than dragging along every prior token forever.

Critique and docs updates follow the same philosophy. A critique packet gives the reviewer the surrounding constitution/research/spec/plan/ticket context, so review is grounded in the intended outcome rather than just a git diff. A docs packet gives the maintainer the accepted reality and surrounding context, so the resulting documentation is consolidated and truthful rather than patchy chat residue.

## Execution ledger layer

The execution layer focuses on durable ticket state:

- SQLite-backed ticket records, journals, attachments, and checkpoints
- dependency graph queries for ready/blocked work
- AI-facing tools plus built-in ticketing guidance

Ralph composes with plans, tickets, critique, docs, and related Loom artifacts as the bounded orchestration surface instead of acting as a generic workflow engine.

Ralph runs use local runtime and worktree substrate that stays clone-local, but that runtime state is not itself the shared execution ledger. Tickets remain synchronized from the SQLite-backed execution layer via pi-storage.

Ticket lifecycle and Ralph iteration are intentionally coupled. A ticket may need several bounded Ralph runs before it closes; intermediate runs can checkpoint, journal progress, and refine the next packet without pretending the work is already complete.

## Worktree branch-family model

Worktree-backed execution now uses a durable branch-family model instead of deriving lineage from local git state.

- execution tickets declare branch intent through `branch-mode`, `branch-family`, and `exact-branch-name`
- canonical branch reservations are allocated per repository and branch family, so one repository can advance from `UDP-100` to `UDP-100-1` without affecting another repository's first `UDP-100`
- exact overrides remain explicit and durable on the ticket instead of living in transient runtime flags
- Ralph reruns stay idempotent by reusing the stored branch/worktree for the same bound run rather than reallocating on every iteration

This means Pi Loom does not try to infer merge state from git alone. Follow-up work after merge is modeled explicitly through ticket branch intent and canonical reservation history, which stays truthful even when old local branches have already been deleted.

## Storage model

Pi Loom persists canonical operational state in SQLite via pi-storage. The steady state is:

- canonical operational Loom state lives in SQLite, the shared persistent catalog
- packets, plans, and other human-facing renderings are generated from canonical records rather than treated as durable repo state
- runtime-local worktree control-plane state remains clone-local scratch space and is not persisted as shared truth
- exported `.loom/...` paths are optional derived review surfaces, not the system of record

Before applying breaking catalog-schema changes, back up the current SQLite catalog manually. The standard backup command is:

```bash
sqlite3 "$PI_LOOM_ROOT/catalog.sqlite" ".backup '$PI_LOOM_ROOT/catalog-$(date +%Y%m%d-%H%M%S).sqlite'"
```

If `PI_LOOM_ROOT` is unset, Pi Loom defaults to `~/.pi/loom`.

## Workspace projections

Workspace projections are the repo-visible `.loom/<family>/...` review surfaces for canonical Loom records. They make durable SQLite-backed state readable and selectively editable from the repository without turning markdown into a second system of record.

- supported projection families today are `constitution`, `research`, `initiatives`, `specs`, `plans`, `docs`, and `tickets`
- critique and Ralph remain canonical-only layers; they produce packets, runs, and review artifacts, but they do not project into `.loom/`
- each projected family writes a manifest plus low-churn markdown or document files derived from canonical state
- packets are not projections: plan, docs, critique, and Ralph packets are fresh-process handoff artifacts compiled on demand from canonical state and are never reconcile targets
- human-facing `.loom` sync uses `/loom-status`, `/loom-export`, `/loom-refresh`, and `/loom-reconcile`; AI callers use `projection_status` and `projection_write`; there is no file-save autosync back into SQLite
- dirty projected files block canonical writes and packet launches until the operator explicitly reconciles intentional edits or refreshes back to canonical output

Ticket projections have stricter Git defaults because they churn the most.

- `.loom/.gitignore` keeps `tickets/` and `.reconcile/` untracked by default while still allowing other projection families to be committed intentionally for review
- the ticket family is retention-based rather than "all records forever": open tickets, recent updates, active-plan tickets, and tickets labeled `projection:pinned` remain projected; archived tickets do not
- reconcile scratch, conflict leftovers, and local runtime/control-plane files are never shared truth and should stay out of version control

## Loom artifact commit policy

Treat repo-visible artifacts as exports or review surfaces, not as canonical state:

- Store any exported path references as workspace-root-relative values, never as absolute clone-local paths.
- Commit generated review surfaces only when a workflow explicitly needs them for review.
- Do not commit machine-oriented metadata, state, overviews, or cached views; these are derived from SQLite and should not be duplicated in git.
- Do not commit local durable runtime/control-plane artifacts whose job is to attach execution to one clone instead of defining shared state. If future one-way `.loom/` exports return, that includes paths such as `.loom/**/launch.json` and `.loom/runtime/`.
- If an artifact is not an intentional export for humans, let it live in SQLite alone.

## Planning layer

The Loom layer between specs and ticket execution is durable planning memory:

- plans compile bounded packets from constitution, research, initiative, spec, ticket, critique, and docs context
- each plan keeps planning state in SQLite via pi-storage
- generated plan documents are intentionally self-contained and ExecPlan-shaped: they give a novice-facing execution guide with milestones, validation, recovery notes, interfaces, and revision history while referencing linked tickets instead of replacing their execution detail
- linked tickets remain the live execution system of record, while the plan stays the durable execution-strategy container

Plans sit on the preparation side of the operating model. Their job is to make later bounded runs boringly well-specified.

## Critique layer

The critique layer provides durable adversarial review memory:

- critique records are persisted in SQLite via pi-storage
- each critique compiles a `packet.md` for a fresh reviewer context
- `/critique launch` opens a fresh session handoff, while `critique_launch` executes the same packet in a separate fresh `pi` process and returns the review result synchronously; callers should allow a long timeout because the tool blocks until the critic exits and must land a durable `critique_run`
- runs and findings append durably instead of being flattened into chat
- accepted findings can create follow-up tickets without collapsing critique into ticket metadata
- critique remains reusable by loop orchestration as an independent review layer

Critique is powerful because it reviews with full strategic context, not just with a diff. The critique packet should explain what the work was trying to achieve, what contract it had to satisfy, and what evidence would falsify success.

## Ralph orchestration layer

The bounded Ralph loop layer provides durable orchestration over the lower Loom artifacts:

- Ralph runs are persisted in SQLite via pi-storage
- each run keeps canonical state, packet, run narratives, and iteration records
- Ralph orchestrates bounded plan → execute → critique → revise loops without replacing plans, tickets, critique, or docs as canonical records
- fresh iterations are expected to rehydrate from durable Loom context rather than from one unbounded transcript
- loop control is policy-driven and intended to expose explicit continuation, pause, escalation, and stop decisions

Ralph is best understood as packetized one-shot execution with durable iteration, not as a general conversational shell. The run should start from a meticulously curated context window, attempt one bounded ticket-sized unit, land truthful ticket/checkpoint state, and stop or rerun with a refreshed packet.

## Documentation layer

The final Loom memory layer is durable documentation memory:

- documentation records are persisted in SQLite via pi-storage
- docs are organized as a focused corpus of overviews, guides, concepts, and operations docs instead of one giant markdown file
- documentation packets compile linked constitution, initiative, research, spec, plan, ticket, and critique context into a bounded maintainer handoff
- `/docs update` opens a fresh session handoff, while `docs_update` executes the same packet in a separate fresh `pi` process and requires the canonical SQLite-backed revision to land
- the layer stays high-level and explanatory rather than turning into API reference generation

Documentation updates are another bounded fresh-context pass. The maintainer should receive the accepted context needed to consolidate the narrative, not a long transcript of every intermediate attempt.

## Spec-driven workflow layer

The Loom layer between research and planning is durable specification memory:

- spec state is persisted in SQLite via pi-storage
- spec renderings may be generated for review, but SQLite remains the canonical store
- specs translate research and initiative context into declarative behavior contracts that remain valid even if the implementation changes
- plans are the execution bridge from finalized specs and broader context into linked ticket execution, while specs remain declarative contracts instead of execution ledgers

Specs are preparation-side artifacts. If Ralph or critique is struggling, the right fix is often to sharpen the spec and plan rather than to add more in-run improvisation.

## Initiative memory layer

The Loom coordination layer between research and specs is durable initiative memory:

- initiatives are persisted in SQLite via pi-storage
- initiatives group related research threads, multiple spec changes, and multiple ticket streams around a larger objective
- initiatives can reference constitutional roadmap items so machine and human views show which constitutional commitments they advance
- linked specs and tickets retain explicit initiative membership for cross-layer traceability
- overviews summarize strategic status over linked specs, tickets, milestones, and risks

Initiatives are where human operators connect the codebase to business reality. They should explain why a body of work matters before execution tooling ever starts running tickets.

## Research memory layer

The Loom layer upstream of initiatives is durable research memory:

- research is persisted in SQLite via pi-storage
- research renderings may be generated for review, but SQLite remains the canonical store
- research records discovery, evidence, constraints, and open questions before commitment to execution
- research remains distinct from constitutional memory: it informs project choices, but it does not replace the durable constitutional source of truth
- linked initiatives, specs, and tickets can retain explicit research provenance for cross-layer traceability
- the layer stays focused on durable findings rather than execution logs or speculative runtime features

Research is one of the highest-leverage human activities in the system. If bounded execution is repeatedly underperforming, assume missing or weak research is a first-class candidate root cause.
