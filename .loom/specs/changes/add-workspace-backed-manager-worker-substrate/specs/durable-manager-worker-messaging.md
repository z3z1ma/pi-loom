---
id: durable-manager-worker-messaging
title: "Durable manager-worker messaging"
change: add-workspace-backed-manager-worker-substrate
updated-at: 2026-03-16T00:03:16.511Z
source-changes:
  - add-workspace-backed-manager-worker-substrate
---

## Summary
Provide a canonical message stream for coordination so worker communication survives turnover and remains inspectable without transcript archaeology.

## Requirements
- Each worker SHALL maintain an append-only durable message stream that records manager-to-worker instructions, worker-to-manager updates, and bounded broadcast messages with direction, kind, timestamps, and causal links.
- Manager-mediated routing SHALL be the default coordination mode; unrestricted worker-to-worker peer chat SHALL be out of scope for v1, with only optional bounded broadcast supported for urgent team-wide signals that still remain visible to the manager.
- Messages SHALL link to related worker ids, ticket/spec/plan refs, and delivery or resolution status instead of flattening coordination into anonymous prose blobs.

## Scenarios
- A manager redirects a worker away from a false assumption and the intervention remains visible in the worker record.
- A worker emits a bounded broadcast warning about a cross-cutting blocker and the manager can trace which workers received it.
- A worker hits a blocker and sends a structured escalation to its manager while another session later audits the reason for delay.
