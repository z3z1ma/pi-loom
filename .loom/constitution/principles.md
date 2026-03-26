---
project: pi-loom
count: 8
updated-at: 2026-03-26T07:17:03.487Z
---

## Guiding Principles
- principle-001: Minimal core, composable Loom stack
  Summary: Pi Loom should provide a small set of explicit coordination layers and durable primitives rather than collapsing into a monolithic workflow engine.
  Rationale: The root constitution and package boundaries are intentionally composable: constitution, research, initiatives, specs, plans, tickets, workers, critique, Ralph, and docs each answer a distinct coordination question. Preserving that modularity keeps the system adaptable without forcing every future workflow into one oversized abstraction.
- principle-002: Canonical shared truth with derived exports
  Summary: Canonical operational truth lives in SQLite-backed Loom records; packets, dashboards, markdown, widgets, and other review surfaces are derived exports.
  Rationale: Pi Loom's current architecture depends on a clean split between machine-usable canonical state and human-facing exports. If derived views compete with canonical records, the system becomes ambiguous for adapters, humans, and agents alike.
- principle-003: Explicit graph and provenance over package folklore
  Summary: Relationships across layers should be represented explicitly through stable ids, links, and provenance rather than requiring consumers to reconstruct meaning from package-specific blobs or path conventions.
  Rationale: Long-horizon coordination only works when strategy, evidence, execution, review, and documentation can be traversed truthfully. Explicit linkage is what makes plans, tickets, workers, critiques, specs, and docs reusable across sessions, tools, and future adapters.
- principle-004: One layer, one responsibility
  Summary: Each Loom layer must keep a truthful boundary: research is evidence, initiatives are strategy, specs are declarative behavior contracts, plans translate those contracts into implementation strategy and own ticket linkage, tickets are execution truth, workers are workspace-backed execution substrate, critique is review, Ralph is orchestration, and docs are accepted explanation.
  Rationale: The repository repeatedly emphasizes that these layers complement one another without replacement. Making specs declarative and routing ticket linkage through plans prevents execution detail from leaking into the spec layer, avoids shadow ledgers, and keeps the next edit coherent.
- principle-005: Persistent cognition and resumability
  Summary: Durable work state should survive process turnover, fresh-context execution, and multi-turn collaboration without requiring transcript archaeology.
  Rationale: Pi Loom is built for long-horizon work. Workers, Ralph runs, research, critiques, plans, and tickets all assume that a future human or agent can resume from durable records rather than from one fragile chat window.
- principle-006: Verification and critique before confidence
  Summary: The system should privilege explicit verification evidence, adversarial review, and durable findings over optimistic model self-reporting.
  Rationale: The harness constitution and the critique layer both assume that plausible output may still be wrong. Durable review, verifier evidence, and follow-up work are central to trustworthy long-horizon execution.
- principle-007: Portable shared truth, local runtime boundaries
  Summary: Shared records should preserve portable intent and outcomes, while clone-local runtime details remain in runtime attachments or other local-only state.
  Rationale: Workspace paths, process ids, launch commands, and similar values are not globally truthful. Keeping them out of canonical entities is necessary for multi-machine portability, future shared backends, and honest system state.
- principle-008: Humans and AI operate over the same substrate
  Summary: Every layer should remain usable through human-facing surfaces and AI-facing tool families backed by the same durable records.
  Rationale: Across the packages, Pi Loom consistently exposes slash commands, AI tools, lifecycle initialization, and prompt guidance over one underlying ledger. That dual-surface model lets humans supervise, inspect, and intervene without creating a separate truth system from the one agents use.
