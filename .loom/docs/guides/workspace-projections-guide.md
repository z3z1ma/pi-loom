---
id: workspace-projections-guide
title: "Workspace projections guide"
status: active
type: guide
section: guides
topic-id: workspace-projections
topic-role: companion
publication-status: current-companion
publication-summary: "Current companion doc beneath active topic owner workspace-projections."
recommended-action: update-current-companion
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
  - explicit-reconcile
  - loom-sync
  - packet-separation
  - projection-families
  - ticket-retention
  - workspace-projections
outputs:
  - https-github-com-z3z1ma-pi-loom-git:README.md
upstream-path: README.md
---

# Workspace projections guide

Workspace projections are the repo-visible `.loom/<family>/...` review surfaces for canonical Loom records. They are derived outputs from SQLite-backed state, not a second system of record.

## What projections are for

Projections make canonical Loom records readable and selectively editable from the repository when a workflow intentionally needs that surface. They exist for review, export, and explicit reconcile flows.

## What projections are not

Packets are not projections. Docs, plan, critique, and Ralph packets are bounded handoff artifacts compiled from canonical state. They are never reconcile targets.

## Current sync workflow

Human operators use `/loom-status`, `/loom-export`, `/loom-refresh`, and `/loom-reconcile` to inspect, export, refresh, and reconcile projections. AI callers use `projection_status` and `projection_write`.

There is no hidden file-save autosync. Dirty projected files block canonical writes and packet launches until the operator either reconciles intentional edits or refreshes back to canonical output.

## Family boundaries

Supported projection families are constitution, research, initiatives, specs, plans, docs, and tickets. Critique and Ralph remain canonical-only layers: they produce packets and runtime artifacts, but they do not project into `.loom/`.

## Ticket projection hygiene

Ticket projections churn the most, so `.loom/.gitignore` keeps `tickets/` and `.reconcile/` scratch state untracked by default unless a workflow intentionally wants them committed for review.
