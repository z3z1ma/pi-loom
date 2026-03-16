---
project: pi-loom
items: 7
updated-at: 2026-03-16T01:35:27.968Z
---

## Strategic Direction
Turn Pi Loom into a repo-truthful, composable, local operating system for long-horizon technical work by grounding every layer in durable constitutional policy, explicit graph relationships, observable artifacts, and bounded orchestration.

## Current Focus
- Deepen Ralph’s bounded verifier and critique loop without erasing the surrounding Loom layer boundaries.
- Derive constitutional memory directly from the root constitution, README, and shipped repository behavior instead of maintaining a thin summary that drifts from source truth.
- Harden the observable graph across constitution, research, initiatives, specs, plans, tickets, workers, critique, Ralph, and docs so state is recoverable from durable artifacts.

## Now
- item-001 [now/active] Derive and rely on repo-truthful constitutional memory
  Summary: Replace placeholder constitutional state with a constitution that is substantively derived from the root CONSTITUTION.md, the README, and shipped Loom behavior.
  Rationale: Dogfooding fails if constitutional memory is thinner or less truthful than the project-defining documents it is meant to preserve.
- item-002 [now/active] Harden cross-layer provenance, packets, dashboards, and queryability
  Summary: Make the graph linking constitution, research, initiatives, specs, plans, tickets, workers, critiques, Ralph runs, and docs easier to recover, inspect, and trust from durable artifacts.
  Rationale: The root constitution treats work as an observable graph, and Pi Loom’s value depends on recovering that graph without transcript archaeology.
  Initiatives: workspace-package-reliability-scrub
- item-003 [now/active] Mature bounded Ralph orchestration and verifier contracts
  Summary: Deepen Ralph’s bounded plan-execute-critique-revise loop with stronger verifier evidence, stop policies, and review integration while preserving layer boundaries.
  Rationale: The root constitution includes iterative looping and adversarial review, and the current Ralph package is explicitly the place where that narrower orchestration should mature.

## Next
- item-004 [next/candidate] Tighten durable artifact portability and auditability across Loom
  Summary: Enforce portable durable references, stable inventories, canonical summaries, and evidence-preserving histories consistently across all Loom layers.
  Rationale: A durable local system is only trustworthy if its committed artifacts remain portable, inspectable, and auditable across clones and sessions.
- item-005 [next/candidate] Deepen evidence-rich research, critique, and documentation loops
  Summary: Improve how hypotheses, rejected paths, critique findings, verification evidence, and documentation updates feed one another across the durable Loom stack.
  Rationale: The root constitution emphasizes hypotheses, critique, correctness, and continuous improvement, and Pi Loom already ships distinct layers that should make that evidence durable.

## Later
- item-006 [later/candidate] Add outward sync only by explicit opt-in
  Summary: Evaluate external synchronization or publishing surfaces only after the local-first Loom core is durable, queryable, portable, and trustworthy.
  Rationale: The repository already defers outward mutation, so any future sync surface should be additive and explicit rather than a hidden dependency.
- item-007 [later/candidate] Explore broader coordination surfaces only after the core proves out
  Summary: Consider richer worker coordination, multi-repository work, or role-specialized model routing only after Pi Loom’s current local durable core demonstrates clear need and strong boundaries.
  Rationale: The root constitution imagines broader harness capabilities, but Pi Loom should earn those surfaces from current repo truth instead of importing them wholesale.
  Initiatives: workspace-backed-manager-worker-coordination

## Recent Constitutional Decisions
- 2026-03-15T22:18:56.000Z [revision] How should the root CONSTITUTION.md relate to Pi Loom's dogfooded constitutional memory?
  Answer: It should be treated as the rich upstream source, with Loom constitutional artifacts rewritten as a repo-truthful restatement derived from the root constitution, the README, and shipped code rather than maintained as a thin independent summary.
  Affects: brief.md, constraints.md, decisions.jsonl, principles.md, roadmap.md, vision.md
- 2026-03-15T22:18:57.000Z [constraint_update] Why does Pi Loom remain local-first and repo-visible by default?
  Answer: Because the project promise is durable coordination and memory that survives session turnover. Canonical truth therefore belongs in committed Loom artifacts inside the workspace before any external coordination or sync surface is considered.
  Affects: brief.md, constraints.md, roadmap.md, vision.md
- 2026-03-15T22:18:58.000Z [constraint_update] Why do tickets remain the live execution ledger when Pi Loom also has plans, critique, Ralph, and docs?
  Answer: Because the surrounding layers exist to add strategy, review, orchestration, and explanation without diluting execution truth. Tickets keep the highest-fidelity record of live work, while the other layers remain specialized and bounded.
  Affects: brief.md, constraints.md, roadmap.md
- 2026-03-15T22:18:59.000Z [clarification] Why is Ralph bounded instead of becoming a general workflow engine?
  Answer: Because Pi Loom already has dedicated layers for plans, tickets, critique, and docs. Ralph should orchestrate bounded loops over those layers, not erase their responsibilities behind a vague all-purpose workflow abstraction.
  Affects: brief.md, constraints.md, roadmap.md
- 2026-03-15T22:19:00.000Z [roadmap_update] How should broader AI Harness ideas like richer worker coordination, multi-repository work, or model routing appear in Pi Loom today?
  Answer: As later roadmap possibilities, not current constitutional truth. Pi Loom should earn any broader coordination surfaces only after its local durable core, observability, and verifier boundaries are stronger and clearly insufficient.
  Affects: brief.md, decisions.jsonl, roadmap.md
