---
id: research-memory-overview
title: "Research memory overview"
status: active
type: overview
section: overviews
topic-id: research-memory
topic-role: owner
publication-status: current-owner
publication-summary: "Current canonical overview for governed topic research-memory."
recommended-action: update-current-owner
current-owner: research-memory-overview
active-owners:
  - research-memory-overview
audience:
  - ai
  - human
source: workspace:pi-loom
verified-at: 2026-03-28T00:10:30.000Z
verification-source: manual:docs-coverage-review-2026-03-28
successor: null
successor-title: null
predecessors: []
retirement-reason: null
topics: []
outputs:
  - https-github-com-z3z1ma-pi-loom-git:research/README.md
upstream-path: research/README.md
---

# Research memory overview

## Purpose

Research memory is Pi Loom's durable evidence and discovery layer.

It exists to preserve exploratory work as reusable system knowledge instead of letting important discoveries disappear into chat history, transient notes, or execution-only artifacts.

## What research records

Research records are where Pi Loom keeps the durable context needed before execution outruns understanding. A research record may capture:

- the motivating question
- the objective and scope
- non-goals
- methodology
- hypotheses and their status
- evidence and results
- artifacts such as notes, sources, datasets, or experiment logs
- conclusions and recommendations
- open questions
- links to initiatives, specs, and tickets

## Why it is separate

Pi Loom separates research from execution history because discovery has a different job than tickets or plans.

- Research explains what was learned and what remains uncertain.
- Plans explain how accepted work should be executed.
- Tickets capture the live truth of a bounded execution unit.

If research is flattened into tickets or plans, the evidence base becomes harder to reuse and easier to lose.

## Current model

Research state is stored canonically in SQLite via `pi-storage`.

The layer supports durable research records, append-only hypothesis history, artifact inventory, and derived overview/map views that summarize the relationship between one research thread and its downstream work.

## Relationship to the rest of Loom

Research sits below constitution and above execution planning.

- Constitution governs durable project identity and constraints.
- Research captures discovery and evidence.
- Initiatives use research to frame strategic outcomes.
- Specs use research to ground declarative behavior.
- Plans and tickets should inherit research context when that evidence materially shapes execution.

## Practical implication

If execution quality is weak because the system does not understand the problem well enough, the right move is often to deepen or clarify research rather than to improvise inside a Ralph run. Research is where uncertainty becomes durable context.
