---
project: pi-loom
count: 8
updated-at: 2026-03-26T07:17:03.487Z
---

## Architectural and Business Constraints
- constraint-001: SQLite-first semantics must survive backend migration
  Summary: SQLite is today's canonical backend, but the meaning of Loom records must remain valid under future shared backends such as Postgres.
  Rationale: The repository treats SQLite as the current substrate, not the final deployment boundary. If identity, relationships, or lifecycle semantics depend on SQLite quirks, the long-term coordination model will fracture during migration.
- constraint-002: Derived review surfaces are exports, not truth
  Summary: Packets, dashboards, markdown bodies, widget views, and other rendered artifacts may be materialized for humans, but they are not the durable source of record when canonical storage exists.
  Rationale: Pi Loom explicitly keeps summaries and views derived from SQLite-backed records. Allowing exports to masquerade as truth would reintroduce divergence between what humans inspect and what adapters or agents actually mutate.
- constraint-003: Tickets remain the live execution ledger
  Summary: Worker state, plans, specs, critique, and Ralph may surround or enrich execution, but tickets remain the canonical shared ledger for live execution truth.
  Rationale: Both the root docs and the worker/plan/spec layers insist on this boundary. If another layer becomes a shadow execution ledger, cross-layer coordination becomes ambiguous and resumption becomes unreliable.
- constraint-004: Manager is a role, not a new memory layer
  Summary: Manager behavior belongs to a control plane over workers, not to a separate top-level Loom memory domain with competing truth.
  Rationale: The worker package is explicit that manager surfaces coordinate worker fleets from durable worker state. Preserving that distinction keeps the model compact and prevents unnecessary duplication of durable state categories.
- constraint-005: Ralph stays bounded, not a general workflow engine
  Summary: Ralph may orchestrate plan-execute-critique-revise loops, but it must not absorb plans, tickets, critique, workers, or docs into a generic everything-engine.
  Rationale: The Ralph spec and README both define a deliberately bounded orchestration layer. That boundary protects the rest of the Loom stack from being flattened into one opaque orchestration abstraction.
- constraint-006: Documentation stays explanatory, not reference generation
  Summary: Documentation memory is for truthful high-level overviews, guides, concepts, and operations material after accepted work, not for API-reference generation or pre-completion execution notes.
  Rationale: The docs layer is deliberately post-completion and explanatory. Preserving that scope keeps docs useful as durable understanding instead of turning them into another scratchpad or generated symbol dump.
- constraint-007: No clone-local leakage into canonical records
  Summary: Canonical records must not require one clone, absolute workspace path, local process id, or machine-specific runtime detail to remain intelligible.
  Rationale: Pi Loom's worker, critique, Ralph, and storage design all depend on portable truth. Clone-local data belongs in runtime attachments or local scratch state, not in shared durable memory.
- constraint-008: Human UX cannot break headless parity
  Summary: Widget-first or other human-facing UX improvements must preserve authoritative slash-command, tool, and headless recovery surfaces.
  Rationale: The repository is moving toward richer focused human surfaces, but its durable contract still depends on machine-usable tools and recovery without interactive UI. Correctness and resumability cannot depend on one specific frontend mode.
