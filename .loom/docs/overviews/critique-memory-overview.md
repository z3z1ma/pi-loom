---
id: critique-memory-overview
title: "Critique memory overview"
status: active
type: overview
section: overviews
topic-id: critique-memory
topic-role: owner
publication-status: current-owner
publication-summary: "Current canonical overview for governed topic critique-memory."
recommended-action: update-current-owner
current-owner: critique-memory-overview
active-owners:
  - critique-memory-overview
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
  - https-github-com-z3z1ma-pi-loom-git:critique/README.md
upstream-path: critique/README.md
---

# Critique memory overview

## Purpose

Critique memory is Pi Loom's durable adversarial review layer.

It exists so review survives beyond one chat turn and remains grounded in the strategic and execution context that the work was actually trying to satisfy.

## What critique records

A critique record may capture:

- the review question
- the target under review
- focus areas such as correctness, tests, architecture, roadmap alignment, or docs
- bounded packet context
- review runs and verdicts
- findings with severity and confidence
- follow-up tickets derived from accepted findings

## Why it is separate

Pi Loom keeps critique separate from execution and from documentation.

- Tickets carry live execution truth.
- Critique challenges whether that work actually satisfied the right contract.
- Docs explain accepted reality after the review and execution layers have done their job.

Without a dedicated critique layer, review debt gets flattened into ticket comments or chat and becomes much harder to reuse.

## Current model

Critique state is stored canonically in SQLite via `pi-storage`.

The layer supports critique packets, fresh-process launches, durable runs, finding lifecycle management, and follow-up ticket creation without turning critique itself into the execution ledger.

## Relationship to Ralph

Critique composes with Ralph but is not the same thing.

Ralph may orchestrate critique as part of a bounded execution loop, but critique remains its own durable review subsystem with its own runs, verdicts, and findings.

## Practical implication

If work must be challenged adversarially, put that challenge in critique memory rather than in ad hoc chat review. Critique is where review becomes durable, structured, and actionable.
