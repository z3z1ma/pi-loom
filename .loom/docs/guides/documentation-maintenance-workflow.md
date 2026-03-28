---
id: documentation-maintenance-workflow
title: "Documentation maintenance workflow"
status: active
type: guide
section: guides
topic-id: documentation-memory
topic-role: companion
publication-status: current-companion
publication-summary: "Current companion doc beneath active topic owner documentation-memory-overview."
recommended-action: update-current-companion
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
topics:
  - audit
  - documentation
  - governance
  - workflow
outputs:
  - https-github-com-z3z1ma-pi-loom-git:docs/README.md
upstream-path: docs/README.md
---

# Documentation maintenance workflow

## Start with the topic, not the file

Before creating or updating docs, identify the governed topic and whether an owner doc already exists.

That keeps the corpus consolidated instead of spawning parallel active docs for the same concept.

## Use packets and updates deliberately

When documentation reality changes after implementation, choose the right path explicitly:

- use `docs_write` for direct, known, deterministic mutations
- use `docs_update` when the job is to run a bounded maintainer pass from compiled context

`docs_update` is orchestration built on top of `docs_write`, not just a second generic way to edit docs. It exists for the higher-order case where Loom should compile the packet, launch a fresh maintainer, and require that a durable revision lands.

## Audit for drift

`docs_audit` is the governance backstop.

Use it to catch:

- stale docs
- overlapping owners
- orphaned docs
- missing verification evidence

## Ingest high-value repo docs

When a repository file such as a README or architecture note is important to the system's understanding, connect it through `upstreamPath` so the docs layer can govern the explanation around it.

## Practical rule

If an important architectural truth exists only in a repo file or only in chat, documentation maintenance is not finished.
