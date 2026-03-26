---
id: test-suite-runtime-diagnosis-after-sqlite-cutover
title: "Test suite runtime diagnosis after SQLite cutover"
status: proposed
created-at: 2026-03-18T06:23:10.999Z
tags:
  - performance
  - sqlite-cutover
  - test-infra
source-refs:
  - package.json
  - packages/pi-critique/__tests__/tools.test.ts
  - packages/pi-ralph/__tests__/store.test.ts
  - packages/pi-ralph/__tests__/tools.test.ts
  - packages/pi-storage/storage/entities.ts
  - packages/pi-storage/storage/sqlite.ts
  - packages/pi-storage/storage/workspace.ts
  - packages/pi-ticketing/extensions/domain/store.ts
  - packages/pi-workers/__tests__/commands.test.ts
  - packages/pi-workers/__tests__/runtime.test.ts
  - packages/pi-workers/__tests__/store.test.ts
  - packages/pi-workers/__tests__/tools.test.ts
  - vitest.config.ts
---

## Question
Why does the full Vitest suite take intolerably long after the SQLite-only persistence cutover, and what changes should reduce wall clock without sacrificing coverage?

## Objective
Diagnose dominant runtime costs using static analysis and targeted inspection instead of rerunning the full suite repeatedly.

## Status Summary
Static analysis shows the suite is dominated by integration-style tests that repeatedly create temp Git repos/worktrees and reopen SQLite catalogs under default Vitest file parallelism. The primary issue is not real subprocess launches; it is concurrent filesystem/process churn plus repeated catalog opens/migrations and scan-heavy canonical lookup helpers.

## Scope
- packages/pi-critique/__tests__
- packages/pi-ralph/__tests__
- packages/pi-storage/__tests__
- packages/pi-storage/storage/sqlite.ts
- packages/pi-storage/storage/workspace.ts
- packages/pi-ticketing/extensions/domain/store.ts
- packages/pi-workers/__tests__
- vitest.config.ts

## Non-Goals
- Do not benchmark every test file dynamically.
- Do not optimize production runtime behavior before proving test infrastructure is the bottleneck.
- Do not redesign the entire test strategy in one pass.

## Methodology
- Inspect Vitest configuration and npm test entrypoint.
- Read heavy worker/Ralph/critique/storage test files and shared helpers.
- Synthesize likely root causes and low-risk remediation options.
- Trace git/worktree, SQLite-open, and launch/mock paths through runtime/store code.

## Keywords
- critique
- git worktree
- performance
- ralph
- sqlite
- tests
- vitest
- worker runtime

## Conclusions
- Ralph and critique heavy suites are dominated by repeated packet/dashboard rebuilds and repeated catalog opens, not actual pi subprocess launches.
- SQLite itself is not the core issue; repeated catalog construction, workspace identity upserts, and full-list entity lookups amplify cost.
- The largest wall-clock driver is default Vitest parallelism applied to Git/SQLite-heavy integration files.
- Timeout inflation is a symptom, not the cause.
- Worker runtime/store/tool suites are the biggest single contributors because they repeatedly bootstrap Git repos and provision worktrees even when runtime execution is mocked.

## Recommendations
- Add direct SQL lookup by display_id to replace list-and-find scan helpers in canonical store code.
- Cache or reuse SQLite catalog handles in sync store helpers instead of constructing new SqliteLoomCatalog instances per lookup.
- Extract shared seeded Git repo fixtures so tests stop repeating git init/config/add/commit in many files.
- Narrow the heaviest test files so mocked-runtime tests do not still pay real worktree provisioning costs.
- Split storage/worker/ralph/critique integration suites into a low-parallel or serialized Vitest project/script.

## Open Questions
- Should sync store helpers be removed entirely from heavy packages, or merely memoized for tests and repeated command flows?
- What is the best repo-level split between unit-style and integration-style Vitest projects?

## Linked Work
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)

## Hypotheses
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)

## Artifacts
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)
