---
id: pi-loom-operating-model-overview
title: "Pi Loom operating model overview"
status: active
type: overview
section: overviews
topic-id: pi-loom-operating-model
topic-role: owner
publication-status: current-owner
publication-summary: "Current canonical overview for governed topic pi-loom-operating-model."
recommended-action: update-current-owner
current-owner: pi-loom-operating-model-overview
active-owners:
  - pi-loom-operating-model-overview
audience:
  - ai
  - human
source: workspace:pi-loom
verified-at: 2026-03-27T20:35:00.000Z
verification-source: "Updated README.md and AGENTS.md to clarify that preparation is collaborative AI-authored work with humans actively in the loop."
successor: null
successor-title: null
predecessors: []
retirement-reason: null
topics: []
outputs:
  - https-github-com-z3z1ma-pi-loom-git:README.md
upstream-path: README.md
---

# Pi Loom operating model overview

## Overview

Pi Loom is built around a deliberate split between two modes of work.

The first mode is collaborative preparation. Humans stay deeply in the loop while AI helps author the durable context that makes execution tractable: constitution, research, initiatives, specs, plans, and the ticket units worth attempting.

The second mode is bounded fresh-context execution. Ralph, critique, and documentation updates run from carefully assembled packets against one bounded objective at a time. Humans supervise the outcome, reassess between runs, and improve the upstream context when a run is under-specified.

## Collaborative preparation

Preparation is not overhead. It is the control surface that makes later automation predictable.

This side is still often authored by AI, but it is where human conversation, steering, review, and TUI-driven iteration add the most value.

- Constitution captures durable project rules, principles, constraints, and roadmap intent.
- Research captures what a knowledge worker learns before execution outruns understanding.
- Initiatives connect technical work to business or product outcomes.
- Specs define the intended behavior declaratively.
- Plans translate those contracts into execution strategy.
- Tickets define the concrete bounded units of work.

This is where ambiguity is reduced, tradeoffs are chosen, and the boundaries of a run are decided.

## Bounded fresh-context execution

Execution should not depend on one endlessly extended transcript. Pi Loom instead favors packetized runs that begin with a meticulously curated opening context window.

A packet consolidates the strategic why, the current execution strategy, the concrete target, and the supporting research/spec/docs context needed for one job. That packet becomes the basis for a fresh process or fresh-context run.

This model matters because it:

- preserves strategic context instead of letting compaction or drift degrade it over time
- prevents one logical unit of work from biasing the next one with stale transcript history
- gives humans a clean pause point between units to reassess what should happen next
- turns a weak run into a prompt to improve upstream context rather than to pile more contradictory steering into the same exhausted session

## Ralph

Ralph is best understood as packetized one-shot execution with durable iteration. A Ralph run is usually tightly bound to one ticket and often one governing plan. It attempts one logical unit of work, lands truthful ticket or checkpoint state, and stops or reruns with a refreshed packet.

Multiple Ralph iterations are normal. The system gains power by re-curating the context window for each attempt instead of dragging every prior token forward forever.

## Critique and documentation updates

Critique and docs updates apply the same philosophy.

A critique packet should include the surrounding constitution, research, spec, plan, and ticket context so the reviewer judges the work against its intended outcome, not just against a diff.

A documentation packet should include the accepted reality and the surrounding context needed to consolidate the narrative into trustworthy architecture, workflow, and operational docs.

## Practical implication

When execution quality is poor, treat weak upstream context as a first-class candidate root cause. Sharpen the research, spec, plan, ticket, or other packet inputs first, then rerun in fresh context.
