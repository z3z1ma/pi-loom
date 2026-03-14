# @pi-loom/pi-specs

`pi-specs` adds a durable, local specification-memory layer to pi-compatible runtimes.

When active, the extension teaches the model to use specifications as the bridge between strategic initiatives and execution. Specification state lives in repo-visible files under `.loom/specs/`, with change bundles, capability deltas, append-only clarification decisions, spec-quality analysis, checklist artifacts, explicit initiative membership, and deterministic ticket projection into `pi-ticketing`.

## Features

- durable spec change bundles in `.loom/specs/changes/`
- canonical capability specs in `.loom/specs/capabilities/`
- append-only clarification and decision history per change
- explicit initiative membership for cross-layer strategic traceability
- AI-facing `spec_*` tools with built-in prompt guidance
- `/spec` slash command namespace for human entrypoints
- system-prompt augmentation via `before_agent_start`
- deterministic finalized-spec to ticket projection with provenance
- projected tickets inherit initiative membership from their originating spec change

## Local layout

```text
.loom/
  specs/
    changes/
      <change-id>/
        proposal.md
        design.md
        tasks.md
        state.json
        decisions.jsonl
        analysis.md
        checklist.md
        ticket-projection.json
        specs/
          <capability>.md
    capabilities/
      <capability>.md
    archive/
      YYYY-MM-DD-<change-id>/...
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
cd packages/pi-specs
omp -e .
```
