# @pi-loom/pi-research

`pi-research` adds a durable, local research-memory layer to pi-compatible runtimes.

When active, the extension teaches the model to preserve exploratory work as first-class system knowledge instead of transient chat context. Research canonical state lives in shared storage, with repo-materialized synthesis markdown and artifact bodies under `.loom/research/`.

## Features

- durable research records in `.loom/research/`
- append-only hypothesis history, including rejected hypotheses
- canonical note, experiment, and source artifacts with machine-usable inventory
- explicit links to initiatives, specs, and tickets
- AI-facing `research_*` tools with built-in prompt guidance
- `/research` slash command namespace for human entrypoints
- system-prompt augmentation via `before_agent_start`
- computed dashboard and map views over linked work (not repo-materialized `dashboard.json`)

## Local layout

```text
.loom/
  research/
    <research-id>/
      research.md
      state.json
      hypotheses.jsonl
      artifacts.json
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
