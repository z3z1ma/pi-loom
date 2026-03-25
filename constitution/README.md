# pi-loom/constitution

`pi-loom` adds a durable constitutional-memory layer to pi-compatible runtimes.

When active, the extension teaches the model to preserve project-defining intent as first-class system knowledge instead of burying it in ad hoc operating notes or transient chat. Constitutional state is persisted in SQLite via pi-storage as a single mutable constitution record with canonical vision, principles, constraints, embedded roadmap items, an append-only decision log, and generated briefing material optimized for prompt loading.

## Features

- durable constitutional memory persisted in SQLite via pi-storage
- single mutable constitution aggregate with canonical vision, principles, and constraints
- embedded roadmap items with stable constitution-scoped ids and generated review surfaces
- append-only constitutional decision history
- compiled brief for AI-facing prompt grounding
- AI-facing `constitution_*` tools with built-in prompt guidance
- system-prompt augmentation via `before_agent_start`

## Storage model

Constitutional state, metadata, decisions, and roadmap items are persisted in SQLite via pi-storage. Roadmap items stay embedded inside the singleton constitution state: ids such as `item-001` are stable for roadmap operations inside that aggregate, but they are not global canonical entity ids.

`constitution_write` updates principles and constraints by replacing the full list for that section. There is no entry-level CRUD for those sections in this package today, so callers should write the complete desired set each time.

Any markdown brief or review document is generated from the stored constitution record rather than acting as durable source data.

## Development

From the repo root:

```bash
npm install
npm run check
npm run test
```

To load Pi Loom locally:

```bash
omp -e .
```
