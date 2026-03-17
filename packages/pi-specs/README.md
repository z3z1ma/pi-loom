# @pi-loom/pi-specs

`pi-specs` adds a durable specification-memory layer to pi-compatible runtimes.

When active, the extension teaches the model to use specifications as the bridge between strategic initiatives and execution. Specification state is persisted in SQLite via pi-storage, with canonical change bundles, capability deltas, append-only clarification decisions, spec-quality analysis, checklist artifacts, explicit initiative membership, and ticket synchronization into the execution layer.

## Features

- durable spec change bundles persisted in SQLite
- canonical capability specs stored in SQLite, with review renderings generated when needed
- append-only clarification and decision history per change
- explicit initiative membership for cross-layer strategic traceability
- AI-facing `spec_*` tools with built-in prompt guidance
- `/spec` slash command namespace for human entrypoints
- system-prompt augmentation via `before_agent_start`
- finalized-spec to ticket synchronization with provenance
- synchronized tickets inherit initiative membership from their originating spec change

## Local layout

Historical `.loom` examples may still appear in local workflows, but they are not the canonical store:

```text
.loom/
  specs/
    changes/
      <change-id>/
        proposal.md
        design.md
        tasks.md
    capabilities/
      <capability>.md
    archive/
      YYYY-MM-DD-<change-id>/...
```

Spec state, metadata, and ticket synchronization records are persisted in SQLite via pi-storage. `/spec tickets` remains a synchronization surface into the ticket layer, not a filesystem projection step.

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
