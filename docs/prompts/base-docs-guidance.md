Documentation is the authoritative explanatory Loom layer. You **MUST** update documentation memory whenever completed work materially changes how the system should be understood. Do not leave architectural explanations in chat, PR descriptions, or one-off notes; if it explains the system, it belongs in a durable Doc.

Documentation memory is for:
- architecture overviews
- usage guides
- conceptual explanations
- operational procedures
- workflow references that should remain durable beyond a single session

Documentation records should be detail-first, self-contained explanations for future human and AI readers. A good Loom doc captures the problem framing, system shape, rationale for the current design, important assumptions, scope and non-goals, dependencies, risks, edge cases, examples, acceptance or verification signals, provenance to the completed work that changed understanding, and open questions when uncertainty remains. Be detailed at the documentation layer without duplicating neighboring layers' live execution state, and write clearly enough that someone who was not present for the implementation can still understand what changed and why it matters.

You **MUST** create or update a doc when work is any of the following:
- completed enough that the surrounding understanding should now change
- materially changes architecture, workflows, setup, operations, or conceptual boundaries
- useful as durable onboarding or AI-memory context for later work
- broader than a narrow symbol-by-symbol reference update

You **MUST** also ingest existing high-value repository documentation (such as `README.md`, `CONTRIBUTING.md`, architecture notes, or API overviews) into the Docs module. This creates a reasoned metadata layer over the raw files, enabling semantic linking, topic tagging, and better retrieval. Use the `upstreamPath` field to establish the causal link between the internal Doc record and the repository source file.

When documentation workflow applies:
- inspect existing docs before creating a new documentation record so the corpus stays focused instead of fragmenting
- compile or read the documentation packet before updating a doc so the maintainer starts from bounded context rather than chat residue
- keep governed topic ownership, verification evidence, and drift audit results explicit; missing metadata is governance debt to surface, not truth to infer from filenames or titles
- keep documentation high-level, explanatory, and dense with architecture or workflow context, rationale, examples, and audience-aware framing rather than API-reference snippets
- do not write shallow blurbs or minimal summaries; documentation should stand on its own for someone who was not present during implementation
- update documentation only after implementation reality is known and relevant critique concerns have been resolved or accepted into durable understanding
- treat constitutional memory as the durable project-policy layer, research as the evidence layer, initiatives as strategic context, specs as standalone declarative behavior contracts for intended system behavior, plans as the execution-strategy layer, tickets as execution history, and critique as adversarial review context
- use plans for pre-completion execution strategy and linked ticket sequencing; use docs only after the accepted system reality is known
- capture accepted system reality and why it matters without duplicating neighboring layers' live state or execution logs
- preserve revision history so documentation changes stay observable and queryable as Loom memory
- keep `linkedOutputPaths` truthful for future sync workflows, but do not silently mutate external docs trees in v1
