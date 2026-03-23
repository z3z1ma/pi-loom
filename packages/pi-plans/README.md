# @pi-loom/pi-plans

SQLite-backed execution-strategy planning for pi.

This package adds a first-class planning layer with canonical plan state stored in SQLite via pi-storage, allowing bounded planning packets and execution-strategy coordination of a linked ticket set without replacing the ticket ledger.

## Capabilities

- `plan_*` tools for list/read/write/packet/ticket-link/dashboard workflows
- `plan_list` is broad-text-first; exact-match narrowing parameters are prefixed with `exact*`, and zero-result overfiltered searches surface broader-match diagnostics instead of a bare empty state
- canonical plan records stored in SQLite, with packet and plan views rendered from those records for inspection or explicit export
- bounded planning packets that pull linked constitution, research, initiative, spec, ticket, critique, and docs context into one fresh handoff
- linked ticket tracking that keeps plan coordination at the execution-strategy layer while tickets remain the high-fidelity execution source of truth and self-contained units of work
- rendered `plan.md` output that is self-contained and ExecPlan-shaped for novice readers, with living-document sections such as `Progress`, `Milestones`, `Validation and Acceptance`, `Idempotence and Recovery`, `Interfaces and Dependencies`, and `Revision Notes`

## Planning semantics

`pi-plans` keeps planning distinct from specs and from tickets.

- plans are more bounded than initiatives and more strategic than ticket-by-ticket execution history
- plans wrap and link tickets managed through `pi-ticketing`, whether those tickets already exist or are created alongside the plan, and each ticket still carries its own complete work definition
- rendered `plan.md` is a self-contained novice-facing execution narrative with sequencing, rationale, milestones, recovery guidance, interfaces, revision history, and validation intent, while linked tickets carry the live work state and the detailed per-unit work definitions
- ticket provenance back to the plan is recorded through ticket external refs so the plan can be rediscovered from execution artifacts
- plan refs stay human-facing as `plan:<plan-display-id>` and `plan:<plan-display-id>:packet` / `:document`; internal storage ids may be opaque, but those ids are not part of the package interface
- linked ticket title and status are always derived from the live ticket records when a plan is read or rendered; the plan stores ticket membership and plan-local role/order, not a shadow ticket status ledger
- `contextRefs` are editable metadata, not append-only history: correct a bucket by replacing that list explicitly, and remove stale refs explicitly when they should stop contributing packet context
- `progress`, `discoveries`, and `decisions` are ordered records replaced as whole lists on update; `revisionNotes` is the append-only audit trail for plan-level changes. The store does not support mutating those child records by array position.

## Local use

```bash
cd packages/pi-plans
omp -e .
```
