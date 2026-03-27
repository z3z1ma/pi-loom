---
id: constitutional-memory-overview
title: "Constitutional memory overview"
status: active
type: overview
section: overviews
topic-id: constitutional-memory
topic-role: owner
publication-status: current-owner
publication-summary: "Current canonical overview for governed topic constitutional-memory."
recommended-action: update-current-owner
current-owner: constitutional-memory-overview
active-owners:
  - constitutional-memory-overview
audience:
  - ai
  - human
source: workspace:pi-loom
verified-at: 2026-03-27T21:52:00.000Z
verification-source: "Reviewed CONSTITUTION.md, README.md, constitution/README.md, constitution_read(all), and constitution_overview against the current governed documentation state."
successor: null
successor-title: null
predecessors: []
retirement-reason: null
topics: []
outputs:
  - https-github-com-z3z1ma-pi-loom-git:CONSTITUTION.md
upstream-path: CONSTITUTION.md
---

# Constitutional memory overview

## Purpose and scope

Constitutional memory is Pi Loom's highest-order project context. Its role is to keep the project's durable identity, governing principles, hard constraints, roadmap direction, and strategic decisions in one place that survives beyond any single run, transcript, or implementation cycle.

That layer is intentionally narrower than the rest of the Loom stack. It is not a substitute for execution tracking, design notes, or operator instructions. Instead, it preserves the truths that should keep shaping lower-layer work even as plans, tickets, docs, and runtime behavior evolve.

## Current storage model

Pi Loom currently implements constitutional memory as a single mutable constitution aggregate persisted canonically in SQLite via pi-storage. The aggregate holds the project's vision, principles, constraints, embedded roadmap items, open constitutional questions, strategic direction, current focus, append-only decision history, and generated brief material used for prompt grounding.

This model matters because the constitution is meant to remain durable even when repository layout, projections, or future storage backends change. The canonical record carries the meaning; human-readable renderings are derived from that stored state.

## Constitutional memory versus operational guidance

Constitutional memory and operational guidance serve different jobs.

Constitutional memory answers questions such as:

- What is Pi Loom trying to become?
- Which architectural boundaries are deliberate rather than accidental?
- Which constraints should invalidate a convenient shortcut?
- Which strategic direction should lower layers inherit?

Operational guidance answers different questions:

- How should workers behave in this repository or harness?
- Which tools and verification habits are expected during execution?
- How should repository-local workflows be followed?

Files such as `AGENTS.md` belong to that operational layer. They can be strict and important, but they are still instructions for doing work rather than the durable source of project identity. Pi Loom keeps those surfaces separate so temporary workflow discipline does not get mistaken for constitutional truth.

## Relationship between canonical memory, this governed overview, and `CONSTITUTION.md`

These surfaces are related, but they are not interchangeable.

### Canonical constitutional memory

The SQLite-backed constitutional record is the authoritative source of truth. It is where Pi Loom stores the current vision, principles, constraints, roadmap intent, and constitutional decisions for the workspace.

### This governed overview

This documentation record is the maintained explanatory owner document for the `constitutional-memory` topic. Its job is to explain what the constitutional layer means, how it is modeled today, and how readers should interpret it relative to the rest of the system. It is durable high-level explanation, not the operational store.

Because it lives in the governed docs layer, it also carries explicit verification and publication metadata. That makes it a maintained interpretation surface for humans and AI memory, not a competing copy of the constitution.

### `CONSTITUTION.md`

`CONSTITUTION.md` is the repo-visible publication of the constitution's substantive content. It makes the current constitutional shape reviewable from the working tree and easy to cite during design or implementation work. Its authority depends on staying aligned with canonical constitutional memory rather than bypassing it.

In short: canonical constitutional memory is the source of truth, this governed overview explains the concept and current shape, and `CONSTITUTION.md` is the repository publication surface for the constitution itself.

## Current constitutional shape

The current constitution describes Pi Loom as a harness-agnostic, SQLite-first coordination substrate for long-horizon AI work. Its layered design remains explicit: constitution, research, initiatives, specs, plans, tickets, Ralph, critique, docs, and shared storage/projection infrastructure each exist because they answer different coordination questions.

Several themes define the current constitutional shape:

- canonical truth lives in SQLite-backed Loom records, while packets, projections, and markdown renderings are derived surfaces
- collaborative preparation and bounded fresh-context execution are separate modes of work rather than one transcript-shaped workflow
- each Loom layer should keep one truthful responsibility instead of absorbing another layer's job
- tickets remain the live execution ledger even when plans, Ralph, critique, and docs surround them
- provenance, explicit links, and explicit repository/worktree scope matter more than path folklore or local guesswork
- portable shared truth matters more than clone-local runtime details
- verification, critique, and truthful documentation are required before confidence
- human-facing and AI-facing workflows must stay grounded in the same underlying substrate

The constitution's current focus is on hardening the canonical SQLite-backed data plane and scope model, preserving the layered split between collaborative preparation and bounded execution, keeping Ralph, critique, and docs as distinct fresh-context layers, and improving human-facing UX without creating a second truth system.

## How to read this layer

The constitutional layer should be read as durable project policy and strategic direction, not as a changelog, API reference, or execution plan. It should move when accepted reality changes Pi Loom's identity, durable boundaries, or roadmap intent—not whenever implementation detail shifts somewhere below it.

That slower cadence is deliberate. It keeps the highest-order context stable enough to govern the rest of the system while still leaving room for durable strategic decisions and roadmap changes when project reality actually moves.
