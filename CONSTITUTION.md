# Pi Loom Constitution

## 1. Purpose

Pi Loom exists to make long-horizon AI work durable, inspectable, and governable.

The project is not a pile of prompts, chats, or one-off agent runs. It is a layered coordination substrate where durable project policy, evidence, strategy, behavior contracts, execution records, review, and documentation all have explicit homes.

Pi Loom exists to preserve and coordinate:

- project-defining intent
- research and evidence
- strategic outcomes
- declarative behavior contracts
- execution strategy
- execution truth
- adversarial review
- accepted explanatory knowledge

The system should let humans and AI collaborate over the same durable substrate without requiring transcript archaeology to understand what happened or what should happen next.

---

## 2. Core Design Principles

### 2.1 Layered, composable Loom stack

Pi Loom should remain a small set of explicit coordination layers rather than collapsing into a monolithic workflow engine.

The core stack is:

- constitution
- research
- initiatives
- specs
- plans
- tickets
- Ralph
- critique
- docs
- shared storage and projection infrastructure

Each layer exists because it answers a different coordination question. The system should stay modular enough that humans and AI can inspect, update, or reuse one layer without flattening the rest.

### 2.2 Canonical truth with derived exports

Canonical operational truth lives in SQLite-backed Loom records.

Packets, markdown, `.loom/...` projections, dashboards, status surfaces, and other renderings are derived review or handoff surfaces. They are not a competing source of truth when canonical storage exists.

No projection, packet, or cached artifact may masquerade as canonical state.

### 2.3 Collaborative preparation before bounded execution

Pi Loom is designed around a deliberate split between two modes of work.

The first mode is collaborative preparation. Humans stay actively in the loop, using conversation, steering, review, and the TUI while AI helps author the durable context that makes execution predictable:

- constitution
- research
- initiatives
- specs
- plans
- tickets

The second mode is bounded fresh-context execution. Ralph, critique, and docs update consume carefully assembled packets against one bounded objective at a time.

The project should privilege improving upstream context over extending one drifting execution transcript.

### 2.4 One layer, one responsibility

Each layer must keep a truthful boundary.

- constitution is durable project policy and roadmap intent
- research is evidence, discovery, and open questions
- initiatives are strategic outcome containers
- specs are declarative behavior contracts
- plans are execution strategy and ticket linkage
- tickets are the live execution ledger
- Ralph is bounded orchestration over execution records
- critique is adversarial review
- docs are accepted explanatory memory

If a layer starts carrying another layer's job, the system becomes harder to reason about and easier to corrupt.

### 2.5 Tickets remain the live execution ledger

Tickets are the canonical shared ledger for live execution truth.

Plans, Ralph runs, critiques, docs, and related runtime state may surround execution, but they must not become shadow ledgers for what is currently true about a unit of work.

### 2.6 Explicit graph and provenance over folklore

Relationships across layers should be explicit through stable ids, links, provenance, and scope-aware references.

Humans and AI should not need to reconstruct meaning from path conventions, transcript memory, or package-local folklore.

### 2.7 Portable shared truth, local runtime boundaries

Shared records must remain portable across repositories, worktrees, machines, and future backends.

Clone-local runtime details belong in runtime attachments or other local-only state, not in canonical records. Absolute paths, local process ids, and machine-specific launch details are not durable project truth.

### 2.8 Verification, critique, and documentation before confidence

Plausible output is not sufficient.

Pi Loom should privilege explicit verification evidence, adversarial critique, and truthful documentation updates over optimistic model self-reporting. Accepted reality is what survives testing, review, and reconciliation against the surrounding project context.

### 2.9 Humans and AI operate over the same substrate

Every major layer should remain usable through human-facing surfaces and AI-facing tool families backed by the same durable records.

Human UX improvements must not create a second truth system separate from the one that headless tools and fresh processes use.

---

## 3. Operating Model

### 3.1 Collaborative preparation

Preparation is first-class engineering work, not overhead.

This is where humans and AI collaboratively:

- clarify goals
- resolve tradeoffs
- reduce ambiguity
- connect technical work to business or product intent
- shape execution into ticket-sized units
- decide what evidence and constraints matter before automation runs

Weak preparation produces weak execution. The project should treat work on constitution, research, initiatives, specs, plans, and tickets as the highest-leverage place for human judgment.

### 3.2 Bounded fresh-context execution

Execution should not depend on one endlessly extended transcript.

Pi Loom instead favors packetized runs that begin with a meticulously curated opening context window. A packet should consolidate the strategic why, current plan, concrete target, and relevant supporting context needed for one job.

This design exists to:

- preserve strategic context instead of letting compaction erode it
- avoid cross-ticket contamination from stale transcript history
- give humans clean pause points between units of work
- make a weak run a prompt to improve the packet inputs rather than to pile more contradictory steering into the same session

Human steering should primarily happen between iterations as additive packet/context improvement, not as prolonged in-run negotiation inside one exhausted execution session.

### 3.3 Iteration through packet refresh, not transcript accretion

Multiple Ralph iterations are normal.

A ticket may require several bounded runs before it closes. Intermediate runs may checkpoint, update the ticket, and refresh the packet with the latest state plus a concise handoff.

The power comes from re-curating context for the next attempt, not from dragging every prior token forward forever.

---

## 4. Durable Layer Model

### 4.1 Constitution

Constitution is the highest-order project context.

It captures durable vision, principles, constraints, roadmap items, and strategic decisions that govern the lower layers. Constitutional state should remain more stable and more deliberate than ordinary execution notes.

In the current implementation, that truth lives as a single mutable constitution aggregate with embedded roadmap items, an append-only decision history, and a generated brief derived from the canonical record.

