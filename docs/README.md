# pi-loom/docs

SQLite-backed documentation records for Loom.

This package adds a first-class documentation layer with canonical records stored in SQLite via pi-storage, allowing high-level Loom overviews, guides, concepts, and operational procedures to remain truthful after completed code changes.

## Capabilities

- `docs_*` tools for list/read/write/packet/update/overview workflows
- `docs_audit` for governed-documentation drift detection with optional critique-backed durable handoff
- `docs_list` is broad-text-first; exact-match narrowing parameters are prefixed with `exact*`, and zero-result overfiltered searches surface broader-match diagnostics instead of a bare empty state
- `docs_list` defaults to curated discovery: current topic owners and active governance debt stay visible by default, while companion docs and superseded/archived history require explicit access through `includeSupporting`, `includeHistorical`, or narrower doc-type/status filters
- canonical documentation records stored in SQLite with revision history, and update packets or documentation views rendered from canonical records for inspection or explicit export
- ingestion of existing repository documentation (READMEs, architecture notes) via `upstreamPath`, creating a reasoned metadata layer (tags, topics, semantic links) over raw source files
- bounded update packets that pull linked constitution, initiative, research, spec, ticket, and critique context into a fresh documentation-maintainer handoff
- revision history that keeps documentation updates observable and queryable as Loom memory

## Governance audit semantics

Curated documentation remains trustworthy only if drift becomes observable.

- `docs_audit` classifies stale, overlapping, orphaned, and unverified documentation findings from canonical metadata instead of guessing from filenames or ad hoc text heuristics
- stale findings are driven by durable evidence such as source-target/context updates, upstream file changes, or documentation edits that postdate the last recorded verification
- orphaned findings surface broken provenance, missing governed topic ownership, missing source/context targets, or missing upstream files
- overlapping findings surface multiple active docs claiming the same governed topic/type slice of current truth
- unverified findings surface missing `verifiedAt` or `verificationSource` evidence
- when the audit should survive beyond one turn, `persistCritique=true` creates a critique record plus durable findings so later callers can review or ticketify the drift without reconstructing the evidence from chat

## Update semantics

`pi-loom` keeps documentation maintenance as the post-completion explanatory layer, distinct from critique and planning.

- documentation records are high-level explanatory memory for architecture, workflows, concepts, and operations, not API reference material
- `docs_update` compiles the packet, launches a fresh `pi` process, and expects that fresh maintainer session to persist a revision through `docs_write`
- active documents remain editable; every `docs_write` update or archive appends a new revision to the canonical SQLite history
- archived documents preserve their document body and revision timeline as historical truth, but they are no longer mutable through `docs_write` update flows
- updating `contextRefs` replaces the stored ref buckets you send, so incorrect refs can be removed by passing empty arrays for the buckets that should be cleared
- use `upstreamPath` to link a Loom Doc record to an existing repository file (e.g. `README.md`); this establishes the file as the content source while Loom owns the reasoning layer
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
