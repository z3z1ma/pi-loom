# pi-loom/specs

`pi-loom` adds a durable specification-memory layer to pi-compatible runtimes.

When active, the extension teaches the model to use specifications as declarative, implementation-decoupled statements of intended program behavior. A spec should still make sense when read in isolation: it names a stable capability, declares what must be true, and remains useful even if the implementation path changes. Specs define the desired capability, constraints, scenarios, and acceptance independent of today's code shape; plans turn that accepted behavior into implementation strategy and linked execution work, and tickets carry the execution truth. Specification state is persisted in SQLite via pi-storage, with durable spec records, canonical capability summaries, append-only clarification decisions, spec-quality analysis, checklist artifacts, and explicit initiative membership.

Specification lifecycle is strict: proposed/clarifying/specified specs are mutable, and mutable specs may be deleted if they should not survive as durable history. Finalized specs are read-only, and archived specs are terminal. Supersession is lineage metadata captured while specifying a new spec; archived records are not editable successors.

Mutable specs can also be retitled before finalize. This is the truthful path when an early draft was created with a delta-style title like `Add dark mode` and later needs to be brought into behavior-first form before the spec becomes governed history.

## Features

- durable specification records persisted in SQLite
- `spec_list` is broad-text-first; exact-match narrowing parameters are prefixed with `exact*`, and zero-result overfiltered searches surface broader-match diagnostics instead of a bare empty state
- canonical capability specs stored in SQLite, with review renderings generated when needed
- append-only clarification and decision history per mutable spec
- explicit initiative membership for cross-layer strategic traceability
- immutable finalized specs and terminal archived specs
- AI-facing `spec_*` tools with built-in prompt guidance
- system-prompt augmentation via `before_agent_start`

The coherent path is spec -> plan -> tickets: the spec declares intended behavior, the plan translates that behavior into implementation strategy and sequencing, and the tickets carry the concrete execution work.

Specs are not task lists or migration notes. They can compose with neighboring specs, but each one should stand alone as a coherent contract for a bounded slice of behavior.

Spec titles should name the behavior or capability being specified, not an implementation-task verb. The title should read like the name of something the system supports, not like a to-do item. Prefer titles like `Dark theme support` or `Offline draft recovery` over titles like `Add dark mode`.

## Storage model

Spec state and metadata are persisted in SQLite via pi-storage. Plans connect finalized specs to linked tickets.

Finalization freezes the spec record, including clarifications, design notes, analysis, checklist output, initiative links, research links, and capability mappings. Archive is only allowed after finalize; it preserves the frozen record for reading, lineage, and canonical capability provenance. Delete is only allowed while the spec is still mutable and is blocked if other durable records still reference the spec.

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
