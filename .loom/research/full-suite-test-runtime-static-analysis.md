---
id: full-suite-test-runtime-static-analysis
title: "Full-suite test runtime static analysis"
status: proposed
created-at: 2026-03-18T06:23:58.726Z
tags:
  - git
  - performance
  - sqlite
  - tests
  - vitest
source-refs:
  - agent://29-AuditWorkerRuntimeTests
  - agent://30-AuditRalphCritiqueTests
  - agent://31-AuditTestInfra
---

## Question
Why is the full Vitest suite taking intolerably long, and what are the highest-leverage fixes without relying on another full-suite run?

## Objective
Diagnose dominant wall-clock drivers in the current test suite using static analysis and focused inspection of the heaviest packages.

## Status Summary
Static analysis shows the suite is dominated by integration-style tests doing repeated temp-repo bootstrap, git worktree provisioning, repeated SQLite catalog opens/migrations, and full-record/packet rebuilds under default Vitest parallelism. SQLite query latency itself is not the primary issue.

## Scope
- package.json
- packages/pi-critique/__tests__
- packages/pi-critique/extensions/domain/store.ts
- packages/pi-ralph/__tests__
- packages/pi-ralph/extensions/domain/store.ts
- packages/pi-storage/storage/entities.ts
- packages/pi-storage/storage/sqlite.ts
- packages/pi-storage/storage/workspace.ts
- packages/pi-ticketing/extensions/domain/store.ts
- packages/pi-workers/__tests__
- packages/pi-workers/extensions/domain/runtime.ts
- packages/pi-workers/extensions/domain/store.ts
- vitest.config.ts

## Non-Goals
- Do not optimize production runtime paths unrelated to test overhead without evidence.
- Do not rerun the full suite as the primary diagnosis method.

## Methodology
- Audit worker, Ralph, critique, storage, and ticketing tests/helpers for repeated Git, worktree, SQLite, and subprocess usage.
- Differentiate real runtime execution from mocked launch paths.
- Identify repeated catalog-open and scan-heavy code paths in shared storage helpers.
- Inspect Vitest configuration and package scripts for concurrency behavior.

## Keywords
- critique tests
- git worktree
- performance
- ralph tests
- sqlite
- test runtime
- vitest
- worker tests

## Conclusions
- A fourth contributor is scan-heavy lookup behavior such as findEntityByDisplayId implemented as list-and-find, which compounds across ticket-heavy tests.
- A second major contributor is duplicated temp workspace and Git bootstrap logic spread across dozens of test files instead of shared seeded fixtures.
- A third contributor is repeated SQLite catalog construction and migration, especially in sync helpers that bypass the existing workspace cache.
- Ralph and critique are expensive mainly because store operations reopen catalogs and fully rebuild packet/dashboard/rendered state on nearly every transition, even when launches are mocked.
- The largest single-package hotspot is pi-workers, where runtime/store/tools tests repeatedly create fresh Git repos, provision worktrees, and sometimes execute the SDK runtime path.
- The primary wall-clock multiplier is default Vitest file parallelism applied to Git/SQLite-heavy integration suites, especially worker, Ralph, critique, and storage tests.

## Recommendations
- Fifth, narrow expensive tool/store tests so mocked launch paths do not still pay full canonical persistence and worktree setup costs.
- First, split heavy integration suites into a separate Vitest project or script with very low parallelism; keep cheaper unit-like suites parallel.
- Fourth, add a direct SQL getEntityByDisplayId-style lookup and stop using listEntities(...).find(...) in hot write/read paths.
- Second, extract shared seeded Git repo fixtures and stop re-running git init/config/add/commit in every worker/storage test file.
- Third, cache synchronous catalog openers in worker/critique/ralph stores instead of constructing a new SqliteLoomCatalog for every sync access.

## Open Questions
- How much wall-clock time remains after only introducing low-parallel integration runs, before any code-path optimizations?
- Which minimal set of tests must keep real Git worktree integration versus moving to cheaper fixtures?

## Linked Work
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)

## Hypotheses
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)

## Artifacts
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)
