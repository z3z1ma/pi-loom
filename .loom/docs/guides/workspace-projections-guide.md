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
verified-at: 2026-03-27T22:54:38.283Z
verification-source: manual:workspace-projections-guide-maintenance-2026-03-27
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

Workspace projections are the repo-visible `.loom/<family>/...` review surfaces for Loom records that already exist in SQLite-backed canonical storage. They make current state inspectable from the working tree without changing the core rule: markdown on disk is a derived surface, not a second database.

## Why projections exist

Projections give humans and AI a repository-native place to review current Loom state, prepare intentional edits when a family supports reconcile, and include selected review surfaces in normal Git workflows when that is useful. They are meant to improve visibility and controlled collaboration, not to make file saves behave like hidden canonical writes.

## What projections are not

A projection is not an always-on sync layer. Pi Loom does not watch `.loom/` for edits and silently import them. Packets are also not projections: docs, plan, critique, and Ralph packets are bounded handoff artifacts compiled for fresh-process work, and they are never reconcile targets.

## The explicit projection lifecycle

Workspace projection maintenance is intentionally command-driven.

- `export` creates or rewrites the selected projection family from canonical state when the workspace needs a repo-visible review surface.
- `refresh` discards unreconciled disk edits by regenerating the selected family from canonical state.
- `reconcile` imports intentional projection edits back into canonical state, but only through the supported bounded rules for that family.

Human operators use `/loom-status`, `/loom-export`, `/loom-refresh`, and `/loom-reconcile`. AI callers use `projection_status` and `projection_write`. The important operational rule is that the operator chooses when to move information across the SQLite-to-repository boundary; Pi Loom does not guess.

## Why status comes first

Projection workflows stay truthful by checking state before mutating it. `projection_status` or `/loom-status` makes clean, modified, missing, and not-yet-exported files visible so reconcile decisions are based on actual disk state rather than assumptions.

If a projected family is dirty, Pi Loom fails closed. Canonical writes and packet launches are blocked until the operator either reconciles the intentional change or refreshes back to canonical output. That behavior is deliberate: it prevents a stale repository surface from diverging silently from the SQLite record it represents.

## Family boundaries

The current projection families are `constitution`, `research`, `initiatives`, `specs`, `plans`, `docs`, and `tickets`. Those are the only families that write repo-visible `.loom/` projections today.

Critique and Ralph are canonical-only layers. They still produce packets, runs, and runtime artifacts, but they do not project into `.loom/`. That separation matters because critique verdicts and Ralph execution state are bounded review-orchestration artifacts, not long-lived markdown records meant for bidirectional repository sync.

## Ticket projection hygiene

Ticket projections churn more than the other families, so Pi Loom keeps them conservative by default. The managed `.loom/.gitignore` block leaves `tickets/` and `.reconcile/` scratch state untracked unless a workflow intentionally wants projected ticket material committed for review.

That default keeps local reconcile leftovers, conflict files, and other high-churn scratch artifacts from being mistaken for shared truth. If a team wants projected ticket material in Git, that should be an explicit review choice, not a side effect of using the projection system.

## Using projections well

Use projections when a repo-visible review surface helps: for example, when someone wants to inspect current canonical state in Markdown, review a targeted edit through Git, or reconcile an intentional document-shaped change back into Loom. Use packets when the goal is bounded execution or review context for a fresh maintainer, critic, or Ralph run.

That distinction keeps the system honest. Projections are durable review surfaces tied back to canonical state. Packets are temporary handoff context. Treating them as different tools prevents the repository tree from becoming an accidental second control plane.
