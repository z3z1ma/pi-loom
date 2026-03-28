---
id: integrated-plan-ticket-materialization
title: "Integrated plan ticket materialization"
status: archived
created-at: 2026-03-26T07:19:38.989Z
updated-at: 2026-03-28T00:10:28.359Z
research: []
initiatives: []
capabilities:
  - capability-integrated-plan-write
---

## Overview
Plan authoring should support creating or updating a durable execution strategy together with a linked execution slice of tickets in one cohesive workflow, while keeping plans strategic and tickets as the canonical self-contained execution records.

## Capabilities
- capability-integrated-plan-write: Integrated plan authoring with linked ticket materialization

## Requirements
- req-001: Each linked ticket materialization entry can either reference an existing ticket or define a new ticket to create with full execution detail, including acceptance and verification context.
  Acceptance: A caller can create a plan and multiple linked tickets in one operation and then read the plan overview with the linked ticket count and live statuses populated.; A caller can update an existing plan to add a newly created linked ticket in one operation without separate `ticket_write(create)` and `plan_ticket_link(link)` calls.; Plan state persists only ticket ids, roles, and ordering for active membership; ticket titles and statuses are still derived from the live ticket ledger when plans are read or rendered.
  Capabilities: capability-integrated-plan-write
- req-002: Materializing tickets updates the plan's authoritative linked-ticket membership and ticket external provenance without storing shadow ticket bodies in plan state.
  Acceptance: A caller can create a plan and multiple linked tickets in one operation and then read the plan overview with the linked ticket count and live statuses populated.; A caller can update an existing plan to add a newly created linked ticket in one operation without separate `ticket_write(create)` and `plan_ticket_link(link)` calls.; Plan state persists only ticket ids, roles, and ordering for active membership; ticket titles and statuses are still derived from the live ticket ledger when plans are read or rendered.
  Capabilities: capability-integrated-plan-write
- req-003: Role and ordering metadata remain plan-local concerns even when tickets are created through the integrated authoring path.
  Acceptance: A caller can create a plan and multiple linked tickets in one operation and then read the plan overview with the linked ticket count and live statuses populated.; A caller can update an existing plan to add a newly created linked ticket in one operation without separate `ticket_write(create)` and `plan_ticket_link(link)` calls.; Plan state persists only ticket ids, roles, and ordering for active membership; ticket titles and statuses are still derived from the live ticket ledger when plans are read or rendered.
  Capabilities: capability-integrated-plan-write
- req-004: The integrated authoring path remains optional so callers can still scaffold a plan without tickets or link/create tickets later when more ticket-writing room is needed.
  Acceptance: A caller can create a plan and multiple linked tickets in one operation and then read the plan overview with the linked ticket count and live statuses populated.; A caller can update an existing plan to add a newly created linked ticket in one operation without separate `ticket_write(create)` and `plan_ticket_link(link)` calls.; Plan state persists only ticket ids, roles, and ordering for active membership; ticket titles and statuses are still derived from the live ticket ledger when plans are read or rendered.
  Capabilities: capability-integrated-plan-write
- req-005: The primary plan authoring surface accepts optional linked-ticket materialization input in addition to plan strategy fields.
  Acceptance: A caller can create a plan and multiple linked tickets in one operation and then read the plan overview with the linked ticket count and live statuses populated.; A caller can update an existing plan to add a newly created linked ticket in one operation without separate `ticket_write(create)` and `plan_ticket_link(link)` calls.; Plan state persists only ticket ids, roles, and ordering for active membership; ticket titles and statuses are still derived from the live ticket ledger when plans are read or rendered.
  Capabilities: capability-integrated-plan-write

## Clarifications
(none)
