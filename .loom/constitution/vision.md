---
id: pi-loom
title: "Pi Loom"
updated-at: 2026-03-27T21:03:14.761Z
completeness: complete
---

## Vision Summary
Pi Loom is a harness-agnostic, SQLite-first coordination substrate for long-horizon AI work, organizing constitution, research, initiatives, specs, plans, tickets, Ralph runs, critique, and docs into durable, queryable shared truth with derived review and handoff surfaces.

## Vision Narrative
Pi Loom exists to turn long-horizon AI work into a durable operating system rather than a pile of transcripts, ad hoc markdown, or harness-specific glue. The project is organized as an explicit layered stack: constitution captures durable project policy, research captures evidence and discovery, initiatives hold strategic outcomes, specs define declarative behavior contracts, plans translate those contracts into execution strategy and ticket linkage, tickets remain the live execution ledger, Ralph orchestrates bounded fresh-context execution over those records, critique preserves adversarial review, and docs capture accepted explanatory understanding after the fact. Canonical state lives in SQLite via pi-storage today and is exposed through scope-aware tools, commands, lifecycle hooks, and prompt guidance so humans and AI work over the same durable substrate. Preparation is collaborative: humans stay actively in the loop while AI helps author constitution, research, initiatives, specs, plans, and tickets. Execution is bounded and packetized: Ralph, critique, and docs update consume carefully curated packets against one objective at a time, land durable state, and stop or rerun with refreshed context. Packets, markdown, dashboards, projections, and other human-facing surfaces are derived from canonical records rather than competing sources of truth. Local runtime details remain clone-local, and the architecture must stay portable enough to support explicit multi-repository spaces, future backends, and future harness adapters without changing the meaning of the coordination system.
