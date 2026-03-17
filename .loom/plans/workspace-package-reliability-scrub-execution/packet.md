# Workspace package reliability scrub execution Planning Packet



## Planning Target

workspace-package-reliability-scrub [completed] Workspace package reliability scrub
Objective: Improve the correctness, robustness, and internal cohesion of all shipped Pi Loom packages through a manager-led cross-package audit and remediation pass.
Status summary: Completed manager-led scrub across all ten shipped packages. Ten latent issues were fixed, all cluster tickets closed, and workspace verification passed.
Milestones: 1

## Current Plan Summary

Manager led execution strategy for auditing all Pi Loom packages and landing validated reliability, robustness, and cohesion fixes.

## Planning Boundaries

- Keep `plan.md` deeply detailed at the execution-strategy layer; it should explain sequencing, rationale, risks, and validation without duplicating ticket-by-ticket live state.
- Use `pi-ticketing` to create, refine, or link tickets explicitly. Plans provide coordination context around those tickets, and linked tickets stay fully detailed and executable in their own right.
- Treat linked tickets as the live execution system of record for status, dependencies, verification, and checkpoints, and as self-contained units of work with their own acceptance criteria and execution context.
- Preserve truthful source refs, ticket roles, assumptions, risks, and validation intent so a fresh planner can resume from durable context.

## Linked Tickets

- t-0027 [closed] Manage workspace package reliability scrub — manager
- t-0028 [closed] Scrub foundation memory packages for robustness issues — foundation-cluster
- t-0029 [closed] Scrub ticketing and worker execution packages — execution-cluster
- t-0030 [closed] Scrub critique Ralph and docs packages — orchestration-cluster

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
Strategic direction: (empty)
Current focus: none
Open constitutional questions: Capture the architectural and business constraints.; Capture the guiding decision principles.; Capture the strategic direction and roadmap.; Define the durable project vision.

## Roadmap Items

(none)

## Initiatives

- workspace-package-reliability-scrub [completed] Workspace package reliability scrub — Improve the correctness, robustness, and internal cohesion of all shipped Pi Loom packages through a manager-led cross-package audit and remediation pass.

## Research

- repository-hygiene-and-artifact-robustness-audit [synthesized] Repository hygiene and artifact robustness audit — conclusions: `dashboard.json` behaves like a derived observability rollup today, but the code stamps volatile generation timestamps that guarantee git churn when the artifact is tracked.; Absolute path leakage also exists in tool-returned summary/read contracts, not only in persisted files.; Fresh critique/docs/ralph subprocess launches currently derive the extension root from the consumer workspace instead of the package root, which is fragile outside this monorepo.; Repository documentation does not yet define which `.loom` artifacts are canonical and should be committed versus which are generated/runtime-only.; Several Loom layers persist absolute workspace paths into durable `.loom` artifacts, which breaks portability across clones and creates misleading checked-in state.; Top-level documentation contains path drift (`.loom/constitutional` vs `.loom/constitution`) and the `pi-ralph` README understates shipped behavior.
- workspace-package-robustness-scrub-2026-03 [synthesized] Workspace package robustness scrub 2026-03 — conclusions: Dashboard and read surfaces must tolerate stale linked refs by surfacing discrepancies rather than throwing or under-reporting missing linked work.; Execution and review state machines must not let optimistic status transitions overrule unresolved blockers or newly introduced findings.; Metadata-only updates must preserve previously stored artifact content instead of rewriting durable truth with summaries.; Path-like durable references must normalize to canonical IDs before validation so artifact-path callers do not silently fail valid lookups.; Projection and orchestration layers must re-evaluate all fields they own when deciding whether existing durable artifacts remain current.

## Specs

(none)

## Tickets

- t-0027 [closed] Manage workspace package reliability scrub — Coordinate the repo-wide package scrub, keep durable execution state truthful, and consolidate validated fixes from the package-cluster workstreams.
- t-0028 [closed] Scrub foundation memory packages for robustness issues — Audit and remediate latent correctness, robustness, and cohesion issues in the foundation memory packages: constitution, research, initiatives, specs, and plans.
- t-0029 [closed] Scrub ticketing and worker execution packages — Audit and remediate latent correctness, robustness, and cohesion issues in the execution substrate packages: ticketing and workers.
- t-0030 [closed] Scrub critique Ralph and docs packages — Audit and remediate latent correctness, robustness, and cohesion issues in the review/orchestration packages: critique, Ralph, and docs.

## Critiques

(none)

## Documentation

(none)
