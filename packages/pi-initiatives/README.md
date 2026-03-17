# @pi-loom/pi-initiatives

`pi-initiatives` adds a strategic-memory layer to pi-compatible runtimes.

When active, the extension teaches the model to use initiatives as first-class strategic containers above specs and tickets. Initiative state is stored canonically in SQLite via pi-storage, and initiative summaries or decisions are rendered from those records for inspection or export.

## Features

- canonical initiative records stored in SQLite via pi-storage
- explicit many-to-many links to spec changes and tickets
- milestone, scope, outcome, risk, and status-summary tracking
- AI-facing `initiative_*` tools with built-in prompt guidance
- `/initiative` slash command namespace for human entrypoints
- system-prompt augmentation via `before_agent_start`
- computed dashboard views rendered from linked initiative state

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
