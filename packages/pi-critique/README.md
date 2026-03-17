# @pi-loom/pi-critique

SQLite-backed critique memory for pi.

This package adds a first-class critique layer where critique runs, findings, and follow-up ticket linkage survive beyond the current session. Critique state is stored canonically in SQLite via pi-storage, with packets, dashboards, and findings rendered from those records for inspection or export.

## Capabilities

- `/critique` command surface for creating, reading, launching, and resolving critiques
- `critique_*` tools for list/read/write/launch/run/finding/dashboard workflows
- canonical critique records stored in SQLite with runs and findings history; packets and dashboards are rendered on demand from the SQLite store
- packet compilation that pulls linked constitution, initiative, research, spec, and ticket context into a fresh-review handoff
- follow-up ticket creation for accepted findings

## Artifact policy

- `launch.json` is a runtime-only handoff descriptor for launching or resuming a critique run in a fresh session or subprocess; it should not be treated as durable
- generated packets and dashboards are derived views; the durable critique state lives in SQLite records, not in exported files

## Launch semantics

`pi-critique` owns both the launch contract and a default executable launch adapter.

- `critique_launch` writes an explicit `launch.json` descriptor and packet path, then executes the critique synchronously in a separate fresh `pi` process; callers should allow a long timeout because the tool blocks until that critic exits
- the interactive `/critique launch` command opens a fresh session via `ctx.newSession(...)` and prefills the reviewer prompt for a human-visible handoff
- tool execution uses a subprocess because tool handlers receive `ExtensionContext`, not the command-only session controls like `ctx.newSession(...)`
- a successful `critique_launch` must land a persisted `critique_run` in SQLite; a clean subprocess exit without that stored run is treated as failure
- external runtimes can still consume the same descriptor using the coding-agent session APIs (`ctx.newSession`, `ctx.switchSession`, `ctx.fork`) or their own subprocess adapter
- subprocess launch follows the same cross-platform CLI resolution discipline used by the existing subagent examples so Windows script resolution stays robust


## Local use

```bash
cd packages/pi-critique
omp -e .
```
