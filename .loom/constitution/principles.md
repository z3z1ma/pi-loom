---
project: pi-loom
count: 8
updated-at: 2026-03-16T01:35:27.968Z
---

## Guiding Principles
- principle-001: Minimal composable core
  Summary: Pi Loom should provide durable primitives and layer boundaries that compose into workflows instead of collapsing into a single mandatory methodology.
  Rationale: The root constitution describes a minimal, composable harness, and the current repository implements Loom as linked layers rather than one monolith.
- principle-002: Durable work beyond chat
  Summary: Strategic, research, planning, execution, review, and documentation context must survive session turnover in canonical Loom artifacts rather than living only in prompts or transcripts.
  Rationale: The root constitution emphasizes persistent cognition and continuous knowledge accumulation, while the README grounds Pi Loom in repo-visible durable state under .loom/.
- principle-003: Work as an explicit graph
  Summary: Relationships across roadmap items, initiatives, research, specs, plans, tickets, workers, critiques, Ralph runs, and docs should be first-class and queryable.
  Rationale: The root constitution treats work as a graph, and the shipped Loom stack already exposes explicit ids, linkage fields, packets, and dashboards across layers.
- principle-004: Tickets anchor live execution
  Summary: Tickets remain the durable source of truth for live execution even when workers, plans, critique, Ralph, and docs surround or summarize the work.
  Rationale: The root constitution centers ticket-based persistence, and the current repository explicitly keeps tickets as the live execution ledger.
- principle-005: Truthful layer boundaries
  Summary: Each Loom layer must own one level of abstraction and tell the truth about its role instead of masquerading as a neighboring layer.
  Rationale: Pi Loom only stays understandable if constitution, research, initiatives, specs, plans, tickets, workers, critique, Ralph, and docs remain distinct and explicit about their responsibilities.
- principle-006: Fresh-context over transcript accretion
  Summary: Long-horizon work should rehydrate from bounded packets, ledgers, and artifacts instead of relying on one ever-growing transcript.
  Rationale: The root constitution describes persistent, inspectable work, and the shipped plans, workers, critique, Ralph, and docs packages already use packets and fresh-process handoffs.
- principle-007: Observability over transcript archaeology
  Summary: Humans and agents should be able to recover current system truth from dashboards, packets, ledgers, and durable artifacts without reconstructing it from chat history.
  Rationale: The root constitution names observability as a core capability, and Pi Loom already ships dashboard and packet surfaces across layers that should become authoritative.
- principle-008: Continuous self-improvement
  Summary: Pi Loom should be able to critique, document, and improve itself through its own durable layers so improvements carry evidence, rationale, and follow-up work forward.
  Rationale: The root constitution treats critique, documentation, and system improvement as first-class, and the repository now has dedicated Loom layers for each of those responsibilities.
