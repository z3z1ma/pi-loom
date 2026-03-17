# @pi-loom/pi-ticketing

`pi-ticketing` adds a durable, local ticket ledger to pi-compatible runtimes.

When active, the extension teaches the model to create, update, query, and rely on tickets for non-trivial work. Ticket state is persisted durably in SQLite via pi-storage, with journal history, checkpoint metadata, inline attachment data, explicit initiative/spec provenance, and an audit trail. Rendered ticket markdown and other outputs are generated from canonical SQLite records in memory or exported explicitly when needed; they are snapshots, not durable repo state.

Tickets are intended to be detail-first execution records and complete units of work, not blurbs. A good ticket captures enough self-contained context for truthful resumption at the execution layer that a capable newcomer can understand what problem is being solved, why it matters now, what generally needs to happen, and what evidence means the work is done: relevant assumptions and constraints, scope and non-goals, concrete acceptance criteria, implementation plan, dependencies, risks, edge cases, verification expectations, and durable journal updates as reality changes. Keep that detail at the ticket layer without turning tickets into replacement specs, plans, or docs.

## Features

- durable ticket records in SQLite via pi-storage
- dependency graph queries for ready and blocked work
- explicit initiative membership fields for strategic traceability
- explicit spec provenance fields for synchronized work
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

In an interactive UI, `/ticket open ...` now enters a centered overlay workbench rendered through `ctx.ui.custom(...)`.

That workbench is intentionally selector-shaped rather than command-shaped:

- a bounded shell instead of a full-screen text dump
- a fixed-size centered overlay tuned for readable backlog browsing instead of a panel that sprawls with content
- tabbed top-level navigation (`Overview`, `Inbox`, `List`, `Board`, `Timeline`, `Detail`)
- contextual detail preview while browsing
- bounded action menus for status, editing, and dependency updates
- real keyboard travel for `↑↓`, `Tab`, `←→`, `Enter`, and `Esc`
- Esc-to-back behavior inside the shell before Esc closes it entirely
- light expressive styling and iconography so state changes and navigation read at a glance

The persistent home widget is still textual. That is deliberate and truthful: current runtimes need a string-safe summary that works in RPC and other non-custom contexts. When custom UI is unavailable, `/ticket open ...` falls back to textual views instead of pretending the overlay workbench exists.

Textual fallback also preserves direct detail actions when custom UI is unavailable. The same human command surface can drive focused ticket changes through detail-scoped actions such as:

- `/ticket open detail <ref> edit <field> <value...>`
- `/ticket open detail <ref> status <open|reopen|in_progress|review|close> [verification note]`
- `/ticket open detail <ref> dependency <add|remove> <depRef>`

Current interactive workbench surfaces:

- overview — hero counts, ready-now work, blocked attention, recent movement
- inbox — review-focused blocked and ready queues
- list — full backlog browsing
- board — status-lane browsing
- timeline — recent change chronology
- detail — full ticket drill-in with journal, checkpoint, and attachment context

Current direct workspace operations:

- create ticket
- edit ticket title, assignee, priority, risk, type, review status, and body sections
- change status to open or reopen, in-progress, review, and close
- add or remove dependencies
- inspect ticket detail together with journal, checkpoint, and attachment context

In interactive mode those operations are launched from contextual action menus inside the workbench. In textual fallback mode they remain available through detail-scoped command paths.

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

- ticket state is persisted durably in SQLite via pi-storage; this is the canonical truth for all ticket data
- rendered outputs such as ticket markdown, packet views, and checkpoint documents are generated from canonical SQLite records and only exist durably when someone exports them explicitly
- ticket attachments persist inline in SQLite-backed metadata rather than as copied artifact files in the repo
- ticket journal entries, checkpoint metadata, and audit trails are stored in SQLite for durability and query efficiency
- local runtime worktree paths are stored as workspace-relative references or logical descriptors; the worktrees themselves are runtime-local and not canonical ticket state

## Local layout

Ticket state is persisted durably in SQLite via pi-storage. Local runtime worktree behavior may use ephemeral filesystem structures for temporary processing, but those runtime-local paths are not the durable storage mechanism. Rendered artifacts such as markdown files are generated from SQLite-backed records in memory or exported explicitly when needed.

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
