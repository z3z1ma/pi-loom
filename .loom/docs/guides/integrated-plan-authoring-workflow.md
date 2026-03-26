---
id: integrated-plan-authoring-workflow
title: "Integrated plan authoring workflow"
status: active
type: guide
section: guides
audience:
  - ai
  - human
source: spec:integrated-plan-ticket-materialization
topics:
  - plan-authoring
  - ticket-materialization
  - workflow
outputs: []
upstream-path: null
---

# Integrated plan authoring workflow

## Purpose
Use `plan_write` as the primary cohesive authoring surface when a plan's execution slice is already clear enough that the caller can also write each linked ticket as a fully detailed, self-contained execution record in the same operation.

## What changed
`plan_write` can now accept optional `linkedTicketInputs`. Each entry either:
- references an existing ticket with `ticketRef`, plus optional plan-local `role` and `order`, or
- defines a new ticket to create with `title` and the normal ticket-detail fields, plus optional plan-local `role` and `order`.

The tool persists the plan strategy, materializes any requested tickets through the ticket store, links them into the plan, and returns the resulting plan state plus the materialized ticket results.

## Boundary rules
- Plans remain the execution-strategy layer.
- Tickets remain the canonical execution ledger and must still contain their own context, acceptance criteria, implementation narrative, risks, and verification expectations.
- Plan state stores only active linked-ticket membership metadata: ticket id, plan-local role, and order.
- Ticket title and status continue to be derived from the live ticket ledger whenever the plan is read or rendered.
- `linkedTickets` means active plan membership.
- `contextRefs.ticketIds` means only loose packet context and must not be treated as interchangeable with active membership.

## When to use the integrated path
Use `linkedTicketInputs` when:
- the execution slice is already clear
- the caller can still provide fully detailed ticket bodies
- reducing authoring fragmentation is more important than staging the work across several calls

Do not use `linkedTicketInputs` when:
- the plan needs to be scaffolded first
- the caller needs more room to think through each ticket carefully
- creating tickets now would encourage thin placeholders rather than truthful units of work

In those cases, create or update the plan first, then create tickets separately and link them later.

## Provenance and unlinking
Linking a ticket still records `plan:<planId>` provenance on the ticket through external refs. Removing active membership from the plan no longer scrubs that provenance from the ticket, so historical rediscovery still works even after a ticket leaves the active execution slice.

## Observable results
After an integrated write:
- `plan_read` and `plan_overview` reflect the linked ticket count and live ticket statuses
- the plan markdown includes the linked ticket section and live ticket snapshot
- each linked ticket remains independently readable as a complete execution record
- ticket provenance back to the plan remains queryable
