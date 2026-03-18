# @pi-loom/pi-research

`pi-research` adds a durable research-memory layer to pi-compatible runtimes.

When active, the extension teaches the model to preserve exploratory work as first-class system knowledge instead of transient chat context. Research state is persisted in SQLite via pi-storage, with human-facing syntheses generated from canonical records when review or handoff needs them.

## Features

- durable research records persisted in SQLite via pi-storage
- append-only hypothesis history, including rejected hypotheses
- canonical note, experiment, and source artifacts with machine-usable inventory
- explicit links to initiatives, specs, and tickets
- AI-facing `research_*` tools with built-in prompt guidance
- `/research` slash command namespace for human entrypoints
- system-prompt augmentation via `before_agent_start`
- computed dashboard and map views over linked work (generated from SQLite, not filesystem-backed)

## Storage model

Research state, metadata, hypotheses, artifacts, and inventory are persisted in SQLite via pi-storage. Any rendered markdown synthesis is an export from canonical records rather than durable source state.

## Development

From the repo root:

```bash
npm install
npm run check
npm run test
```

To load only this package locally:

```bash
cd packages/pi-research
omp -e .
```
