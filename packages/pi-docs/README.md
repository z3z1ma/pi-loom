# @pi-loom/pi-docs

SQLite-backed documentation records for Loom.

This package adds a first-class documentation layer with canonical records stored in SQLite via pi-storage, allowing high-level Loom overviews, guides, concepts, and operational procedures to remain truthful after completed code changes.

## Capabilities

- `/docs` command surface for initializing, creating, inspecting, updating, listing, and archiving documentation records
- `docs_*` tools for list/read/write/packet/update/dashboard workflows
- canonical documentation records stored in SQLite with revision history, and update packets or documentation views rendered from those records for inspection or explicit export
- bounded update packets that pull linked constitution, initiative, research, spec, ticket, and critique context into a fresh documentation-maintainer handoff
- revision history that keeps documentation updates observable and queryable as Loom memory

## Update semantics

`pi-docs` keeps documentation maintenance as the post-completion explanatory layer, distinct from critique and planning.

- documentation records are high-level explanatory memory for architecture, workflows, concepts, and operations, not API reference material
- `docs_update` compiles the packet, launches a fresh `pi` process, and expects that fresh maintainer session to persist a revision through `docs_write`
- interactive `/docs update` opens a fresh session handoff when session APIs are available
- revisions append to the canonical SQLite store; maintained document views are rendered from those records and remain accessible through queries and explicit export

## Local use

```bash
cd packages/pi-docs
omp -e .
```
