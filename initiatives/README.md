# pi-loom/initiatives

`pi-loom` adds a strategic-memory layer to pi-compatible runtimes.

When active, the extension teaches the model to use initiatives as first-class strategic containers above specs and tickets. Initiatives group related standalone specs and linked execution work into one durable strategic record without turning the initiative itself into a rollout checklist. Initiative state is stored canonically in SQLite via pi-storage, and initiative summaries or decisions are rendered from those records for inspection or export.

`initiative_read` only loads existing initiatives. It accepts either an initiative id such as `platform-modernization` or an initiative directory path whose final segment normalizes to that id, but it does not create missing records on read.

## Features

- canonical initiative records stored in SQLite via pi-storage
- `initiative_list` is broad-text-first; exact-match narrowing parameters are prefixed with `exact*`, and zero-result overfiltered searches surface broader-match diagnostics instead of a bare empty state
- explicit many-to-many links to spec changes and tickets, with initiative-owned backlink synchronization into research/spec/ticket/roadmap records
- milestone, scope, outcome, risk, and status-summary tracking
- truthful lifecycle timestamps: entering `completed` or `archived` sets the matching terminal timestamp, and leaving those statuses clears the stale terminal timestamp
- append-only decision history
- AI-facing `initiative_*` tools with built-in prompt guidance
- system-prompt augmentation via `before_agent_start`
- computed overview views rendered from linked initiative state

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
