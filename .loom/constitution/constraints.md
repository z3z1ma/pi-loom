---
project: pi-loom
count: 9
updated-at: 2026-03-27T21:03:14.761Z
---

## Architectural and Business Constraints
- constraint-001: SQLite-first semantics must survive backend migration
  Summary: SQLite is today's canonical backend, but the meaning of Loom records must remain valid under future shared backends such as Postgres.
  Rationale: The repository treats SQLite as the current substrate, not the final deployment boundary. Identity, relationships, packets, and lifecycle semantics cannot depend on SQLite-specific quirks if the coordination model is meant to survive backend changes.
- constraint-002: Derived review surfaces are exports, not truth
  Summary: Packets, projections, markdown bodies, widgets, dashboards, and other rendered artifacts may be materialized for humans, but they are not the durable source of record when canonical storage exists.
  Rationale: Pi Loom explicitly keeps packets and `.loom` surfaces derived from SQLite-backed records. Allowing those exports to masquerade as canonical truth would reintroduce ambiguity between what humans inspect and what tools or fresh processes actually mutate.
- constraint-003: Tickets remain the live execution ledger
  Summary: Plans, Ralph, critique, docs, and related runtime state may surround execution, but tickets remain the canonical shared ledger for live execution truth.
  Rationale: Both the repo docs and the package boundaries insist on this rule. If another layer becomes a shadow execution ledger, resumability and cross-layer coordination become unreliable.
- constraint-004: Execution language should stay Ralph-native
  Summary: Pi Loom's current execution model should be described in terms of Ralph runs, tickets, plans, runtime artifacts, and worktrees rather than extra execution personas.
  Rationale: The shipped architecture is organized around Ralph runs over ticket truth. Constitutional language should describe that model directly instead of introducing abstractions that blur the actual orchestration boundary.
- constraint-005: Ralph stays bounded, not a general workflow engine
  Summary: Ralph may orchestrate packetized plan-execute-critique-revise loops, but it must not absorb plans, tickets, critique, or docs into a generic everything-engine.
  Rationale: Ralph is valuable precisely because it is bounded, ticket-aware, and fresh-context. Flattening the stack into one orchestration shell would destroy the explicit boundaries that keep the system coherent.
- constraint-006: Documentation stays explanatory, not reference generation
  Summary: Documentation memory is for truthful high-level overviews, guides, concepts, and operations material after accepted work, not for API-reference generation or pre-completion execution notes.
  Rationale: The docs layer is deliberately post-completion and explanatory. Preserving that scope keeps docs useful as durable understanding rather than turning them into another scratchpad or generated symbol dump.
- constraint-007: No clone-local leakage into canonical records
  Summary: Canonical records must not require one clone, absolute workspace path, local process id, or machine-specific runtime detail to remain intelligible.
  Rationale: Pi Loom's multi-repository, multi-worktree, and fresh-process model depends on portable truth. Clone-local data belongs in runtime attachments or local scratch state, not in shared durable memory.
- constraint-008: Multi-repository scope must be explicit and fail closed
  Summary: Repository and worktree identity must be explicit when ambiguity exists; path-bearing records and runtime launches must fail closed rather than guess the wrong repository scope.
  Rationale: The current storage and runtime model is built around explicit space, repository, and worktree identity. Silent fallback to cwd guesses would corrupt provenance and make cross-repository coordination untrustworthy.
- constraint-009: Human UX cannot break headless parity
  Summary: Human-facing UX improvements must preserve authoritative command, tool, packet, and headless recovery surfaces backed by the same durable records.
  Rationale: Pi Loom should support rich operator experiences without making correctness depend on one frontend mode. Humans and headless tools must still recover, inspect, and act over the same underlying truth.
