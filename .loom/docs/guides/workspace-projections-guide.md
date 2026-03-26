---
id: workspace-projections-guide
title: "Workspace projections guide"
status: active
type: guide
section: guides
audience:
  - ai
  - human
source: workspace:workspace
topics:
  - explicit-reconcile
  - loom-sync
  - packet-separation
  - projection-families
  - ticket-retention
  - workspace-projections
outputs: []
upstream-path: README.md
---

# Workspace projections guide

## Purpose

Workspace projections are the repo-visible `.loom/<family>/...` review surfaces for canonical Loom records. They make durable SQLite-backed state readable and selectively editable from the repository without turning markdown into a second system of record.

The important design constraint is that projections are derived views, not canonical truth. SQLite remains the source of truth for every projected layer.

## Supported projection families

The shipped projection families are:

- `constitution`
- `research`
- `initiatives`
- `specs`
- `plans`
- `docs`
- `tickets`

Critique and Ralph are intentionally excluded from `.loom/` projections. They still have durable memory and runtime artifacts, but those layers remain canonical-only and do not become projection families.

## Projections are not packets

Projections and packets serve different purposes:

- projections are repo-visible exports of canonical records
- packets are fresh-process handoff artifacts compiled on demand from canonical state
- packets are not reconcile targets
- packets do not autosync from file edits

This separation matters because packets are short-lived working context for a fresh process, while projections are durable review surfaces that can be inspected, exported, refreshed, or reconciled explicitly.

## Explicit Loom sync commands

Human-facing sync flows now live at the top level instead of under `/ticket`:

- `/loom-status` inspects whether exported `.loom/` files are clean, modified, missing, or not exported
- `/loom-export` materializes canonical records into `.loom/<family>/...`
- `/loom-refresh` re-renders exported files from canonical state
- `/loom-reconcile` accepts intentional file-side edits back into canonical storage

AI callers continue to use `projection_status` and `projection_write`. There is still no file-save autosync back into SQLite; intentional edits stay local until they are explicitly reconciled.

Dirty projected files are a blocking condition, not a silent merge. Canonical writes and packet launches fail closed until the operator either reconciles the edited projection or refreshes it back to canonical output.

## Ticket Git defaults and retention

Ticket projections have stricter Git defaults because they churn the most.

- `.loom/.gitignore` keeps `tickets/` and `.reconcile/` untracked by default
- other projection families may still be committed intentionally when a workflow wants them for review
- ticket retention is selective rather than "all records forever": open tickets, recently updated tickets, active-plan tickets, and tickets labeled `projection:pinned` remain projected
- archived tickets do not remain in the projection set by default
- reconcile scratch, conflict leftovers, and local runtime/control-plane files are never shared truth and should stay out of version control

## Why the exclusion matters

Keeping critique and Ralph out of `.loom/` preserves a clean boundary between review/runtime artifacts and repo-visible review surfaces. Those layers already have their own durable records and handoff packets; projecting them would blur the line between canonical memory, handoff context, and filesystem review surfaces.

The result is a small, explicit projection model: stable families get review surfaces, packets stay ephemeral, SQLite remains the only authoritative store, and human operators have a dedicated Loom-wide sync command surface instead of a ticket-owned subcommand.
