---
id: pi-loom
title: "Pi Loom"
updated-at: 2026-03-26T07:17:03.487Z
completeness: complete
---

## Vision Summary
Pi Loom is a harness-agnostic, SQLite-first coordination substrate for long-horizon AI work, turning constitution, research, initiatives, specs, plans, tickets, workers, critique, Ralph runs, and docs into durable, queryable shared truth with derived human review surfaces.

## Vision Narrative
Pi Loom exists to make long-horizon AI work a durable system rather than a pile of transcripts, ad hoc markdown, or harness-specific glue. The product is a layered Loom stack in which constitutional memory frames project policy, research captures evidence, initiatives hold strategic outcomes, specs define declarative behavior contracts independent of current implementation, plans translate those contracts into implementation strategy and ticket linkage against current code reality, tickets remain the live execution ledger, workers provide workspace-backed execution, critique preserves adversarial review, Ralph orchestrates bounded fresh-context loops, and docs capture accepted understanding after the fact. Canonical state lives in SQLite via pi-storage today and is exposed through explicit slash-command and tool families, lifecycle initialization hooks, and prompt guidance so humans and agents act over the same durable substrate. Human-facing packets, dashboards, markdown, and widget surfaces exist for review and usability, but they are derived exports from canonical records rather than competing sources of truth. The model must stay portable enough to support future shared backends and other harness adapters without changing the meaning of the coordination system.