Operational guidance such as `AGENTS.md` may explain how to work in the repository, but it does not replace constitutional truth about what the project is and what its durable boundaries are.

### 4.2 Research

Research records discovery, evidence, methodology, constraints, rejected paths, conclusions, and open questions before execution outruns understanding.

Research should remain distinct from execution history.

### 4.3 Initiatives

Initiatives hold strategic outcomes that span multiple specs, plans, or tickets.

They are the layer where codebase work connects back to business or product reality.

### 4.4 Specs

Specs define intended behavior declaratively.

A spec should still make sense if the eventual implementation changes. Specs are not rollout notes or execution journals.

### 4.5 Plans

Plans translate specs and broader context into execution strategy.

They compile bounded packets from the surrounding layers, carry sequencing rationale, and own ticket linkage without replacing ticket-level execution truth.

### 4.6 Tickets

Tickets are detail-first execution records and the live ledger of work.

A ticket should be complete enough to define why the work exists, what generally needs to happen, what constraints matter, and what evidence proves it is done.

### 4.7 Ralph

Ralph is bounded orchestration, not a general workflow engine.

A Ralph run is usually bound to one ticket and optionally one governing plan. It should operate from a carefully curated fresh context window, land truthful execution state, and stop or rerun with a refreshed packet.

### 4.8 Critique

Critique is durable adversarial review.

A critique packet should include the surrounding constitution, research, initiative, spec, plan, and ticket context so review is grounded in the intended outcome rather than only in a diff.

### 4.9 Docs

Docs are post-completion explanatory memory.

They should capture accepted architecture, workflows, concepts, and operational understanding after the relevant work is actually complete.

---

## 5. Storage, Scope, and Projections

### 5.1 SQLite-first canonical substrate

Pi Loom is SQLite-first today, but the meaning of its records must survive future backend changes.

The storage substrate should preserve durable entities, links, events, runtime attachments, and related artifacts without making the architecture dependent on SQLite-specific quirks.

### 5.2 Explicit multi-repository scope

The canonical coordination boundary is a Loom space, not merely one cwd-derived repository.

Repository and worktree scope must be explicit when ambiguity exists. Runtime launches and path-bearing records should fail closed rather than guessing the wrong repository identity.

### 5.3 Derived `.loom` review surfaces

Workspace projections under `.loom/<family>/...` are review and reconcile surfaces for canonical records.

Supported projection families today are:

- constitution
- research
- initiatives
- specs
- plans
- docs
- tickets

Critique and Ralph remain canonical-only layers. Packets are not projections and are never reconcile targets.

### 5.4 No clone-local leakage into canonical state

Canonical records must remain intelligible without one specific machine, clone, or process.

Clone-local worktree paths, runtime scratch state, and control-plane details belong in local runtime attachments or other local-only state.

---

## 6. Execution and Runtime Model

### 6.1 Ticket-bound orchestration

Ralph should orchestrate bounded plan → execute → critique → revise loops over durable records without replacing those records.

It must stay ticket-bound, packet-driven, and honest about progress, blockers, and verification.

When a governing plan exists, Ralph should remain plan-aware as well as ticket-bound. Background Ralph jobs and per-iteration runtime artifacts are observability and execution substrate, not a separate orchestration layer.

### 6.2 Branch and worktree truth are durable intent, not heuristics

Execution should use durable branch intent and worktree state rather than inferring merge or lineage truth from ad hoc local git observations.

### 6.3 Ralph runs are the active execution model

Pi Loom's active execution model is Ralph runs bound to tickets and, when applicable, governing plans.

The constitution should describe execution in terms of Ralph runs, ticket state, runtime artifacts, worktrees, and packet refresh. It should not introduce extra execution personas beyond the current Ralph-run model.

---

## 7. Quality, Review, and Accepted Reality

### 7.1 Testing and verification

Correctness must be established through verification evidence, not self-report.

Changes should be tested at the layer where they matter, especially when they affect storage semantics, projections, scope routing, packets, or orchestration boundaries.

### 7.2 Adversarial critique

Critique should remain a first-class challenge mechanism.

Review should test not just whether a diff looks reasonable, but whether the work satisfied the right contract under the right strategic and architectural context.

### 7.3 Truthful documentation

Documentation updates should consolidate accepted reality from bounded packets rather than preserving every intermediate attempt.

Docs must stay explanatory and high-level, not devolve into pre-completion scratch notes or generated API reference.

---

## 8. Strategic Direction

Pi Loom's current direction is:

- harden the canonical SQLite-backed data plane as the adapter contract
- preserve the layered coordination stack and its explicit boundaries
- keep collaborative preparation and packetized fresh-context execution as the core operating model
- keep Ralph bounded rather than letting orchestration collapse the rest of the stack into one workflow engine
- strengthen explicit multi-repository space/repository/worktree behavior
- improve human-facing UX without sacrificing headless parity or creating a second truth system
- keep execution language centered on Ralph runs, ticket truth, and explicit orchestration boundaries

---

## 9. System Vision

Pi Loom should become a durable operating system for long-horizon AI work in which humans and AI collaborate to prepare high-quality context, then execute, review, and document work through bounded fresh-context loops over one shared substrate of truth.

The system succeeds when:

- durable intent survives beyond any one transcript
- execution units are clear, bounded, and reproducible
- weak runs improve preparation rather than corrupting execution with transcript drift
- humans can intervene, reassess, and redirect between iterations without losing system truth
- review and documentation are grounded in full project context rather than isolated diffs
- every layer tells the truth about what it is responsible for and nothing else
