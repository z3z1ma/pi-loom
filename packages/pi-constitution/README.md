# @pi-loom/pi-constitution

`pi-constitution` adds a durable constitutional-memory layer to pi-compatible runtimes.

When active, the extension teaches the model to preserve project-defining intent as first-class system knowledge instead of burying it in ad hoc operating notes or transient chat. Constitutional state is persisted in SQLite via pi-storage, with canonical vision, principles, constraints, roadmap items, an append-only decision log, and generated briefing material optimized for prompt loading.

## Features

- durable constitutional memory persisted in SQLite via pi-storage
- separate canonical records for vision, principles, and constraints
- canonical roadmap items with generated review surfaces when needed
- append-only constitutional decision history
- compiled brief for AI-facing prompt grounding
- AI-facing `constitution_*` tools with built-in prompt guidance
- `/constitution` slash command namespace for human entrypoints
- system-prompt augmentation via `before_agent_start`
- machine-usable dashboard summaries over completeness and roadmap linkage

## Storage model

Constitutional state, metadata, decisions, and roadmap items are persisted in SQLite via pi-storage. Any markdown brief or review document is generated from those records rather than acting as durable source data.

## Development

From the repo root:

```bash
npm install
npm run check
npm run test
```

To load only this package locally:

```bash
cd packages/pi-constitution
omp -e .
```
