# @pi-loom/pi-docs

Durable documentation memory for pi.

This package adds a first-class documentation layer under `.loom/docs/` so high-level system overviews, guides, concepts, and operational procedures remain truthful after completed code changes.

## Capabilities

- `/docs` command surface for initializing, creating, inspecting, updating, listing, and archiving documentation records
- `docs_*` tools for list/read/write/packet/update/dashboard workflows
- durable documentation records with `state.json`, `packet.md`, `doc.md`, `revisions.jsonl`, and `dashboard.json`
- bounded update packets that pull linked constitution, initiative, research, spec, ticket, and critique context into a fresh documentation-maintainer handoff
- revision history and dashboards that keep documentation updates observable and queryable as Loom memory
- future-facing `linkedOutputPaths` metadata for later opt-in sync or symlink workflows without mutating repo topology in v1

## Update semantics

`pi-docs` keeps documentation maintenance distinct from critique and from planning.

- documentation records are high-level explanatory memory, not API reference material
- `docs_update` compiles the packet, launches a fresh `pi` process, and expects that fresh maintainer session to persist a revision through `docs_write`
- interactive `/docs update` opens a fresh session handoff when session APIs are available
- revisions append durably to `revisions.jsonl`; the maintained document always lives in canonical `doc.md`

## Layout

```text
.loom/
  docs/
    overviews/
      <doc-id>/
        state.json
        packet.md
        doc.md
        revisions.jsonl
        dashboard.json
    guides/
      <doc-id>/
        state.json
        packet.md
        doc.md
        revisions.jsonl
        dashboard.json
    concepts/
      <doc-id>/
        state.json
        packet.md
        doc.md
        revisions.jsonl
        dashboard.json
    operations/
      <doc-id>/
        state.json
        packet.md
        doc.md
        revisions.jsonl
        dashboard.json
```

## Local use

```bash
cd packages/pi-docs
omp -e .
```
