# @pi-loom/pi-ticketing

`pi-ticketing` adds a durable, local ticket ledger to pi-compatible runtimes.

When active, the extension teaches the model to create, update, query, and rely on tickets for non-trivial work. Ticket state is persisted durably in SQLite via pi-storage, with journal history, checkpoint metadata, inline attachment data, linked upstream context, and an audit trail. Rendered ticket markdown and other outputs are generated from canonical SQLite records in memory or exported explicitly when needed; they are snapshots, not durable repo state.

Tickets are intended to be detail-first execution records and complete units of work, not blurbs. A good ticket captures enough self-contained context for truthful resumption at the execution layer that a capable newcomer can understand what problem is being solved, why it matters now, what generally needs to happen, and what evidence means the work is done: relevant assumptions and constraints, scope and non-goals, concrete acceptance criteria, plan-aligned implementation detail, dependencies, risks, edge cases, verification expectations, and durable journal updates as reality changes. Keep that detail at the ticket layer without turning tickets into replacement specs, plans, or docs.

## Features

- durable ticket records in SQLite via pi-storage
- dependency graph queries for ready and blocked work
- explicit initiative membership and durable upstream links for cross-layer traceability
- prompt guidance that pushes agents toward fully detailed ticket bodies, concrete acceptance criteria, and truthful ongoing updates
- a widget-first `/ticket` surface for humans
- AI-facing `ticket_*` tools with built-in prompt guidance
- system-prompt augmentation via `before_agent_start`

## Human UX: widget-first `/ticket`

`/ticket` is a single human-facing entrypoint.

Use:

- `/ticket`

That command opens the ticket workbench. Human interaction should start there and stay there. The workbench owns navigation, review flows, direct ticket operations, and detail inspection.

## Focused views and fallbacks

In an interactive UI, `/ticket` enters a centered overlay workbench rendered through `ctx.ui.custom(...)`.

That workbench is intentionally selector-shaped:

- a bounded shell instead of a full-screen text dump
- a fixed-size centered overlay tuned for readable backlog browsing instead of a panel that sprawls with content
- tabbed top-level navigation (`Overview`, `Inbox`, `List`, `Board`, `Timeline`, `Detail`)
- contextual detail preview while browsing
- bounded action menus for status, editing, and dependency updates
- real keyboard travel for `↑↓`, `Tab`, `←→`, `Enter`, and `Esc`, plus `/` search inside the List tab
- Esc-to-back behavior inside the shell before Esc closes it entirely
- light expressive styling and iconography so state changes and navigation read at a glance

The persistent home widget is textual so current runtimes always have a string-safe summary that works in RPC and other non-custom contexts. When custom UI is unavailable, `/ticket` falls back to a textual overview.

Current interactive workbench surfaces:

- overview — hero counts, next actions, ready-now work, blocked or active attention, and recently closed context
- inbox — review-focused blocked and ready queues
- list — default backlog browsing for non-archived tickets, with slash-triggered filtering inside the tab
- board — action board focused on non-closed work, with closed volume summarized instead of dominating the lane view
- timeline — grouped recent-activity feed organized by update day
- detail — full ticket drill-in with journal, checkpoint, and attachment context

Current direct workspace operations:

- create ticket
- edit ticket title, assignee, priority, risk, type, review status, and body sections
- change status to open or reopen, in-progress, review, and close
- archive a ticket from the action menu so it disappears from default workbench views after refresh
- add or remove dependencies
- inspect ticket detail together with journal, checkpoint, and attachment context

In interactive mode those operations are launched from contextual action menus inside the workbench.

The durable ticket ledger remains the source of truth for execution state. The workspace is a lens over that ledger.

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
