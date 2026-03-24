# pi-loom/critique

SQLite-backed critique memory for pi.

This package adds a first-class critique layer where critique runs, findings, and follow-up ticket linkage survive beyond the current session. Critique state is stored canonically in SQLite via pi-storage, with packets, dashboards, and findings rendered from those records for inspection or export.

## Capabilities

- `critique_*` tools for list/read/write/launch/run/finding/dashboard workflows
- `critique_list` is broad-text-first; exact-match narrowing parameters are prefixed with `exact*`, and zero-result overfiltered searches surface broader-match diagnostics instead of a bare empty state
- canonical critique records stored in SQLite with runs and findings history; packets and dashboards are rendered on demand from the SQLite store
- packet compilation that pulls linked constitution, initiative, research, spec, and ticket context into a fresh-review handoff
- follow-up ticket creation that marks findings as `accepted` while keeping them active until they are fixed, rejected, or superseded

## Finding lifecycle semantics

- finding bodies are append-only after creation: title, summary, evidence, scope, and recommended action stay stable; later updates only change lifecycle fields like status, linked ticket id, and resolution notes
- critique resolution is blocked while any active findings remain; both `open` and `accepted` findings count as active follow-up work
- findings record the originating `runId`, and the store validates that the referenced run exists on the same critique; the package does not claim stronger run-to-finding causality than that stored reference

## Artifact policy

- `launch.json` is a runtime-only handoff descriptor for launching or resuming a critique run in a fresh session or subprocess; it should not be treated as durable
- generated packets and dashboards are derived views; the durable critique state lives in SQLite records, not in exported files

## Launch semantics

`pi-loom` owns both the launch contract and a default executable launch adapter.

- `critique_launch` writes an explicit `launch.json` descriptor and packet path, then executes the critique synchronously in a separate fresh `pi` process; callers should allow a long timeout because the tool blocks until that critic exits
- tool execution uses a subprocess because tool handlers receive `ExtensionContext`, not the command-only session controls like `ctx.newSession(...)`
- a successful `critique_launch` must land a persisted `critique_run` in SQLite; a clean subprocess exit without that stored run is treated as failure
- external runtimes can still consume the same descriptor using the coding-agent session APIs (`ctx.newSession`, `ctx.switchSession`, `ctx.fork`) or their own subprocess adapter
- subprocess launch follows the same cross-platform CLI resolution discipline used by the existing subagent examples so Windows script resolution stays robust


## Local use

```bash
cd packages/pi-loom
omp -e .
```
