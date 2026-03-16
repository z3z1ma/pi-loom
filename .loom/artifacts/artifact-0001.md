# Repo-wide package audit — 2026-03-16

Ticket: `t-0040`
Worker: `workspace-package-audit-worker`

## Scope
All ten shipped packages under `packages/`:
- `pi-constitution`
- `pi-research`
- `pi-initiatives`
- `pi-specs`
- `pi-plans`
- `pi-ticketing`
- `pi-workers`
- `pi-critique`
- `pi-ralph`
- `pi-docs`

## Audit method
1. Read the active worker/ticket assignment and prior research/initiative context.
2. Run repo-wide `npm test` inside the worker worktree to look for concrete failures.
3. Re-run the failing areas directly to separate product failures from suite-level robustness issues.
4. Run each package test suite individually to confirm explicit package-by-package coverage.
5. Apply only the narrow, high-confidence fix needed to make the concrete failure mode go green.
6. Record residual risk and open follow-up work durably.

## Concrete finding
### Full-suite timeout fragility in `pi-workers` and `pi-plans` tests
Initial repo-wide `npm test` failed with two timeout failures:
- `packages/pi-workers/__tests__/index.test.ts`
- `packages/pi-plans/__tests__/store.test.ts`

Observed behavior:
- The same tests passed when run directly.
- All package suites passed when run individually.
- The failure mode only appeared under the full repository run, which points to suite-level latency/robustness rather than an isolated functional regression.

Impacted contract:
- Repo-wide verification should be trustworthy from the documented root command set.
- A green per-package story is not enough if the supported top-level `npm test` command flakes under normal suite load.

Why this is real:
- The initial failing `npm test` run produced 2 failed files / 162 total tests because the default time budget was too small for the heaviest integration-style tests under full-suite contention.
- After widening the time budgets on the two affected tests, the same full `npm test` command passed cleanly.

## Fix landed in worker workspace
- `packages/pi-workers/__tests__/index.test.ts`
  - Increased the timeout for the extension registration test to `15_000` ms.
- `packages/pi-plans/__tests__/store.test.ts`
  - Increased the timeout for the plan packet/plan markdown integration test to `20_000` ms.

These changes are intentionally narrow: they stabilize the documented repo-wide verification path without changing product behavior or weakening the tested assertions.

## Follow-up work created
- `t-0043` — Reduce full-suite latency for heavy `pi-workers` and `pi-plans` tests

Reason for follow-up:
- The timeout increase fixes the immediate robustness defect but does not yet explain the dominant runtime cost in those heavy tests.

## Package-by-package coverage evidence
Per-package test suites were run individually in the worker workspace after the initial repo-wide failure triage:
- `pi-constitution`: passed
- `pi-critique`: passed
- `pi-docs`: passed
- `pi-initiatives`: passed
- `pi-plans`: passed
- `pi-ralph`: passed
- `pi-research`: passed
- `pi-specs`: passed
- `pi-ticketing`: passed
- `pi-workers`: passed

The highest-latency individual package runs were:
- `pi-plans`: ~6.7s file duration
- `pi-workers`: ~7.8s file duration

That timing profile is consistent with the full-suite timeout issue and justifies the follow-up ticket.

## Verification executed
- Initial repro: `npm test` (failed with the two timeout findings above)
- Isolated repro check: `npx vitest run packages/pi-workers/__tests__/index.test.ts packages/pi-plans/__tests__/store.test.ts` (passed)
- Package coverage sweep: ran each `packages/pi-*/__tests__` suite individually (all passed)
- Final verification: `npm test` (passed: 64 files, 162 tests)

## Residual risk
- The immediate flake is fixed, but the root cause of the heavy runtime cost is still open.
- Future suite growth could pressure these or neighboring tests again if the underlying runtime profile is not improved.
