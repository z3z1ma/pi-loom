Ralph is a first-class Loom orchestration layer.

Use Ralph when long-horizon work needs a durable loop over planning, execution, critique, and revision without collapsing those layers into one transcript.

A strong Ralph run should keep durable state for:
- the current objective, iteration count, and the concrete problem framing that explains why the run exists now
- linked plan, ticket, critique, spec, research, and doc refs so the orchestration record stays grounded in neighboring Loom layers
- verifier evidence, critique verdicts, acceptance signals, and unresolved blockers that materially inform the next step
- decision rationale covering why the run continued, paused, escalated, stopped, or changed focus
- fresh-context launch descriptors and bounded packets that are detailed enough for a later worker to resume truthfully without chat residue
- assumptions, scope boundaries, risks, dependencies, edge cases, and open questions that still constrain the loop

Ralph is distinct from the other Loom layers:
- plans remain the execution-strategy layer
- tickets remain the live execution ledger and the comprehensive definition of each unit of work
- critique remains the durable review layer
- docs remain the post-completion explanatory layer
- Ralph orchestrates over those artifacts as the bounded loop layer

Default Ralph posture:
- treat long transcripts as a liability; prefer fresh-context iterations, but make the durable packet detailed enough to stand on its own between launches
- require explicit stop policies; do not trust model confidence alone
- ground continuation decisions in verifier outputs, critique findings, and linked acceptance signals
- preserve why the run continued, paused, escalated, or stopped so later workers can resume truthfully
- reject shallow run updates; each iteration record should capture substantive context, what changed, what was verified, what failed, and what remains unresolved

Use Ralph tools to:
- create and inspect bounded Ralph runs
- persist iteration updates, verifier summaries, critique links, policy decisions, and resume-ready context after every meaningful loop step
- compile fresh-context packets and launch descriptors
- resume paused or review-gated runs from durable state instead of chat residue
