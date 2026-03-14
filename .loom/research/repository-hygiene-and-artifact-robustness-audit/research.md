---
id: repository-hygiene-and-artifact-robustness-audit
title: "Repository hygiene and artifact robustness audit"
status: synthesized
created-at: 2026-03-15T21:44:12.392Z
updated-at: 2026-03-15T21:55:06.574Z
initiatives: []
specs: []
tickets:
  - t-0008
  - t-0009
  - t-0010
  - t-0011
  - t-0012
  - t-0013
  - t-0014
capabilities: []
artifacts:
  - artifact-001
---

## Question
What correctness, robustness, and repository-hygiene issues exist across the Pi Loom packages, especially around path handling, persisted artifacts, and git cleanliness?

## Objective
Audit all package implementations for issues, enhancements, bugs, and opportunities; preserve findings durably; and identify what persisted artifacts should or should not be committed.

## Status Summary
Audit complete. Filed execution tickets for path portability, dashboard churn, subprocess launch root correctness, `.loom` commit policy, path API normalization, and documentation truthfulness.

## Scope
- .loom artifact examples
- packages/pi-constitution
- packages/pi-critique
- packages/pi-docs
- packages/pi-initiatives
- packages/pi-plans
- packages/pi-ralph
- packages/pi-research
- packages/pi-specs
- packages/pi-ticketing
- root README/package/workspace config

## Non-Goals
- Implement fixes during this audit
- Produce speculative findings without repository evidence

## Methodology
- Compare checked-in .loom artifacts with code expectations
- Inspect root guidance and package entrypoints
- Persist findings as research conclusions and execution tickets
- Review dashboard and state render/store code for mutable generated fields
- Search for path serialization and artifact-writing patterns

## Keywords
- artifacts
- dashboard
- git-cleanliness
- paths
- relative-paths
- repo-hygiene
- robustness

## Hypotheses
(none)

## Conclusions
- `dashboard.json` behaves like a derived observability rollup today, but the code stamps volatile generation timestamps that guarantee git churn when the artifact is tracked.
- Absolute path leakage also exists in tool-returned summary/read contracts, not only in persisted files.
- Fresh critique/docs/ralph subprocess launches currently derive the extension root from the consumer workspace instead of the package root, which is fragile outside this monorepo.
- Repository documentation does not yet define which `.loom` artifacts are canonical and should be committed versus which are generated/runtime-only.
- Several Loom layers persist absolute workspace paths into durable `.loom` artifacts, which breaks portability across clones and creates misleading checked-in state.
- Top-level documentation contains path drift (`.loom/constitutional` vs `.loom/constitution`) and the `pi-ralph` README understates shipped behavior.

## Recommendations
- Correct README drift immediately so maintainers copy accurate path and capability guidance.
- Define a cross-layer contract for path fields in tool outputs so summaries and read results do not expose clone-specific absolute paths.
- Document a repository-wide `.loom` artifact commit policy and align `.gitignore`/store behavior with it.
- Either make dashboards semantically stable on no-op updates or treat them as generated artifacts and keep them out of git.
- Normalize persisted path-bearing fields to repo-relative paths or resolvable ids before writing durable artifacts.
- Refactor critique/docs/ralph subprocess launchers to resolve extension package roots from package metadata and share the logic.

## Open Questions
- Which path-bearing fields are consumed externally and therefore require a migration strategy?
- Which persisted artifacts are intended as canonical examples versus generated cache-like views?

## Linked Work
- ticket:t-0008
- ticket:t-0009
- ticket:t-0010
- ticket:t-0011
- ticket:t-0012
- ticket:t-0013
- ticket:t-0014

## Artifacts
- artifact-001 [summary] Cross-package audit findings on path portability and artifact hygiene
