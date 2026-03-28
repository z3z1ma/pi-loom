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
verified-at: 2026-03-27T23:25:30.000Z
verification-source: manual:docs-zero-drift-review-2026-03-27
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

Constitutional memory is Pi Loom's highest-order project context. It keeps the project's durable identity — vision, governing principles, hard constraints, roadmap direction, and strategic decisions — available as shared truth across sessions, tools, and repo-visible surfaces.

That layer is intentionally narrower than the rest of the Loom stack. It does not replace specifications, plans, tickets, critique, docs, or execution guidance. Its job is to preserve the durable truths that should continue to govern those lower layers even as implementation details, workflow surfaces, and repository projections evolve.

## Current storage model

Pi Loom currently models constitutional memory as one mutable constitution aggregate persisted canonically in SQLite via pi-storage. That aggregate carries the project's vision, principles, constraints, strategic direction, current focus, open constitutional questions, embedded roadmap items, append-only decision history, and the compiled constitutional brief used for prompt grounding.

The important boundary is that the aggregate is the meaning-bearing record. `CONSTITUTION.md`, constitutional tool output, and repo-visible `.loom/...` review surfaces are all derived publications or projections of that canonical state. They matter because they make the constitution reviewable and queryable, but they do not become alternate truth just because they are easier to read in a repository.

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

The SQLite-backed constitutional record is the authoritative source of truth. It is where Pi Loom stores the current vision, principles, constraints, roadmap intent, current focus, open questions, and constitutional decisions for the workspace.

### This governed overview

This documentation record is the maintained explanatory owner document for the `constitutional-memory` topic. Its current-owner publication status means it is the canonical explanation of the topic inside the governed docs corpus, not a second constitutional store. Its job is to explain what the constitutional layer means, how it is modeled today, and how readers should interpret it relative to the rest of Pi Loom.

Because it lives in the docs layer, it also carries explicit governance and verification metadata. That makes it a maintained interpretation surface for humans and AI memory, not a competing copy of the constitution.

### `CONSTITUTION.md`

`CONSTITUTION.md` is the repo-visible publication of the constitution's substantive content. It makes the current constitutional shape reviewable from the working tree and easy to cite during design or implementation work. Its authority depends on staying aligned with canonical constitutional memory rather than bypassing it.

### Repo-visible document projections

The rendered file under `.loom/docs/overviews/constitutional-memory-overview.md` is the projection of this governed overview into the repository. It is a review surface for the current owner document, not an independent source of explanatory or constitutional truth. If that projection drifts, the fix belongs in the canonical docs record and projection workflow rather than in a parallel hand-maintained copy.

In short: canonical constitutional memory is the source of truth, this governed overview is the current owner explanation of the topic, `CONSTITUTION.md` publishes the constitution itself for repository readers, and the docs projection is the rendered review surface for this explanation.

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

The constitutional layer should be read as durable project policy and strategic direction, not as a changelog, API reference, or execution plan. It should move when accepted reality changes Pi Loom's identity, durable boundaries, or roadmap intent — not whenever implementation detail shifts somewhere below it.

That slower cadence is deliberate. It keeps the highest-order context stable enough to govern the rest of the system while still leaving room for durable strategic decisions and roadmap changes when project reality actually moves.

Verification-only refreshes are also legitimate when the governed publication surface changes without changing the meaning of the constitutional layer itself. Projection stabilization, topic-governance cleanup, or broader docs-corpus maintenance may require this overview's explanation or verification evidence to be refreshed so the published owner surface stays truthful without inventing a parallel overview or pretending the constitution changed when it did not.
