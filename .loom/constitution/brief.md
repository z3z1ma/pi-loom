# Pi Loom Constitutional Brief

This artifact is the compact AI-facing constitutional memory for the project. It is distinct from AGENTS.md, which remains operational guidance.

## Vision
Build Pi Loom into a repo-visible, local-first, composable coordination and memory system for long-horizon technical work by humans and AI.

## Guiding Principles
- Minimal composable core: Pi Loom should provide durable primitives and layer boundaries that compose into workflows instead of collapsing into a single mandatory methodology.
- Durable work beyond chat: Strategic, research, planning, execution, review, and documentation context must survive session turnover in canonical Loom artifacts rather than living only in prompts or transcripts.
- Work as an explicit graph: Relationships across roadmap items, initiatives, research, specs, plans, tickets, workers, critiques, Ralph runs, and docs should be first-class and queryable.
- Tickets anchor live execution: Tickets remain the durable source of truth for live execution even when workers, plans, critique, Ralph, and docs surround or summarize the work.
- Truthful layer boundaries: Each Loom layer must own one level of abstraction and tell the truth about its role instead of masquerading as a neighboring layer.
- Fresh-context over transcript accretion: Long-horizon work should rehydrate from bounded packets, ledgers, and artifacts instead of relying on one ever-growing transcript.
- Observability over transcript archaeology: Humans and agents should be able to recover current system truth from dashboards, packets, ledgers, and durable artifacts without reconstructing it from chat history.
- Continuous self-improvement: Pi Loom should be able to critique, document, and improve itself through its own durable layers so improvements carry evidence, rationale, and follow-up work forward.

## Architectural and Business Constraints
- Local-first canonical state: Canonical project truth must live in repo-visible local Loom artifacts before any external service, sync surface, or hosted coordination layer.
- Durable paths must be portable: Committed Loom references should stay workspace-relative and portable across clones instead of baking clone-local absolute paths into durable records.
- Append-only histories are evidence: Decision logs, journals, revisions, iterations, findings, and similar append-only histories are canonical evidence and should not be replaced by ephemeral handoff scaffolding.
- Tickets stay the live execution ledger: Workers, plans, critique, Ralph, and docs must not replace tickets as the durable source of truth for in-flight execution state.
- Constitution stays distinct from operations: Constitutional memory defines durable project identity, policy, and roadmap, while AGENTS, prompts, and runtime guidance define operational behavior.
- Bounded Ralph scope: Ralph remains a bounded orchestration layer over plans, tickets, workers, critique, and docs rather than expanding into an underspecified general workflow engine.
- Outward mutation is explicit and opt-in: External synchronization, output publishing, or integration surfaces must remain explicit and opt-in rather than silently mutating outward systems or repo topology.
- Present-tense truth over aspirational scope: Constitutional memory should only claim capabilities that are grounded in the current repository, keeping broader worker coordination, multi-repository work, and model routing as future possibilities until they exist.

## Strategic Direction
Turn Pi Loom into a repo-truthful, composable, local operating system for long-horizon technical work by grounding every layer in durable constitutional policy, explicit graph relationships, observable artifacts, and bounded orchestration.

## Current Focus
- Deepen Ralph’s bounded verifier and critique loop without erasing the surrounding Loom layer boundaries.
- Derive constitutional memory directly from the root constitution, README, and shipped repository behavior instead of maintaining a thin summary that drifts from source truth.
- Harden the observable graph across constitution, research, initiatives, specs, plans, tickets, workers, critique, Ralph, and docs so state is recoverable from durable artifacts.

## Active Roadmap Items
- item-001 [now/active] Derive and rely on repo-truthful constitutional memory — Replace placeholder constitutional state with a constitution that is substantively derived from the root CONSTITUTION.md, the README, and shipped Loom behavior.
- item-002 [now/active] Harden cross-layer provenance, packets, dashboards, and queryability — Make the graph linking constitution, research, initiatives, specs, plans, tickets, workers, critiques, Ralph runs, and docs easier to recover, inspect, and trust from durable artifacts.
- item-003 [now/active] Mature bounded Ralph orchestration and verifier contracts — Deepen Ralph’s bounded plan-execute-critique-revise loop with stronger verifier evidence, stop policies, and review integration while preserving layer boundaries.
- item-008 [now/active] Migrate Loom storage to a shared database substrate with repo projection sync — Replace per-repo file-backed canonical state with a local shared database substrate that supports cross-repo Loom coordination, repo/worktree-aware execution, deterministic repo projection, and future PostgreSQL backends.

## Open Constitutional Questions
- How much explicit hypothesis and rejected-path structure should the research layer carry before it becomes ceremony?
- What verifier and policy contracts should Ralph support before any broader orchestration is considered?
- When, if ever, should broader worker coordination or multi-repository execution become first-class in Pi Loom?
- Which external sync or publishing surfaces are worth adding after local-first durability is complete?
- Which process-memory concerns deserve first-class Loom artifacts rather than remaining in AGENTS, critique, or documentation?
