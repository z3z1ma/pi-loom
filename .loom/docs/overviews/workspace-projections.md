---
id: workspace-projections
title: "Workspace projections"
status: active
type: overview
section: overviews
topic-id: workspace-projections
topic-role: owner
publication-status: current-owner
publication-summary: "Current canonical overview for governed topic workspace-projections."
recommended-action: update-current-owner
current-owner: workspace-projections
active-owners:
  - workspace-projections
audience:
  - ai
  - human
source: workspace:workspace
verified-at: 2026-03-27T10:46:33.159Z
verification-source: manual:pl-0131-iter-001
successor: null
successor-title: null
predecessors: []
retirement-reason: null
topics:
  - loom-sync
  - packet-separation
  - projection-families
  - workspace-projections
outputs:
  - https-github-com-z3z1ma-pi-loom-git:README.md
upstream-path: null
---

# Workspace projections

Workspace projections are the repository-visible `.loom/<family>/...` surfaces for canonical Loom records. They make current state reviewable from the working tree without changing the rule that SQLite-backed canonical storage remains the source of truth.

## What projections preserve

Projections expose selected Loom families in a human-readable form so operators can inspect current truth, export review surfaces, and intentionally reconcile edits when a workflow allows that path. They keep the repository surface explainable without turning file edits into hidden canonical writes.

## What projections do not replace

Packets are not projections. Packet artifacts for docs, critique, plans, and Ralph are bounded handoff material compiled from canonical state and are never reconcile targets. Likewise, a projected file is not a second primary database; it is a derived surface tied back to the canonical record.

## How the workflow stays explicit

Pi Loom uses explicit sync actions instead of autosave import. Human operators use `/loom-status`, `/loom-export`, `/loom-refresh`, and `/loom-reconcile`, while AI callers use `projection_status` and `projection_write`. If a projection is dirty, the operator must either reconcile the intentional change or refresh back to canonical output.

## Current boundaries

Supported projection families are constitution, research, initiatives, specs, plans, docs, and tickets. Critique and Ralph remain canonical-only layers with packets and runtime artifacts rather than `.loom/` projections. Ticket projections are high-churn, so local Git hygiene defaults keep `tickets/` and `.reconcile/` scratch state ignored unless a workflow intentionally wants them tracked.
