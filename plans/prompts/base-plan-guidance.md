Plans are a first-class Loom memory layer.

Plans are the authoritative execution-strategy layer. You **MUST** use the planning module whenever the user asks to plan, sequence, or break down implementation work. Do not rely on chat-only lists or scratchpads for execution strategy; if it is worth planning, it **MUST** be a durable Loom plan.

A plan is a bounded, high-context execution-strategy artifact that points at linked tickets; the tickets remain both the high-fidelity execution system of record and comprehensive, self-contained units of work.

A strong plan should:
- compile the relevant constitutional, research, initiative, spec, ticket, critique, and documentation context into one bounded planning packet
- capture the execution strategy in a detailed plan document that explains sequencing, workstreams, rationale, dependencies, risks, milestones, interfaces, recovery steps, and validation clearly enough that a later worker can understand why this rollout is structured like this without duplicating per-ticket live state
- link the right tickets and rely on the ticket layer for durable task detail, acceptance criteria, dependencies, verification, and progress
- keep plan-level decisions, discoveries, risks, and validation intent durable instead of leaving them in chat only

Every plan should read like a self-contained workplan for a novice reader who has only the current working tree plus the plan and packet. Do not assume prior chat context or a previous plan file. Define repository-specific terms in plain language when they first appear.

Required plan sections are:
- `Purpose / Big Picture`
- `Progress`
- `Surprises & Discoveries`
- `Decision Log`
- `Outcomes & Retrospective`
- `Context and Orientation`
- `Milestones`
- `Plan of Work`
- `Concrete Steps`
- `Validation and Acceptance`
- `Idempotence and Recovery`
- `Artifacts and Notes`
- `Interfaces and Dependencies`
- `Linked Tickets`
- `Risks and Open Questions`
- `Revision Notes`

`Progress` must be timestamped and kept current as the work evolves. `Revision Notes` must describe what changed in the plan and why. Validation must be outcome-focused and observable, not merely a list of code edits.

You **MUST** create or update a plan when work is any of the following:
- Explicitly requested as "planning", "roadmapping", or "sequencing"
- broader than one bounded spec but still needs a concrete execution slice
- already understood enough to sequence implementation, review, and docs work across multiple tickets
- tied to an initiative, spec rollout, or workspace-wide execution body that needs a durable container with more execution-strategy detail than a ticket and more bounded scope than an initiative
- likely to be resumed across sessions or agents and would benefit from a bounded planning packet

When planning workflow applies:
- **ALWAYS** inspect existing plans before creating a new one so execution strategy does not fork across multiple shallow scratchpads. If a relevant plan already exists and is still active, update and revise that plan instead of creating a new one. If a relevant plan exists but is no longer active, link to it from the new plan and explain the relationship in the new plan's `Context and Orientation` section.
- **NEVER** produce a text-only plan in chat when a durable plan artifact can be created; treat the `plan_write` tool as the mandatory output channel for planning requests
- compile the plan packet before writing or revising the plan so it reflects durable context rather than chat residue
- make the plan content deeply detailed at the execution-strategy layer and self-contained enough that a newcomer can execute from it alone; do not duplicate ticket-by-ticket live status, checkpoints, or journal detail inside the plan
- use the ticket layer to create, refine, or link tickets explicitly. Plans wrap those tickets in broader execution context, and each linked ticket stands alone as a complete unit of work whether it already existed or was created alongside the plan
- treat constitutional memory as the durable project-policy layer, research as the evidence layer, initiatives as strategic context, specs as standalone declarative behavior contracts for intended system behavior, tickets as the live execution ledger and the complete definition of each execution unit, critique as the adversarial review layer, and docs as the post-completion explanatory layer
- use plans to bridge durable understanding into staged execution, especially when an initiative or finalized spec needs a concrete linked ticket set and execution narrative wrapped around those tickets; the plan, not the spec itself, should own that execution linkage
- keep linked ticket ids, roles, upstream source references, sequencing rationale, and validation intent truthful so the plan remains a reliable execution narrative
- keep linked ticket integration Loom-native: plans can summarize ticket roles and current status, but tickets remain the source of live execution truth and carry their own acceptance criteria, dependencies, and execution notes
- consult documentation memory for architectural context, constraints, and guides that should inform the execution strategy before committing to a specific approach
