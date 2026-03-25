# The AI Harness Constitution

## 1. Purpose

The AI Harness is a persistent coordination system for long-horizon AI knowledge work.

The system exists to enable fleets of AI workers and humans to collaboratively execute complex technical and intellectual work over extended time horizons. It establishes durable structures for reasoning, memory, work decomposition, coordination, critique, and continuous improvement.

The harness treats AI work not as isolated prompts or transient agent runs, but as a persistent evolving system composed of workers, artifacts, knowledge, and relationships.

The harness exists to manage:

* work intent
* reasoning processes
* execution activity
* knowledge accumulation
* coordination between participants
* verification and correctness
* continuous improvement of both the project and the harness itself

The harness defines primitives that allow users to build coordination systems rather than prescribing a single rigid workflow.

---

# 2. Core Design Principles

## 2.1 Minimal Core, Composable System

The harness is intentionally minimal in its core assumptions.

The system defines primitives for:

* workers
* tickets
* memory
* artifacts
* messages
* workspaces
* initiatives
* relationships between entities

The harness does not prescribe a single workflow, architecture, or methodology. Instead, it provides composable building blocks that allow different work styles to emerge.

The harness is not primarily configured through static configuration but through the interaction of system primitives.

---

## 2.2 Persistent Cognition

Workers are persistent participants in the system.

Workers are not ephemeral agent invocations but long-lived reasoning entities that:

* maintain identity
* accumulate context
* maintain message histories
* retain work history
* persist reasoning progress

Persistent cognition allows long-horizon work to be executed across many reasoning cycles without losing context.

---

## 2.3 Work as a Graph

All work in the harness forms a graph of relationships.

Entities relate to one another in structured ways, including:

* tickets depending on other tickets
* tickets referencing specifications
* tickets emerging from research
* workers attached to tickets
* messages referencing workers or tickets
* artifacts linked to research or execution
* initiatives grouping sets of tickets
* repositories linking to workspaces

This graph allows reasoning about dependencies, coordination, and progress.

The system must preserve these relationships as first-class structures.

---

## 2.4 Ticket-Based Persistence

The harness integrates a ticket-based persistence model at its core.

Tickets represent units of work and intent within the system. They serve as anchors for:

* reasoning
* execution
* documentation
* testing
* coordination

Tickets allow work to be:

* sequenced
* parallelized
* prioritized
* tracked
* decomposed
* linked to other work

Tickets persist beyond the lifespan of any individual worker.

---

## 2.5 Continuous Knowledge Accumulation

The harness accumulates knowledge continuously as work progresses.

Knowledge artifacts generated during work are preserved as system memory.

The system must prevent knowledge loss during long reasoning processes.

Knowledge generated during work contributes to:

* improved understanding of the system
* improved planning
* improved execution
* improved documentation
* improved future work

---

## 2.6 Shared Canonical State, Local Runtime, And Review Surfaces

The harness may persist canonical operational state in a shared database-backed substrate rather than requiring every durable record to remain a repo-local file.

When a shared canonical store exists:

* globally meaningful entities must not derive their identity from local file paths
* machine-oriented metadata and current-state records may live in the canonical store
* clone-local runtime/control-plane details may remain local when sharing them would create stale or misleading global state
* human-facing markdown bodies and review surfaces may remain repo-native when grepability, code review, and long-term readability benefit from that materialization

The system must preserve a truthful distinction between:

* canonical shared state
* repo-materialized review surfaces
* clone-local runtime state

No projection or cached artifact may masquerade as canonical truth once a different substrate owns the truth.

---

# 3. System Entities

The harness is composed of several classes of entities.

Each entity participates in the system graph and may relate to other entities.

Primary entity types include:

* Workers
* Tickets
* Initiatives
* Artifacts
* Messages
* Workspaces
* Repositories
* Memory Domains

---

# 4. Workers

## 4.1 Worker Identity

Workers are persistent processes that participate in system activity.

Each worker possesses:

* a stable identity
* a reasoning loop
* a workspace
* a message inbox
* a message history
* a context window
* relationships to tickets and artifacts

Workers are observable system participants.

---

## 4.2 Worker Autonomy

Workers perform reasoning and execution related to assigned work.

