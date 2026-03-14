# @pi-loom/pi-constitution

`pi-constitution` adds a durable constitutional-memory layer to pi-compatible runtimes.

When active, the extension teaches the model to preserve project-defining intent as first-class system knowledge instead of burying it in ad hoc operating notes or transient chat. Constitutional state lives in repo-visible files under `.loom/constitution/`, with separate stable artifacts for vision, principles, and constraints, a mutable roadmap layer, an append-only decision log, and a compiled brief optimized for prompt loading.

## Features

- durable constitutional memory in `.loom/constitution/`
- separate stable artifacts for vision, principles, and constraints
- separate roadmap artifact plus canonical roadmap item records
- append-only constitutional decision history
- compiled `brief.md` for AI-facing prompt grounding
- AI-facing `constitution_*` tools with built-in prompt guidance
- `/constitution` slash command namespace for human entrypoints
- system-prompt augmentation via `before_agent_start`
- machine-usable dashboard summaries over completeness and roadmap linkage

## Local layout

```text
.loom/
  constitution/
    state.json
    brief.md
    vision.md
    principles.md
    constraints.md
    roadmap.md
    decisions.jsonl
    roadmap/
      item-001.md
      item-002.md
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
cd packages/pi-constitution
omp -e .
```
