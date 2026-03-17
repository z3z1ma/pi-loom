# @pi-loom/pi-initiatives

`pi-initiatives` adds a durable strategic-memory layer to pi-compatible runtimes.

When active, the extension teaches the model to use initiatives as first-class strategic containers above specs and tickets. Initiative canonical state lives in shared storage, with repo-materialized initiative briefs and append-only strategic decisions under `.loom/initiatives/`.

## Features

- durable initiative records in `.loom/initiatives/`
- explicit many-to-many links to spec changes and tickets
- milestone, scope, outcome, risk, and status-summary tracking
- AI-facing `initiative_*` tools with built-in prompt guidance
- `/initiative` slash command namespace for human entrypoints
- system-prompt augmentation via `before_agent_start`
- computed dashboard views over linked work (not repo-materialized `dashboard.json`)

## Local layout

```text
.loom/
  initiatives/
    <initiative-id>/
      initiative.md
      state.json
      decisions.jsonl
```

## Development

From the repo root:

```bash
npm install
npm run check
npm run test
```

To load only this package locally:

```bash
cd packages/pi-initiatives
omp -e .
```
