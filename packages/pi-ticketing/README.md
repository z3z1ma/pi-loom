# @pi-loom/pi-ticketing

`pi-ticketing` adds a durable, local ticket ledger to pi-compatible runtimes.

When active, the extension teaches the model to create, update, query, and rely on tickets for non-trivial work. Ticket state lives in repo-visible files under `.loom/`, with markdown tickets, append-only journal history, immutable checkpoints, attachment metadata, explicit initiative/spec provenance, and an audit trail.

Tickets are intended to be detail-first execution records and complete units of work, not blurbs. A good ticket captures enough self-contained context for truthful resumption at the execution layer that a capable newcomer can understand what problem is being solved, why it matters now, what generally needs to happen, and what evidence means the work is done: relevant assumptions and constraints, scope and non-goals, concrete acceptance criteria, implementation plan, dependencies, risks, edge cases, verification expectations, and durable journal updates as reality changes. Keep that detail at the ticket layer without turning tickets into replacement specs, plans, or docs.

## Features

- durable ticket files in `.loom/tickets/`
- append-only journal entries per ticket
- first-class attachments and checkpoints
- dependency graph queries for ready and blocked work
- explicit initiative membership fields for strategic traceability
- explicit spec provenance fields for projected work
- prompt guidance that pushes agents toward fully detailed ticket bodies, concrete acceptance criteria, and truthful ongoing updates
- `/ticket` slash command namespace
- AI-facing `ticket_*` tools with built-in prompt guidance
- system-prompt augmentation via `before_agent_start`

## Artifact policy

- commit ticket markdown, ticket journals, attachment indexes, checkpoint indexes, checkpoint docs under `.loom/checkpoints/`, audit logs under `.loom/tickets/.audit/`, and copied durable artifacts under `.loom/artifacts/`
- treat those files as repo-visible ticket truth even when they are generated or updated frequently
- store ticket-linked paths as workspace-relative references so another clone can read the same evidence without local rewrite
- do not hide ticket state behind broad ignore rules; ticketing is a durable ledger, not runtime scaffolding

## Local layout

```text
.loom/
  tickets/
    t-0001.md
    t-0001.journal.jsonl
    t-0001.attachments.json
    t-0001.checkpoints.json
    closed/
      t-0003.md
    .audit/
      audit-2026-03-15.jsonl
  checkpoints/
    cp-0001.md
  artifacts/
    artifact-0001.txt
```

## Development

From the repo root:

```bash
npm install
npm run test
npm run check
```

To load only this package locally:

```bash
cd packages/pi-ticketing
omp -e .
```