Workers may:

* analyze problems
* generate hypotheses
* create artifacts
* modify code
* produce research
* execute tests
* communicate with other workers
* generate new work items

Workers operate within the system's coordination structures rather than outside them.

---

## 4.3 Worker Communication

Workers communicate with each other through the harness messaging system.

Workers may:

* send peer-to-peer messages
* request assistance
* share artifacts
* escalate issues
* coordinate execution

Messages may be attached to tickets to create durable records of coordination and reasoning.

---

## 4.4 Worker Collaboration

Workers may collaborate across shared work.

Workers can:

* reference other workersÕ artifacts
* inspect other workersÕ workspaces
* exchange research
* coordinate execution across related tickets

Collaboration enables coordinated multi-worker problem solving.

---

## 4.5 Worker Subagents

Workers may spawn subagents for bounded tasks.

Subagents remain subordinate to the originating worker.

The originating worker retains responsibility for the broader work context.

---

# 5. Manager Processes

Managers are specialized workers responsible for coordination across the system.

Managers operate at a meta level relative to implementation work.

Manager responsibilities include:

* assigning tickets
* reprioritizing work
* decomposing initiatives
* coordinating worker activity
* detecting stalled workers
* managing workload distribution
* responding to changing context

Managers may operate autonomously or under human supervision.

Humans may also directly fulfill the managerial role.

---

# 6. Modes of Operation

The harness supports multiple operational modes.

The system does not enforce a single workflow.

Possible operational modes include:

### Human-Led Mode

Humans act as managers while workers assist with tasks.

### Ralph Loop Mode

A worker iterates through cycles of:

* planning
* execution
* critique
* revision

### Manager-Worker Mode

Manager processes coordinate multiple workers across tickets.

### Research Mode

Workers perform exploration and knowledge gathering without immediate execution goals.

### Critique Mode

Workers review prior work and generate improvements or issue reports.

---

# 7. Ticket System

## 7.1 Definition

Tickets represent persistent work items.

Tickets define intent within the system.

---

## 7.2 Ticket Responsibilities

Tickets capture:

* work goals
* execution progress
* related artifacts
* reasoning records
* dependencies
* ownership

---

## 7.3 Ticket Relationships

Tickets may relate to:

* other tickets
* initiatives
* research artifacts
* specifications
* documentation
* workers

These relationships form the system work graph.

---

## 7.4 Ticket Discovery

Tickets may originate from:

* human planning
* system critique
* research discoveries
* bug detection
* architectural analysis
* worker observations

The system must allow tickets to be created at any stage of work.

---

# 8. Initiatives

Initiatives represent large-scale efforts composed of multiple tickets.

Initiatives correspond to strategic goals such as:

* roadmap items
* major features
* system migrations
* research programs

Initiatives provide context for groups of tickets.

Tickets may belong to one or more initiatives.

---

# 9. Memory Domains

The harness divides memory into several persistent domains.

Each domain captures a different form of knowledge.

---

## 9.1 Ticket Memory

Ticket memory contains:

* work items
* progress
* work state
* work history
* relationships between tasks

---

## 9.2 Research Memory

Research memory captures knowledge generated during exploration.

Research artifacts include:

* research notes
* experimental results
* investigations
* observations
* system analysis

Research memory forms a corpus of evolving system knowledge.

---

## 9.3 Specification Memory

Specification memory contains formal descriptions of system behavior.

Specifications may include:

* system designs
* implementation plans
* execution plans
* architecture explanations

Specifications bridge research and execution.

---

## 9.4 Documentation Memory

Documentation memory contains explanatory materials intended for both humans and workers.

Documentation describes:

* system architecture
* usage
* operational procedures
* conceptual explanations

Documentation supports onboarding and knowledge transfer.

---

## 9.5 Process Memory

Process memory records how work is performed.

It includes:

* workflows
* retrospectives
* lessons learned
* operational procedures
* continuous improvement insights

---

## 9.6 Constitutional Memory

Constitutional memory contains the core guiding principles of the project.

This includes:

* project vision
* roadmap
* guiding values
* architectural constraints
* strategic direction

Workers reference constitutional memory when making decisions.

---

# 10. Research and Discovery

