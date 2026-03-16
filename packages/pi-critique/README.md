# @pi-loom/pi-critique

Durable critique memory for pi.

This package adds a first-class critique layer under `.loom/critiques/` so review packets, critique runs, findings, and follow-up ticket linkage survive beyond the current session.

## Capabilities

- `/critique` command surface for creating, reading, launching, and resolving critiques
- `critique_*` tools for list/read/write/launch/run/finding/dashboard workflows
- durable critique records with canonical `state.json`, `packet.md`, `critique.md`, `runs.jsonl`, `findings.jsonl`, and `dashboard.json`, plus runtime-only `launch.json`
- packet compilation that pulls linked constitution, initiative, research, spec, and ticket context into a fresh-review handoff
- follow-up ticket creation for accepted findings

## Artifact policy

- commit `state.json`, `packet.md`, `critique.md`, `runs.jsonl`, `findings.jsonl`, and `dashboard.json`; they are the durable repo-visible critique record
- do not commit `launch.json`; it is only a local handoff descriptor for launching or resuming a critique run in a fresh session or subprocess
- generated packets and dashboards are still canonical when they capture critique state another clone needs to inspect or continue the review truthfully

## Launch semantics

`pi-critique` owns both the launch contract and a default executable launch adapter.

- `critique_launch` writes an explicit `launch.json` descriptor and packet path, then executes the critique synchronously in a separate fresh `pi` process; callers should allow a long timeout because the tool blocks until that critic exits
- the interactive `/critique launch` command opens a fresh session via `ctx.newSession(...)` and prefills the reviewer prompt for a human-visible handoff
- tool execution uses a subprocess because tool handlers receive `ExtensionContext`, not the command-only session controls like `ctx.newSession(...)`
- a successful `critique_launch` must land a durable `critique_run`; a clean subprocess exit without a persisted run is treated as failure
- external runtimes can still consume the same descriptor using the coding-agent session APIs (`ctx.newSession`, `ctx.switchSession`, `ctx.fork`) or their own subprocess adapter
- subprocess launch follows the same cross-platform CLI resolution discipline used by the existing subagent examples so Windows script resolution stays robust

## Layout

```text
.loom/
  critiques/
    <critique-id>/
      state.json
      packet.md
      critique.md
      runs.jsonl
      findings.jsonl
      dashboard.json
      launch.json      # runtime-only; do not commit
```

## Local use

```bash
cd packages/pi-critique
omp -e .
```
