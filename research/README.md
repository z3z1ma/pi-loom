# pi-loom/research

`pi-loom` adds a durable research-memory layer to pi-compatible runtimes.

When active, the extension teaches the model to preserve exploratory work as first-class system knowledge instead of transient chat context. Research state is persisted in SQLite via pi-storage, with human-facing syntheses generated from canonical records when review or handoff needs them.

## Features

- durable research records persisted in SQLite via pi-storage
- `research_list` is broad-text-first; exact-match narrowing parameters are prefixed with `exact*`, and zero-result overfiltered searches surface broader-match diagnostics instead of a bare empty state
- append-only hypothesis history, including rejected hypotheses
- current-state note, experiment, and source artifacts with machine-usable inventory
- explicit links to initiatives, specs, and tickets
- AI-facing `research_*` tools with built-in prompt guidance
- system-prompt augmentation via `before_agent_start`
- computed dashboard and map views over linked work (generated from SQLite, not filesystem-backed)

## Behavioral guarantees

- `research_read` only loads existing records. Unknown ids or `research:<id>` refs fail instead of creating placeholders.
- Child writes such as hypotheses, artifacts, and link or unlink operations also fail on unknown research ids.
- Research summaries remain mutable as investigations evolve, while hypothesis history stays append-only so prior reasoning is preserved.
- Artifact ids represent the current stored state for that artifact record. Updating an artifact id replaces its current metadata/body instead of creating immutable evidence snapshots.
- `research_list.exactKeyword` is an exact filter against the stored `keywords` list, not a fuzzy full-text match.

## Storage model

Research state, metadata, hypotheses, artifacts, and inventory are persisted in SQLite via pi-storage. Any rendered markdown synthesis is an export from canonical records rather than durable source state. Reads and child writes do not auto-create missing research records; new investigations must be created explicitly before they can be updated.

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
