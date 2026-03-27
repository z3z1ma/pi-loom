---
project: pi-loom
count: 9
updated-at: 2026-03-27T21:03:14.761Z
---

## Guiding Principles
- principle-001: Layered, composable Loom stack
  Summary: Pi Loom should provide a small set of explicit coordination layers and durable primitives rather than collapsing into a monolithic workflow engine.
  Rationale: The repository is intentionally organized around constitution, research, initiatives, specs, plans, tickets, Ralph, critique, docs, and shared storage/projection infrastructure. Preserving those explicit layers keeps the system inspectable, adaptable, and honest about where each kind of truth belongs.
- principle-002: Canonical shared truth with derived exports
  Summary: Canonical operational truth lives in SQLite-backed Loom records; packets, markdown, projections, dashboards, and other human-facing surfaces are derived exports.
  Rationale: Pi Loom depends on a clean split between machine-usable canonical state and human review or handoff surfaces. If exports compete with canonical records, humans and agents stop operating over the same substrate and the coordination model becomes ambiguous.
- principle-003: Collaborative preparation before bounded execution
  Summary: Humans and AI should collaboratively author durable upstream context, then execute, review, and document work through bounded fresh-context runs over that curated substrate.
  Rationale: The system is strongest when constitution, research, initiatives, specs, plans, and tickets are shaped through active human steering and AI assistance before Ralph, critique, or docs update consume that context. Weak runs should improve the packet inputs rather than extend one drifting execution transcript.
- principle-004: One layer, one responsibility
  Summary: Each Loom layer must keep a truthful boundary: constitution is policy, research is evidence, initiatives are strategy, specs are declarative contracts, plans are execution strategy, tickets are execution truth, Ralph is orchestration, critique is review, and docs are accepted explanation.
  Rationale: The stack only remains coherent when each layer does its own job and stops there. If plans become tickets, specs become rollout notes, or Ralph becomes a general workflow engine, the next edit requires reconstructing truth from overlapping abstractions.
- principle-005: Explicit graph and provenance over folklore
  Summary: Relationships across layers should be represented through stable ids, links, provenance, and scope-aware references rather than reconstructed from path conventions or transcript memory.
  Rationale: Long-horizon coordination only works when strategy, evidence, execution, review, and documentation can be traversed truthfully across sessions and tools. Durable links and explicit provenance make that possible without relying on package-local folklore.
- principle-006: Durable context and resumability
  Summary: Preparation artifacts and execution records should survive process turnover, fresh-context execution, and multi-turn collaboration without requiring transcript archaeology.
  Rationale: Pi Loom is built for work that outlives one session. Durable tickets, plans, critiques, docs, and related records must let a future human or agent resume from the truth rather than from one fragile chat window.
- principle-007: Portable shared truth, local runtime boundaries
  Summary: Shared records should preserve portable intent and outcomes, while clone-local runtime details remain in runtime attachments or other local-only state.
  Rationale: Repository clones, worktrees, process ids, and launch state are not globally meaningful truth. Keeping them out of canonical records is necessary for multi-repository spaces, future shared backends, and honest system state.
- principle-008: Verification and critique before confidence
  Summary: The system should privilege explicit verification evidence, adversarial review, and durable findings over optimistic model self-reporting.
  Rationale: Plausible output is not sufficient in long-horizon AI work. Durable critique, verification, and truthful follow-up work are central to making the system trustworthy.
- principle-009: Humans and AI operate over the same substrate
  Summary: Every layer should remain usable through human-facing surfaces and AI-facing tools backed by the same durable records.
  Rationale: Pi Loom's value comes from humans and AI collaborating over one durable substrate of truth. Human UX improvements, packets, and tools should deepen that shared model rather than create separate ledgers or separate truths.
