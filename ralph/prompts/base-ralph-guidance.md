Ralph is a first-class Loom orchestration layer.

Use Ralph when long-horizon work needs a durable managed loop over execution, critique, revision, and operator steering without collapsing those layers into one transcript.

A strong Ralph run should keep durable state for:
- the governing plan, inherited spec context when present, active ticket, iteration count, and the concrete problem framing that explains why the loop exists now
- linked plan, ticket, critique, spec, research, and doc refs so the orchestration record stays grounded in neighboring Loom layers
- verifier evidence, critique verdicts, acceptance signals, and unresolved blockers that materially inform the next step
- decision rationale covering why the loop continued, paused, halted, completed, or changed focus
- durable steering, stop requests, and packet context that are detailed enough for a later caller to resume truthfully without chat residue
- per-iteration runtime artifacts that make launch lifecycle, tool activity, streamed assistant output, stderr, and missing-ticket-activity failures observable after the worker exits without persisting machine-local spawn paths into durable state
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
- bind each Ralph run to one exact ticket and use a governing plan when one is supplied or inferable; inherit the governing spec from that plan when present rather than asking callers to restate it
- treat the bound ticket as the authoritative execution ledger; every bounded iteration must keep that ticket truthful through status, notes, verification, and blocker updates before the worker exits
- multiple managed Ralph loops may coexist in one workspace when they do not execute the same ticket concurrently; do not let two loops work the same ticket at the same time
- require explicit stop and pause behavior; do not trust model confidence alone
- ground continuation decisions in verifier outputs, critique findings, linked acceptance signals, and the current ticket state under its governing plan
- reject shallow run updates; each iteration record should capture substantive context, what changed, what was verified, what failed, and what remains unresolved

Use Ralph tools to:
- use `ralph_run` with required `ticketRef` and optional `planRef` to create or resume the system-owned Ralph run for that exact ticket binding
- use `ralph_steer` to queue minor additive steering for the next iteration boundary without replacing the governing ticket contract
- use `ralph_stop` to request a clean stop for the managed loop
- use `ralph_read` to inspect packets, dashboards, and durable run state between iterations
- use `ralph_job_read`, `ralph_job_wait`, and `ralph_job_cancel` when `ralph_run` is operating in background mode and you need explicit job control

Ralph remains directly usable on its own. Its user-facing surfaces should stay Ralph-native even when higher-level orchestration layers choose to build on top of it.

AI-direct Ralph usage should be explicit rather than inferred:
- call `ralph_run` with `ticketRef` and optionally `planRef`; Ralph derives or creates the system-owned run id for that ticket binding internally and infers the plan when it can
- use `ralph_steer`, `ralph_stop`, and `ralph_read` with the same `ticketRef` and optional `planRef` instead of choosing run ids in AI input
- use steering only for small clarifications or reprioritization; do not use it to override the ticket, rewrite Ralph's base discipline, or micromanage the loop step by step
- leave `background` unset unless you intentionally need a foreground call; the canonical production path is the background managed loop
- inspect the durable result with `ralph_read` if you need more detail between iterations
- use `ralph_job_wait` or `ralph_job_cancel` rather than inventing ad hoc polling or cancellation behavior for background Ralph work
- use `ralph_stop` when the operator wants the loop to end cleanly instead of silently abandoning the current run
- do not manually reconstruct low-level create/launch choreography or a planning-only Ralph mode unless you are implementing Ralph itself
