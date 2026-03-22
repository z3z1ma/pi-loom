Ralph is a first-class Loom orchestration layer.

Use Ralph when long-horizon work needs a durable managed loop over execution, critique, revision, and operator steering without collapsing those layers into one transcript.

A strong Ralph run should keep durable state for:
- the governing plan, inherited spec context when present, active ticket, iteration count, and the concrete problem framing that explains why the loop exists now
- linked plan, ticket, critique, spec, research, and doc refs so the orchestration record stays grounded in neighboring Loom layers
- verifier evidence, critique verdicts, acceptance signals, and unresolved blockers that materially inform the next step
- decision rationale covering why the loop continued, paused, halted, completed, or changed focus
- durable steering, stop requests, and packet context that are detailed enough for a later caller to resume truthfully without chat residue
- per-iteration runtime artifacts that make launch lifecycle, tool activity, streamed assistant output, stderr, and missing-checkpoint failures observable after the worker exits
- assumptions, scope boundaries, risks, dependencies, edge cases, and open questions that still constrain the loop

Ralph is distinct from the other Loom layers:
- plans remain the execution-strategy layer and define the governing scope Ralph follows
- tickets remain the live execution ledger and the comprehensive definition of each unit of work
- critique remains the durable review layer
- docs remain the post-completion explanatory layer
- Ralph orchestrates over those artifacts as the managed loop layer

Default Ralph posture:
- treat long transcripts as a liability; prefer fresh-context iterations, but make the durable packet detailed enough to stand on its own between launches
- run one bounded iteration at a time, persist useful post-iteration state, then let the managed loop decide what happens next
- anchor the loop to one governing plan; inherit the governing spec from that plan when present rather than asking callers to restate it
- maintain one managed Ralph loop per workspace; do not fork competing plan loops in the same workspace
- if the governing plan has no linked tickets yet, synthesize ticket scope inside the managed loop and pause for review if executable tickets still do not exist
- require explicit stop and pause behavior; do not trust model confidence alone
- ground continuation decisions in verifier outputs, critique findings, linked acceptance signals, and the governing plan ticket graph
- reject shallow run updates; each iteration record should capture substantive context, what changed, what was verified, what failed, and what remains unresolved

Use Ralph tools to:
- use `ralph_run` to start a new managed loop with `planRef` or continue an existing loop with `ref`
- use `ralph_steer` to queue durable steering for the next iteration boundary
- use `ralph_stop` to request a clean stop for the managed loop
- use `ralph_read` to inspect packets, dashboards, and durable run state between iterations
- use `ralph_job_read`, `ralph_job_wait`, and `ralph_job_cancel` when `ralph_run` is operating in background mode and you need explicit job control
- use `ralph_checkpoint` only inside the fresh Ralph worker session that is committing one bounded iteration outcome

Ralph remains directly usable on its own. Its user-facing surfaces should stay Ralph-native even when higher-level orchestration layers choose to build on top of it.

AI-direct Ralph usage should be explicit rather than inferred:
- for a new loop, call `ralph_run` with `planRef`; the governing spec is inherited from the plan when present
- for an existing loop, call `ralph_run` with `ref` and optionally `steeringPrompt` when you want the next iteration to pick up new direction
- use `ralph_steer` when you need durable steering without starting or interrupting a loop immediately
- leave `background` unset unless you intentionally need a foreground call; the canonical production path is the background managed loop
- inspect the durable result with `ralph_read` if you need more detail between iterations
- use `ralph_job_wait` or `ralph_job_cancel` rather than inventing ad hoc polling or cancellation behavior for background Ralph work
- use `ralph_stop` when the operator wants the loop to end cleanly instead of silently abandoning the current run
- do not manually reconstruct low-level create/launch choreography or a planning-only Ralph mode unless you are implementing Ralph itself
