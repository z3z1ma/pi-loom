# Workspace package reliability scrub execution Planning Packet



## Planning Target

workspace-package-reliability-scrub [active] Workspace package reliability scrub
Objective: Improve the correctness, robustness, and internal cohesion of all shipped Pi Loom packages through a manager-led cross-package audit and remediation pass.
Status summary: Manager-led scrub is active with plan `workspace-package-reliability-scrub-execution`, manager ticket t-0027, and cluster tickets t-0028 through t-0030.
Milestones: 1

## Current Plan Summary

Manager led execution strategy for auditing all Pi Loom packages and landing validated reliability, robustness, and cohesion fixes.

## Planning Boundaries

- Keep `plan.md` deeply detailed at the execution-strategy layer; it should explain sequencing, rationale, risks, and validation without duplicating ticket-by-ticket live state.
- Use `pi-ticketing` to create, refine, or link tickets explicitly. Plans provide coordination context around those tickets, and linked tickets stay fully detailed and executable in their own right.
- Treat linked tickets as the live execution system of record for status, dependencies, verification, and checkpoints, and as self-contained units of work with their own acceptance criteria and execution context.
- Preserve truthful source refs, ticket roles, assumptions, risks, and validation intent so a fresh planner can resume from durable context.

## Linked Tickets

- t-0027 [in_progress] Manage workspace package reliability scrub — manager
- t-0028 [in_progress] Scrub foundation memory packages for robustness issues — foundation-cluster
- t-0029 [in_progress] Scrub ticketing and worker execution packages — execution-cluster
- t-0030 [in_progress] Scrub critique Ralph and docs packages — orchestration-cluster

## Scope Paths

- packages/pi-constitution
- packages/pi-critique
- packages/pi-docs
- packages/pi-initiatives
- packages/pi-plans
- packages/pi-ralph
- packages/pi-research
- packages/pi-specs
- packages/pi-ticketing
- packages/pi-workers

## Constitutional Context

Project: Pi Loom
Strategic direction: Turn Pi Loom into a repo-truthful, composable, local operating system for long-horizon technical work by grounding every layer in durable constitutional policy, explicit graph relationships, observable artifacts, and bounded orchestration.
Current focus: Deepen Ralph’s bounded verifier and critique loop without erasing the surrounding Loom layer boundaries.; Derive constitutional memory directly from the root constitution, README, and shipped repository behavior instead of maintaining a thin summary that drifts from source truth.; Harden the observable graph across constitution, research, initiatives, specs, plans, tickets, workers, critique, Ralph, and docs so state is recoverable from durable artifacts.
Open constitutional questions: How much explicit hypothesis and rejected-path structure should the research layer carry before it becomes ceremony?; What verifier and policy contracts should Ralph support before any broader orchestration is considered?; When, if ever, should broader worker coordination or multi-repository execution become first-class in Pi Loom?; Which external sync or publishing surfaces are worth adding after local-first durability is complete?; Which process-memory concerns deserve first-class Loom artifacts rather than remaining in AGENTS, critique, or documentation?

## Roadmap Items

- item-002 [active/now] Harden cross-layer provenance, packets, dashboards, and queryability — Make the graph linking constitution, research, initiatives, specs, plans, tickets, workers, critiques, Ralph runs, and docs easier to recover, inspect, and trust from durable artifacts.

## Initiatives

- workspace-package-reliability-scrub [active] Workspace package reliability scrub — Improve the correctness, robustness, and internal cohesion of all shipped Pi Loom packages through a manager-led cross-package audit and remediation pass.

## Research

- repository-hygiene-and-artifact-robustness-audit [synthesized] Repository hygiene and artifact robustness audit — conclusions: `dashboard.json` behaves like a derived observability rollup today, but the code stamps volatile generation timestamps that guarantee git churn when the artifact is tracked.; Absolute path leakage also exists in tool-returned summary/read contracts, not only in persisted files.; Fresh critique/docs/ralph subprocess launches currently derive the extension root from the consumer workspace instead of the package root, which is fragile outside this monorepo.; Repository documentation does not yet define which `.loom` artifacts are canonical and should be committed versus which are generated/runtime-only.; Several Loom layers persist absolute workspace paths into durable `.loom` artifacts, which breaks portability across clones and creates misleading checked-in state.; Top-level documentation contains path drift (`.loom/constitutional` vs `.loom/constitution`) and the `pi-ralph` README understates shipped behavior.
- workspace-package-robustness-scrub-2026-03 [synthesized] Workspace package robustness scrub 2026-03 — conclusions: Dashboard and read surfaces must tolerate stale linked refs by surfacing discrepancies rather than throwing or under-reporting missing linked work.; Execution and review state machines must not let optimistic status transitions overrule unresolved blockers or newly introduced findings.; Metadata-only updates must preserve previously stored artifact content instead of rewriting durable truth with summaries.; Path-like durable references must normalize to canonical IDs before validation so artifact-path callers do not silently fail valid lookups.; Projection and orchestration layers must re-evaluate all fields they own when deciding whether existing durable artifacts remain current.

## Specs

(none)

## Tickets

- t-0027 [in_progress] Manage workspace package reliability scrub — Coordinate the repo-wide package scrub, keep durable execution state truthful, and consolidate validated fixes from the package-cluster workstreams.
- t-0028 [in_progress] Scrub foundation memory packages for robustness issues — Audit and remediate latent correctness, robustness, and cohesion issues in the foundation memory packages: constitution, research, initiatives, specs, and plans.
- t-0029 [in_progress] Scrub ticketing and worker execution packages — Audit and remediate latent correctness, robustness, and cohesion issues in the execution substrate packages: ticketing and workers.
- t-0030 [in_progress] Scrub critique Ralph and docs packages — Audit and remediate latent correctness, robustness, and cohesion issues in the review/orchestration packages: critique, Ralph, and docs.

## Critiques

(none)

## Documentation

(none)
