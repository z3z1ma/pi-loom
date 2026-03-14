# @pi-loom/pi-research

`pi-research` adds a durable, local research-memory layer to pi-compatible runtimes.

When active, the extension teaches the model to preserve exploratory work as first-class system knowledge instead of transient chat context. Research state lives in repo-visible files under `.loom/research/`, with durable synthesis, append-only hypothesis history, canonical artifact inventories, linked downstream work, and machine-usable dashboards and maps.

## Features

- durable research records in `.loom/research/`
- append-only hypothesis history, including rejected hypotheses
- canonical note, experiment, and source artifacts with machine-usable inventory
- explicit links to initiatives, specs, and tickets
- AI-facing `research_*` tools with built-in prompt guidance
- `/research` slash command namespace for human entrypoints
- system-prompt augmentation via `before_agent_start`
- stable machine-usable dashboards and graph summaries over linked work

## Local layout

```text
.loom/
  research/
    <research-id>/
      research.md
      state.json
      hypotheses.jsonl
      artifacts.json
      dashboard.json
      notes/
        artifact-001.md
      experiments/
        artifact-002.md
      sources/
        artifact-003.md
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
cd packages/pi-research
omp -e .
```
