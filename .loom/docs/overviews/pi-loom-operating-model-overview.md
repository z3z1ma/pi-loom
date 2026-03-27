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
verified-at: 2026-03-27T21:30:00.000Z
verification-source: "Refreshed against README.md, AGENTS.md, the constitutional brief, and CONSTITUTION.md operating-model sections."
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

Pi Loom is a layered coordination substrate for long-horizon AI work. It keeps durable policy, evidence, strategy, behavior contracts, execution truth, review, and accepted explanation in separate but linked layers instead of collapsing them into one transcript or one workflow engine.

Its operating model has two halves. The first is collaborative preparation, where humans stay actively in the loop while AI helps author the durable context that makes later execution predictable. The second is bounded fresh-context execution and review, where Ralph, critique, and documentation maintenance run from curated packets against one bounded objective at a time.

## Layered architecture

The stack is intentionally explicit: constitution, research, initiatives, specs, plans, tickets, Ralph orchestration, critique, and docs. Each layer answers a different coordination question, and the system stays easier to reason about when those responsibilities do not blur together.

Canonical operational state lives in SQLite through the shared storage layer. Packets, rendered plans, documentation artifacts, and repo-visible .loom projections are derived surfaces built from that canonical state. They exist to review, explain, or hand off accepted reality, not to replace it.

Within that stack, plans hold execution strategy, tickets remain the live execution ledger, Ralph provides bounded orchestration, critique records adversarial review, and docs capture accepted explanation after the work is understood.

## Collaborative preparation

Preparation is first-class engineering work, not overhead. It is the highest-leverage place for human judgment because it is where goals are clarified, ambiguity is reduced, tradeoffs are chosen, and the boundaries of later runs are decided.

Humans and AI collaborate on that preparation through conversation, steering, review, and the TUI:

- constitution sets durable direction, principles, constraints, and roadmap intent
- research captures evidence and open questions before execution outruns understanding
- initiatives connect technical work to strategic outcomes
- specs describe intended behavior declaratively
- plans translate that behavior into execution strategy and packet-ready context
- tickets define the bounded units of work and the evidence required to close them

When execution quality is weak, Pi Loom treats weak preparation as a first-class candidate root cause instead of assuming the fix belongs inside the run.

## Ralph-native bounded execution

Pi Loom's current execution language is Ralph-native. The system describes execution in terms of Ralph runs, tickets, plans, worktrees, runtime artifacts, checkpoints, and packet refresh rather than in terms of extra execution personas.

A Ralph run is usually bound to one ticket and often one governing plan. It is a bounded attempt against one logical unit of work, not a roaming multi-task copilot or an endlessly extended chat session. Multiple Ralph iterations are normal, but the power comes from re-curating the packet and truthfully updating ticket state between iterations rather than dragging every prior token forward forever.

Tickets stay canonical during that process. Plans, Ralph runs, critiques, docs, and runtime artifacts surround execution, but they do not replace tickets as the shared ledger of live work.

## Critique and documentation updates

Critique and documentation maintenance follow the same packetized model as Ralph execution.

A critique packet carries the surrounding constitution, research, spec, plan, and ticket context so review stays grounded in the intended outcome rather than only in a diff. A documentation packet carries the accepted reality and surrounding context needed to consolidate that reality into durable architecture, workflow, concept, and operations material.

Both are bounded fresh-context passes that land durable state and stop. They are not side channels for improvising live execution truth.

## Canonical truth and derived surfaces

Pi Loom is SQLite-first and scope-aware. Repository and worktree identity should be explicit when ambiguity exists, and repository-bound behavior should fail closed rather than silently guessing the wrong target.

That same truthfulness applies to exports. .loom projections are review surfaces derived from canonical records, not another source of truth. Ralph and critique remain canonical-only layers, while packets are on-demand handoff artifacts rather than reconcile targets.

## Practical implication

When a run misses, improve the shared substrate first. Sharpen the research, spec, plan, ticket, or other packet inputs, then rerun in fresh context. The operating model is designed to make better preparation and clearer boundaries the normal fix, not more contradictory steering inside one exhausted session.
