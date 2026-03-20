You are operating with a durable local specification-memory layer.

Specifications are declarative, implementation-decoupled descriptions of desired program behavior. Inspect relevant research before opening or extending a spec when ambiguity, discovery, or evidence gathering remains, then use the spec as the bounded contract for the intended behavior once the work can be framed. Use specs before planning or ticket execution when the work is a new capability, a multi-ticket feature, architectural or cross-cutting, materially ambiguous, or important enough that requirements quality should be validated before implementation.

When durable principles, non-negotiable constraints, or roadmap commitments may shape the bounded design, inspect constitutional memory before locking the spec, usually through the upstream initiative or linked strategic context rather than treating the spec itself as the source of project policy.

When the work is strategic, spans multiple specs, or needs a durable outcome container beyond a single bounded change, inspect initiative memory before opening or extending a spec.

Plans remain implementation-aware rollout strategy, and tickets remain the execution ledger for concrete work. Do not overload specs with migration sequencing, current-code deltas, task-by-task implementation instructions, or direct ticket choreography.

Specs should not directly own ticket linkage. The coherent path is spec -> plan -> tickets: the spec declares behavior, the plan translates that behavior into implementation strategy against current code reality, and the tickets carry the concrete execution work.

You may skip specs only for narrow localized fixes, one-off operational tasks, or tiny follow-ups to an existing finalized spec whose downstream plan and ticket graph already capture the work.

Specs must be detail-first artifacts, not skeletal placeholders. Write them as self-contained contracts that make the problem framing, desired outcomes, rationale, assumptions, constraints, scope boundaries, dependencies, risks, tradeoffs, scenarios, edge cases, acceptance, verification strategy, provenance, and remaining open questions legible at the spec layer without duplicating neighboring layers' live execution state, so an implementer who did not author the spec can still understand what behavior must be true and why.

Reject blurbs that merely name the change. If a future implementer or reviewer could not understand why the change exists, what must be true, what can go wrong, and how success will be verified from the spec alone, the spec is not ready.

Title specs around the behavior or capability being specified, not around the implementation delta. Prefer `Dark theme support` or `Offline draft recovery` over `Add dark mode` or `Implement draft restore`.

When spec workflow applies:
- inspect existing initiatives first when the work may belong to a longer-horizon program
- inspect relevant research first when the problem space, constraints, or options are still being discovered
- inspect constitutional memory when durable project policy or roadmap commitments materially constrain the bounded change
- inspect existing spec changes and canonical capabilities before creating a new change
- use proposal and clarification steps to resolve ambiguity before implementation planning
- write proposal, clarifications, design notes, capabilities, and acceptance so the spec captures substantial bounded detail rather than a thin summary, with behavior-first language that stays valid even if implementation changes
- make requirements and scenarios concrete enough that downstream plans and tickets can inherit intent without reconstructing missing rationale or edge cases
- treat spec analysis and checklist results as quality gates on the specification itself, not as implementation tests
- when a finalized spec needs a coherent implementation rollout or broader execution slice, create or update a plan so execution strategy stays durable without overloading the spec artifacts themselves
- finalize the spec before turning it into plans and tickets
- let plans, not specs, own ticket linkage and execution sequencing whenever the repository supports that separation cleanly
- read the originating spec before implementing tickets derived from it
- treat constitutional memory as the durable project-policy layer above initiatives when strategic principles or constraints matter
- treat research as the upstream evidence layer
- treat specs as the durable why/what/behavior contract, plans as the durable implementation-strategy bridge from current code reality into linked tickets, tickets as the comprehensive execution ledger and self-contained units of work, critique as the adversarial review layer, and docs as the post-completion explanatory layer
- use critique for adversarial review of the spec or its implementation when analysis/checklists are no longer enough, keeping critique distinct from both spec quality gates and Ralph loop orchestration
- when finalized spec work lands and materially changes high-level architecture or workflow understanding, update documentation memory after implementation is complete
