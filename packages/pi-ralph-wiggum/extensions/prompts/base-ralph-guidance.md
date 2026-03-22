Ralph is a first-class Loom orchestration layer.

Use Ralph when long-horizon work needs a durable loop over planning, execution, critique, and revision without collapsing those layers into one transcript.

A strong Ralph run should keep durable state for:
- the current objective, iteration count, and the concrete problem framing that explains why the run exists now
- linked plan, ticket, critique, spec, research, and doc refs so the orchestration record stays grounded in neighboring Loom layers
- verifier evidence, critique verdicts, acceptance signals, and unresolved blockers that materially inform the next step
- decision rationale covering why the run continued, paused, escalated, stopped, or changed focus
- fresh-context launch descriptors and bounded packets that are detailed enough for a later caller to resume truthfully without chat residue
- per-iteration runtime artifacts that make launch lifecycle, tool activity, streamed assistant output, stderr, and missing-checkpoint failures observable after the worker exits
- assumptions, scope boundaries, risks, dependencies, edge cases, and open questions that still constrain the loop

Ralph is distinct from the other Loom layers:
- plans remain the execution-strategy layer
- tickets remain the live execution ledger and the comprehensive definition of each unit of work
- critique remains the durable review layer
- docs remain the post-completion explanatory layer
- Ralph orchestrates over those artifacts as the bounded loop layer

Default Ralph posture:
- treat long transcripts as a liability; prefer fresh-context iterations, but make the durable packet detailed enough to stand on its own between launches
- execute one bounded iteration at a time, persist useful post-iteration state, then exit cleanly
- anchor each execution run to one governing spec and, for build work, one governing plan plus one active ticket instead of a free-form objective alone
- require explicit stop policies; do not trust model confidence alone
- ground continuation decisions in verifier outputs, critique findings, and linked acceptance signals
- preserve why the run continued, paused, escalated, or stopped so later callers can resume truthfully
- reject shallow run updates; each iteration record should capture substantive context, what changed, what was verified, what failed, and what remains unresolved

Use Ralph tools to:
- list and inspect bounded Ralph runs
- use `ralph_run` as the primary AI-facing loop tool for bounded session-runtime execution
- use `ralph_read` between iterations to inspect packets, dashboards, and durable run state
- use `ralph_checkpoint` inside a fresh Ralph worker session to commit one complete iteration outcome
- use `ralph_job_read`, `ralph_job_wait`, and `ralph_job_cancel` when `ralph_run` is launched in background mode and you need explicit job control

Ralph remains directly usable on its own. Its user-facing surfaces should stay Ralph-native even when higher-level orchestration layers choose to build on top of it.

AI-direct Ralph usage should be explicit rather than inferred:
- for a new planning run, call `ralph_run` with `scope.mode = "plan"` plus the governing spec ref
- for a new execution run, call `ralph_run` with `scope.mode = "execute"` plus the governing spec ref, plan ref, and active ticket ref
- set `background: true` on `ralph_run` when the bounded iteration will take a while and you want a Ralph job id instead of blocking
- inspect the durable result with `ralph_read` if you need more detail
- use `ralph_job_wait` or `ralph_job_cancel` rather than inventing ad hoc polling or cancellation behavior for background Ralph work
- if the latest decision is `continue`, call `ralph_run` again for the next single bounded iteration after inspecting the durable packet and scope
- do not manually reconstruct the low-level create/launch/read choreography unless you are implementing Ralph itself
