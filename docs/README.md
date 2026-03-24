# pi-loom/docs

SQLite-backed documentation records for Loom.

This package adds a first-class documentation layer with canonical records stored in SQLite via pi-storage, allowing high-level Loom overviews, guides, concepts, and operational procedures to remain truthful after completed code changes.

## Capabilities

- `docs_*` tools for list/read/write/packet/update/dashboard workflows
- `docs_list` is broad-text-first; exact-match narrowing parameters are prefixed with `exact*`, and zero-result overfiltered searches surface broader-match diagnostics instead of a bare empty state
- canonical documentation records stored in SQLite with revision history, and update packets or documentation views rendered from canonical records for inspection or explicit export
- bounded update packets that pull linked constitution, initiative, research, spec, ticket, and critique context into a fresh documentation-maintainer handoff
- revision history that keeps documentation updates observable and queryable as Loom memory

## Update semantics

`pi-loom` keeps documentation maintenance as the post-completion explanatory layer, distinct from critique and planning.

- documentation records are high-level explanatory memory for architecture, workflows, concepts, and operations, not API reference material
- `docs_update` compiles the packet, launches a fresh `pi` process, and expects that fresh maintainer session to persist a revision through `docs_write`
- active documents remain editable; every `docs_write` update or archive appends a new revision to the canonical SQLite history
- archived documents preserve their document body and revision timeline as historical truth, but they are no longer mutable through `docs_write` update flows
- updating `contextRefs` replaces the stored ref buckets you send, so incorrect refs can be removed by passing empty arrays for the buckets that should be cleared
- maintained document views are rendered from the canonical record and remain accessible through queries and explicit export

## Multi-repository documentation flows

Documentation records participate in the same explicit scope model as the other Loom layers.

- a documentation record may be repository-owned inside a shared multi-repository space while still being discoverable from space-level listings
- in an ambiguous parent-directory session, `docs_update` resolves runtime scope from the targeted documentation record and passes explicit space/repository/worktree identity into the fresh maintainer process instead of guessing from cwd
- path-bearing fields such as `scopePaths` and `linkedOutputPaths` must stay repository-qualified and portable when ambiguity exists; bare relative paths fail closed rather than drifting onto the wrong repository
- linked output paths remain derived review surfaces, not canonical storage; they should describe truthful repository-relative outputs such as `<repo-slug>:docs/loom.md`

## Local use

```bash
omp -e .
```