The harness recognizes research as a distinct phase of knowledge work.

Research may involve:

* exploration
* hypothesis formation
* experimentation
* knowledge synthesis

Research generates artifacts that contribute to system knowledge.

Research work may later be formalized into specifications and tickets.

---

# 11. Hypothesis Tracking

Workers maintain explicit hypotheses during investigations.

Hypotheses may include:

* supporting evidence
* experiments
* results
* confidence levels

Rejected hypotheses remain visible as part of the reasoning history.

Preserving rejected hypotheses prevents repeated failed exploration.

---

# 12. Workspaces

Workspaces are persistent environments associated with workers or tickets.

A workspace may contain:

* repository worktrees
* artifacts
* logs
* experiments
* intermediate outputs

Workspaces persist across reasoning cycles.

Workspaces may be inspected by other workers for collaboration or debugging.

Workspaces may be checkpointed and resumed.

---

# 13. Multi-Repository Coordination

The harness supports work across multiple repositories.

Tickets may span repositories.

Workers may operate across repository boundaries.

The system must preserve relationships between work items and repositories.

Cross-repository dependencies must remain visible.

---

# 14. Testing and Correctness

Correctness is a first-class concern in the harness.

Workers are expected to:

* generate tests
* execute tests
* validate hypotheses
* verify changes

Testing should occur locally whenever possible.

External continuous integration systems may be integrated as extensions.

The harness does not assume a specific CI system.

---

# 15. Critique System

The harness integrates critique as a core capability.

Critique involves workers reviewing prior work to identify:

* bugs
* weaknesses
* missing tests
* architectural issues
* documentation gaps
* potential improvements

Critique may produce new tickets for improvement.

Critique supports continuous improvement of both code and processes.

---

# 16. Adversarial Review

The system supports critic workers.

Critic workers perform adversarial review of other workersÕ outputs.

Critics aim to identify:

* hidden flaws
* unsafe assumptions
* incomplete reasoning
* missing edge cases

Critique and execution operate as complementary processes.

---

# 17. Ralph Looping

The harness integrates iterative reasoning loops for long-horizon work.

These loops involve repeated cycles of:

* planning
* execution
* critique
* revision

Looping continues until work goals are satisfied.

---

# 18. Observability

Observability is a core capability of the harness.

The system must expose visibility into:

* worker activity
* ticket state
* dependency relationships
* work progress
* research artifacts
* communication between workers

Possible views of the system include:

* activity streams
* ticket timelines
* dependency graphs
* research maps
* initiative overviews

Observability allows humans and workers to understand system state.

---

# 19. System Improvement

Workers may generate improvement tickets about the system itself.

Examples include:

* fragile tests
* confusing architecture
* missing documentation
* inefficient processes

Improvement work ensures the system evolves over time.

---

# 20. Reasoning Checkpoints

Workers periodically produce reasoning checkpoints.

Checkpoints summarize:

* current understanding
* active hypotheses
* recent discoveries
* next intended actions

Checkpoints allow humans or other workers to understand long-running efforts quickly.

---

# 21. System Knowledge Graph

Over time, the harness accumulates knowledge about the system.

Workers contribute knowledge regarding:

* services
* APIs
* dependencies
* architectures
* boundaries between systems

This knowledge forms an evolving internal graph of the system.

---

# 22. Model Diversity

The harness supports multiple frontier models.

Different models may specialize in different cognitive roles, including:

* planning
* coding
* critique
* research
* adversarial review

The system may route work to different models based on role.

---

# 23. Extension System

The harness supports integration with external systems.

Extensions may include:

* testing frameworks
* CI platforms
* deployment platforms
* observability systems
* security scanners
* architecture analysis tools
* code search systems
* infrastructure providers

The harness core remains focused on coordination and reasoning workflows.

---

# 24. The System Vision

The AI Harness exists to coordinate long-horizon AI knowledge work.

Within the system:

* tickets capture intent
* workers perform reasoning and execution
* memory accumulates knowledge
* tests validate correctness
* managers coordinate large initiatives
* critique drives improvement
* humans remain able to participate at any level

The harness transforms AI work from isolated prompts into a persistent evolving ecosystem of cognition, coordination, and execution.
