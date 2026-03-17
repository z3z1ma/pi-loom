# Repo hygiene and path portability remediation Planning Packet



## Planning Target

Workspace planning target: repo

## Current Plan Summary

Normalized Loom path handling, stabilized generated dashboards, fixed subprocess runtime rooting, and aligned repository documentation/commit policy.

## Planning Boundaries

- Keep `plan.md` deeply detailed at the execution-strategy layer; it should explain sequencing, rationale, risks, and validation without duplicating ticket-by-ticket live state.
- Use `pi-ticketing` to create, refine, or link tickets explicitly. Plans provide coordination context around those tickets, and linked tickets stay fully detailed and executable in their own right.
- Treat linked tickets as the live execution system of record for status, dependencies, verification, and checkpoints, and as self-contained units of work with their own acceptance criteria and execution context.
- Preserve truthful source refs, ticket roles, assumptions, risks, and validation intent so a fresh planner can resume from durable context.

## Linked Tickets

- t-0008 [closed] Standardize persisted Loom artifact paths as repo-relative — path-portability
- t-0009 [closed] Eliminate git churn from generated dashboard timestamps — dashboard-stability
- t-0010 [closed] Resolve critique/docs/ralph subprocess extension roots from package location — runtime-root-resolution
- t-0011 [closed] Define and enforce commit policy for `.loom` artifacts — commit-policy
- t-0012 [closed] Correct root README constitutional memory path — readme-path-correction
- t-0013 [closed] Update `pi-ralph` README to match shipped functionality — ralph-readme-truthfulness
- t-0014 [closed] Normalize Loom tool-returned path fields to repo-relative values — tool-output-path-contract

## Scope Paths

- .gitignore
- packages/pi-critique
- packages/pi-docs
- packages/pi-initiatives
- packages/pi-plans
- packages/pi-ralph
- packages/pi-research
- packages/pi-specs
- packages/pi-ticketing
- README.md

## Constitutional Context

Project: Pi Loom
Strategic direction: (empty)
Current focus: none
Open constitutional questions: Capture the architectural and business constraints.; Capture the guiding decision principles.; Capture the strategic direction and roadmap.; Define the durable project vision.

## Roadmap Items

(none)

## Initiatives

(none)

## Research

- repository-hygiene-and-artifact-robustness-audit [synthesized] Repository hygiene and artifact robustness audit — conclusions: `dashboard.json` behaves like a derived observability rollup today, but the code stamps volatile generation timestamps that guarantee git churn when the artifact is tracked.; Absolute path leakage also exists in tool-returned summary/read contracts, not only in persisted files.; Fresh critique/docs/ralph subprocess launches currently derive the extension root from the consumer workspace instead of the package root, which is fragile outside this monorepo.; Repository documentation does not yet define which `.loom` artifacts are canonical and should be committed versus which are generated/runtime-only.; Several Loom layers persist absolute workspace paths into durable `.loom` artifacts, which breaks portability across clones and creates misleading checked-in state.; Top-level documentation contains path drift (`.loom/constitutional` vs `.loom/constitution`) and the `pi-ralph` README understates shipped behavior.

## Specs

(none)

## Tickets

- t-0008 [closed] Standardize persisted Loom artifact paths as repo-relative — Several packages persist cwd-derived absolute paths into `.loom` artifacts, making checked-in state machine-specific and non-portable across clones.
- t-0009 [closed] Eliminate git churn from generated dashboard timestamps — Dashboard artifacts are rewritten with volatile `generatedAt` timestamps even when no durable project truth changes, causing meaningless git diffs.
- t-0010 [closed] Resolve critique/docs/ralph subprocess extension roots from package location — Fresh subprocess launches use the user workspace as `pi -e` root instead of the extension package root, which can omit the required extension tooling in installed or externally-consumed setups.
- t-0011 [closed] Define and enforce commit policy for `.loom` artifacts — The repository lacks explicit rules for which `.loom` artifacts are canonical and should be committed versus which are generated/runtime outputs that should remain untracked.
- t-0012 [closed] Correct root README constitutional memory path — The root README points readers to `.loom/constitutional/`, but the implementation and package docs use `.loom/constitution/`.
- t-0013 [closed] Update `pi-ralph` README to match shipped functionality — The `pi-ralph` README still describes major command/tool/runtime/test surfaces as future work even though they are already implemented.
- t-0014 [closed] Normalize Loom tool-returned path fields to repo-relative values — Several packages expose absolute filesystem paths in summaries and read results, which makes tool output machine-specific and encourages those paths to leak into downstream artifacts.

## Critiques

(none)

## Documentation

(none)
