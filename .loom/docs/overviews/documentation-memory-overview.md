---
id: documentation-memory-overview
title: "Documentation memory overview"
status: active
type: overview
section: overviews
topic-id: documentation-memory
topic-role: owner
publication-status: current-owner
publication-summary: "Current canonical overview for governed topic documentation-memory."
recommended-action: update-current-owner
current-owner: documentation-memory-overview
active-owners:
  - documentation-memory-overview
audience:
  - ai
  - human
source: workspace:pi-loom
verified-at: 2026-03-28T03:18:30.000Z
verification-source: manual:docs-tool-semantics-review-2026-03-28
successor: null
successor-title: null
predecessors: []
retirement-reason: null
topics: []
outputs:
  - https-github-com-z3z1ma-pi-loom-git:docs/README.md
upstream-path: docs/README.md
---

# Documentation memory overview

## Purpose

Documentation memory is Pi Loom's governed explanatory layer.

It exists to preserve accepted architecture, workflows, concepts, and operations knowledge after work is complete, so the system's current understanding is stored durably instead of being scattered across chat transcripts, ticket journals, or one-off README edits.

## What this layer owns

The docs layer owns high-level explanations: architecture overviews, workflow guides, concepts, operational procedures, and other durable descriptions of accepted system reality.

It does not replace plans, tickets, critique, or specs. Plans still carry execution strategy, tickets remain the live work ledger, critique keeps adversarial review, and specs describe intended behavior. Documentation is the layer that explains what the system now is and how to reason about it once the work has landed.

## Governed documentation model

Documentation records are stored canonically in SQLite via pi-storage, with rendered document bodies and packet views derived from that canonical state.

Each record carries governance metadata that makes the corpus explainable instead of just searchable: topic ownership, publication status, source target, verification evidence, lifecycle state, revision history, and optional links to upstream repository documents or exported outputs.

That metadata lets Pi Loom distinguish the current owner for a topic from companion material and from superseded or archived history. Discovery is intentionally curated around current topic owners and active governance debt by default, while supporting or historical material is available when a reader asks for it explicitly.

## Two maintenance paths, two jobs

The docs layer intentionally has two different write paths.

### `docs_write`

`docs_write` is the canonical mutation primitive.

Use it when you already know the exact durable mutation to apply:

- direct content edits
- metadata repair
- verification refreshes
- create/supersede/archive flows
- explicit upstream-ingestion changes

### `docs_update`

`docs_update` is the managed fresh-context maintenance workflow built on top of `docs_write`.

Use it when the job is not "apply this exact mutation" but rather "run a bounded documentation-maintainer pass from compiled context." It should compile the packet, launch a fresh maintainer, and require that the resulting pass persists through `docs_write`.

## Governance and audit

The governance model is designed to make documentation drift observable instead of relying on human memory.

`docs_audit` classifies four main failure modes from canonical metadata: stale documents whose governing context changed after verification, overlapping documents that claim the same current-truth topic slice, orphaned documents whose provenance or upstream links no longer hold, and unverified documents that lack review evidence.

Audit evidence is not limited to the document body. The audit also considers source-target changes, linked context refs, verification source freshness, and upstream file modification times when a document is ingesting an existing repository file. When the review should survive beyond the current session, the audit can persist its findings into critique memory so the resulting gaps, evidence, and follow-up work do not disappear with the chat.

## Relationship to repository docs

Pi Loom can ingest existing repository documentation through `upstreamPath`, such as a root `README.md`, `DATA_PLANE.md`, or a package README.

That does not make the repository file itself the governance layer. The file remains the content source, while the Loom Doc record stores the reasoning layer around it: topic ownership, verification status, lifecycle, revision history, and durable linkage to broader Loom context. This keeps high-value repo docs connected to the same governance model as native Loom docs without pretending that Markdown files alone can express the whole state.

Linked output paths are also descriptive rather than magical. They tell Loom which repository-visible outputs truthfully correspond to the governed doc, but they do not turn external docs trees into an auto-synced second database.

## Practical implication

When accepted understanding changes, choose the maintenance path deliberately. Use `docs_write` for deterministic mutation and `docs_update` for packetized maintainer passes. If a document is stale, overlapping, orphaned, or unverified, fix that state in the docs layer rather than leaving the explanation fragmented across tickets, critique runs, or chat residue.
