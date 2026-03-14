# @pi-loom/pi-plans

Durable execution-strategy planning memory for pi.

This package adds a first-class planning layer under `.loom/plans/` so bounded planning packets and high-context `plan.md` execution artifacts can coordinate a linked ticket set without replacing the ticket ledger.

## Capabilities

- `/workplan` command surface for initializing, creating, inspecting, linking, unlinking, listing, and archiving plan records
- `plan_*` tools for list/read/write/packet/ticket-link/dashboard workflows
- durable plan records with `state.json`, `packet.md`, `plan.md`, and `dashboard.json`
- bounded planning packets that pull linked constitution, research, initiative, spec, ticket, critique, and docs context into one durable handoff
- linked ticket tracking that keeps plan markdown detailed at the execution-strategy layer while tickets remain the high-fidelity execution source of truth and self-contained units of work

## Planning semantics

`pi-plans` keeps planning distinct from specs and from tickets.

- plans are more bounded than initiatives and more strategic than ticket-by-ticket execution history
- plans wrap and link tickets managed through `pi-ticketing`, whether those tickets already exist or are created alongside the plan, and each ticket still carries its own complete work definition
- `plan.md` is a detailed execution narrative and checklist with sequencing, rationale, risks, and validation intent, while linked tickets carry the live work state and the detailed per-unit work definitions
- ticket provenance back to the plan is recorded through ticket external refs so the plan can be rediscovered from execution artifacts

## Layout

```text
.loom/
  plans/
    <plan-id>/
      state.json
      packet.md
      plan.md
      dashboard.json
```

## Local use

```bash
cd packages/pi-plans
omp -e .
```
