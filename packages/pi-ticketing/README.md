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
- a widget-first `/ticket` surface for humans
- AI-facing `ticket_*` tools with built-in prompt guidance
- system-prompt augmentation via `before_agent_start`

## Human UX: widget-first `/ticket`

`/ticket` is now a small, human-centered surface instead of a tool-mirroring command namespace.

Supported verbs:

- `/ticket open [home|list|board|timeline|detail <ref>]`
- `/ticket create [title...]`
- `/ticket review [ready|blocked]`

What those verbs mean:

- `open home` opens the ticket workspace home surface.
- `open list`, `open board`, `open timeline`, and `open detail <ref>` open focused ticket views.
- `create` creates a ticket directly from a human title prompt.
- `review ready` and `review blocked` open backlog review views over the durable ticket graph.

Old slash subcommands such as `list`, `show`, `start`, `close`, `journal`, `attach`, and dependency-management verbs are intentionally not exposed as human slash commands anymore. Human interaction should start from the workspace surface, then use focused direct operations there.

## Focused views and fallbacks

In an interactive UI, focused ticket views are rendered through `ctx.ui.custom(...)`.

Today the persistent widget is still textual. That is deliberate and truthful: current runtimes need a string-safe home surface that works in RPC and other non-custom contexts. When custom UI is unavailable, `/ticket open ...` falls back to textual views instead of pretending a richer widget exists.

Textual fallback also preserves direct detail actions when custom UI is unavailable. The same human command surface can drive focused ticket changes through detail-scoped actions such as:

- `/ticket open detail <ref> edit <field> <value...>`
- `/ticket open detail <ref> status <open|reopen|in_progress|review|close> [verification note]`
- `/ticket open detail <ref> dependency <add|remove> <depRef>`

Current focused views:

- home
- list
- board
- timeline
- detail

Current direct workspace operations:

- create ticket
- edit ticket title, assignee, priority, risk, type, review status, and body sections
- change status to open or reopen, in-progress, review, and close
- add or remove dependencies
- inspect ticket detail together with journal, checkpoint, and attachment context

The durable ticket ledger remains the source of truth. The workspace is a lens over tickets, not a shadow store.

## Machine-facing tools

The `ticket_*` tools remain machine-facing and intentionally more explicit than the human slash command:

- `ticket_list`
- `ticket_read`
- `ticket_write`
- `ticket_graph`
- `ticket_checkpoint`

Use them when an agent needs structured access to the ledger, complete ticket bodies, graph state, or direct mutation operations. They are not the human UX surface.

Notable direct write support includes explicit reopen semantics via `ticket_write` action `reopen`, so closed tickets can be restored to open status truthfully rather than by manual file moves.

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
