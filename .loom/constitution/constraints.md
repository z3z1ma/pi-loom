---
project: pi-loom
count: 8
updated-at: 2026-03-16T17:28:05.892Z
---

## Architectural and Business Constraints
- constraint-001: Local-first canonical state
  Summary: Canonical project truth must live in repo-visible local Loom artifacts before any external service, sync surface, or hosted coordination layer.
  Rationale: The root constitution values persistent system state, and the current repository implements every Loom layer under .loom/ as the canonical source of truth.
- constraint-002: Durable paths must be portable
  Summary: Committed Loom references should stay workspace-relative and portable across clones instead of baking clone-local absolute paths into durable records.
  Rationale: The README’s Loom artifact commit policy requires repo-relative durable paths so committed state remains shareable and truthful outside one machine.
- constraint-003: Append-only histories are evidence
  Summary: Decision logs, journals, revisions, iterations, findings, and similar append-only histories are canonical evidence and should not be replaced by ephemeral handoff scaffolding.
  Rationale: The root constitution treats knowledge accumulation as cumulative, and the README explicitly distinguishes durable append-only records from disposable launch descriptors.
- constraint-004: Tickets stay the live execution ledger
  Summary: Workers, plans, critique, Ralph, and docs must not replace tickets as the durable source of truth for in-flight execution state.
  Rationale: The root constitution centers ticket-based persistence, and the current repository repeatedly narrows surrounding layers so tickets retain execution fidelity.
- constraint-005: Constitution stays distinct from operations
  Summary: Constitutional memory defines durable project identity, policy, and roadmap, while AGENTS, prompts, and runtime guidance define operational behavior.
  Rationale: The README explicitly separates .loom/constitution from AGENTS.md so durable policy does not dissolve into session-specific tactics.
- constraint-006: Bounded Ralph scope
  Summary: Ralph remains a bounded orchestration layer over plans, tickets, workers, critique, and docs rather than expanding into an underspecified general workflow engine.
  Rationale: The root constitution includes many possible operating modes, but the current repository intentionally ships a narrower Ralph surface and documents broader orchestration as deferred.
- constraint-007: Outward mutation is explicit and opt-in
  Summary: External synchronization, output publishing, or integration surfaces must remain explicit and opt-in rather than silently mutating outward systems or repo topology.
  Rationale: The README and current docs layer keep outward sync as future-facing metadata rather than a silent side effect, matching the project’s local-first posture.
- constraint-008: Present-tense truth over aspirational scope
  Summary: Constitutional memory should only claim capabilities that are grounded in the current repository, keeping broader worker coordination, multi-repository work, and model routing as future possibilities until they exist.
  Rationale: The root constitution is broader than Pi Loom’s current implementation, so the dogfooded constitution must be a repo-truthful narrowing rather than an aspirational copy.
