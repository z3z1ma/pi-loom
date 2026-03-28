---
id: canonical-data-plane-and-storage-model-overview
title: "Canonical data plane and storage model overview"
status: active
type: overview
section: overviews
topic-id: canonical-data-plane
topic-role: owner
publication-status: current-owner
publication-summary: "Current canonical overview for governed topic canonical-data-plane."
recommended-action: update-current-owner
current-owner: canonical-data-plane-and-storage-model-overview
active-owners:
  - canonical-data-plane-and-storage-model-overview
audience:
  - ai
  - human
source: workspace:workspace:pi-loom
verified-at: 2026-03-27T23:25:30.000Z
verification-source: manual:docs-zero-drift-review-2026-03-27
successor: null
successor-title: null
predecessors: []
retirement-reason: null
topics: []
outputs:
  - https-github-com-z3z1ma-pi-loom-git:DATA_PLANE.md
upstream-path: DATA_PLANE.md
---

# Canonical data plane and storage model overview

## Purpose

Pi Loom is SQLite-first today, and the SQLite catalog is the canonical coordination substrate for the whole stack. Every higher Loom layer writes durable truth into that catalog first, then renders packets, projections, plans, docs, and other human-facing surfaces from canonical records as needed.

This overview explains what the current canonical data plane contains, what still stays clone-local, and why Pi Loom treats review surfaces as derived outputs rather than as a second source of truth.

## What the canonical data plane contains

The current catalog is organized around a small set of shared records that all higher layers build on:

- spaces, which define the top-level coordination boundary
- repositories and worktrees, which model repository membership and local execution targets inside a space
- entities, which hold the portable typed state snapshots owned by Loom layers
- links, which carry cross-entity graph truth
- events, which carry append-only lifecycle and mutation history where flows have been upgraded to emit them
- runtime attachments, which record clone-local runtime state without promoting it to shared truth
- selected artifact entities, which expose high-value child records as first-class canonical objects when querying or cross-layer linking needs them

The storage contract also carries canonical branch-reservation records for worktree-backed execution. Those reservations keep branch-family allocation durable and repository-specific instead of asking callers to infer execution lineage from whatever local git state happens to exist.

## What counts as canonical truth

Canonical truth is the portable state that should survive beyond one clone, one worktree, or one maintainer session. In Pi Loom today that includes the durable records for constitution, research, initiatives, specs, plans, tickets, critiques, Ralph runs, documentation, and the first wave of promoted artifacts.

The canonical catalog also owns the shared identity and routing facts that those layers depend on:

- stable opaque ids plus per-kind display ids
- repository ownership inside a space
- worktree identity and lifecycle status
- branch reservations used for durable execution coordination
- first-class graph edges between canonical records
- append-only events for implemented lifecycle and mutation flows

The important rule is that canonical entities should store portable domain truth. They should not become a dumping ground for local launch details, rendered read models, or other material that only makes sense in one clone.

## What stays derived or clone-local

Pi Loom keeps a hard boundary between shared canonical truth and local or derived surfaces.

Derived surfaces include:

- packets compiled for fresh maintainer, critique, or Ralph sessions
- .loom/<family>/... projections used for review or bounded reconciliation
- rendered plan and documentation markdown
- manifests, overviews, dashboards, and similar read-oriented material

Those outputs matter operationally, but they are derived from canonical records. They are not alternate stores.

Clone-local runtime state is separate again. Runtime attachments exist so Pi Loom can track launch descriptors, local processes, manager state, and related worktree-specific execution details without pretending that those facts are shared project truth. The data plane is therefore split intentionally: portable domain state is canonical; local control-plane state is local even when it is durably recorded for one clone.

## Scope and routing model

The canonical coordination boundary is a Loom space, not just the current working directory. A space may contain multiple enrolled repositories, and one repository may have multiple worktrees.

That matters because Pi Loom treats scope ambiguity as a real condition rather than something to smooth over with cwd heuristics. Space-level reads can legitimately span more than one repository. Repository-bound writes, path-bearing records, and runtime launches must target an explicit repository or worktree when the session is ambiguous.

The same principle applies when local availability drifts from canonical membership. A repository or worktree may remain canonically known to the space even when the local clone is missing or detached. Pi Loom should keep that distinction truthful: the repository still exists in canonical scope, but repository-targeted operations fail closed until a local execution target is available.

## Projections, packets, and reconciliation

Workspace projections under .loom/ are review and reconcile surfaces for selected canonical families, not replacements for the catalog. Today those projected families are constitution, research, initiatives, specs, plans, docs, and tickets.

Critique and Ralph remain canonical-only layers. They produce packets, run artifacts, and review outputs, but they do not project into .loom/.

Packets are also not projections. A packet is a bounded fresh-process handoff built from current canonical state for one job. It exists to preserve intent and context for a fresh session, not to become editable product state.

That distinction keeps synchronization honest. Humans can inspect or intentionally reconcile projected files, but there is no file-save autosync path that silently rewrites canonical storage.

## Why the boundary matters

Pi Loom only works as a shared substrate if every consumer can tell the difference between portable truth, local execution state, and rendered review output.

Keeping that split honest gives the system its leverage:

- multi-repository routing stays truthful instead of guessing from one cwd
- fresh packets can be rebuilt from stable intent rather than inheriting stale transcript residue
- execution adapters can consume the same entity, link, event, artifact, and scope substrate
- local runtime details stay useful without being mistaken for shared state
- future backend work can preserve the same semantics without rewriting the product model

If Pi Loom blurs those boundaries, the catalog stops being the data plane and the repository fills with competing approximations of truth. The current architecture is built to avoid exactly that outcome.
