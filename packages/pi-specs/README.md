# @pi-loom/pi-specs

`pi-specs` adds a durable specification-memory layer to pi-compatible runtimes.

When active, the extension teaches the model to use specifications as declarative, implementation-decoupled statements of intended program behavior. Specs define the desired capability, constraints, scenarios, and acceptance independent of today's code shape; plans turn that accepted behavior into implementation strategy and linked execution work, and tickets carry the execution truth. Specification state is persisted in SQLite via pi-storage, with durable spec records, canonical capability summaries, append-only clarification decisions, spec-quality analysis, checklist artifacts, and explicit initiative membership.

## Features

- durable specification records persisted in SQLite
- canonical capability specs stored in SQLite, with review renderings generated when needed
- append-only clarification and decision history per spec
- explicit initiative membership for cross-layer strategic traceability
- AI-facing `spec_*` tools with built-in prompt guidance
- `/spec` slash command namespace for human entrypoints
- system-prompt augmentation via `before_agent_start`

The coherent path is spec -> plan -> tickets: the spec declares intended behavior, the plan translates that behavior into implementation strategy and sequencing, and the tickets carry the concrete execution work.

Spec titles should name the behavior or capability being specified, not an implementation-task verb. Prefer titles like `Dark theme support` or `Offline draft recovery` over titles like `Add dark mode`.

## Storage model

Spec state and metadata are persisted in SQLite via pi-storage. Plans connect finalized specs to linked tickets.

## Development

From the repo root:

```bash
npm install
npm run check
npm run test
```

To load only this package locally:

```bash
cd packages/pi-specs
omp -e .
```
