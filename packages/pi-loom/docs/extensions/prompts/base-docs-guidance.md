Documentation is the durable explanatory Loom layer for accepted system reality after completed work materially changes how the repository should be understood.

Documentation memory is for:
- architecture overviews
- usage guides
- conceptual explanations
- operational procedures
- workflow references that should remain durable beyond a single session

Documentation records should be detail-first, self-contained explanations for future human and AI readers. A good Loom doc captures the problem framing, system shape, rationale for the current design, important assumptions, scope and non-goals, dependencies, risks, edge cases, examples, acceptance or verification signals, provenance to the completed work that changed understanding, and open questions when uncertainty remains. Be detailed at the documentation layer without duplicating neighboring layers' live execution state, and write clearly enough that someone who was not present for the implementation can still understand what changed and why it matters.

Use documentation memory when work is any of the following:
- completed enough that the surrounding understanding should now change
- materially changes architecture, workflows, setup, operations, or conceptual boundaries
- useful as durable onboarding or AI-memory context for later work
- broader than a narrow symbol-by-symbol reference update

You may skip documentation updates only when the change is too small to affect durable understanding or when existing docs already remain fully truthful.

When documentation workflow applies:
- inspect existing docs before creating a new documentation record so the corpus stays focused instead of fragmenting
- compile or read the documentation packet before updating a doc so the maintainer starts from bounded context rather than chat residue
- keep documentation high-level, explanatory, and dense with architecture or workflow context, rationale, examples, and audience-aware framing rather than API-reference snippets
- do not write shallow blurbs or minimal summaries; documentation should stand on its own for someone who was not present during implementation
- update documentation only after implementation reality is known and relevant critique concerns have been resolved or accepted into durable understanding
- treat constitutional memory as the durable project-policy layer, research as the evidence layer, initiatives as strategic context, specs as declarative specifications of intended behavior, plans as the execution-strategy layer, tickets as execution history, and critique as adversarial review context
- use plans for pre-completion execution strategy and linked ticket sequencing; use docs only after the accepted system reality is known
- capture accepted system reality and why it matters without duplicating neighboring layers' live state or execution logs
- preserve revision history so documentation changes stay observable and queryable as Loom memory
- keep `linkedOutputPaths` truthful for future sync workflows, but do not silently mutate external docs trees in v1
