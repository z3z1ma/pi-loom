# @pi-loom/pi-specs

`pi-specs` adds a durable specification-memory layer to pi-compatible runtimes.

When active, the extension teaches the model to use specifications as declarative, implementation-decoupled statements of intended program behavior. Specs define the desired capability, constraints, scenarios, and acceptance independent of today's code shape; plans then capture implementation strategy against current code reality, and tickets capture execution truth. Specification state is persisted in SQLite via pi-storage, with canonical change bundles, capability summaries, append-only clarification decisions, spec-quality analysis, checklist artifacts, and explicit initiative membership.

## Features

- durable spec change bundles persisted in SQLite
- canonical capability specs stored in SQLite, with review renderings generated when needed
- append-only clarification and decision history per change
- explicit initiative membership for cross-layer strategic traceability
- AI-facing `spec_*` tools with built-in prompt guidance
- `/spec` slash command namespace for human entrypoints
- system-prompt augmentation via `before_agent_start`

Specs should not directly own tickets as the normative model. The coherent path is spec -> plan -> tickets: the spec declares intended behavior, the plan translates that behavior into implementation strategy and sequencing, and the tickets carry the concrete execution work.

Spec titles should name the behavior or capability being specified, not the implementation delta. Prefer titles like `Dark theme support` or `Offline draft recovery` over change-verb phrasing like `Add dark mode`.

## Storage model

Spec state and metadata are persisted in SQLite via pi-storage. Plans, not specs, connect finalized specs to linked tickets.

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
