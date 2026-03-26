---
id: plan-and-ticket-orchestration-workflow-design
title: "Plan and ticket orchestration workflow design"
status: synthesized
created-at: 2026-03-26T06:14:16.773Z
tags:
  - plans
  - tickets
  - workflow
source-refs:
  - constitution:brief
  - plans/__tests__/store.test.ts
  - plans/__tests__/tools.test.ts
  - plans/domain/render.ts
  - plans/domain/store.ts
  - plans/README.md
  - plans/tools/plan.ts
  - spec:design-widget-first-plans-ux
  - ticketing/__tests__/tools.test.ts
  - ticketing/domain/graph.ts
  - ticketing/domain/store.ts
  - ticketing/README.md
  - ticketing/tools/ticket.ts
---

## Question
How does Pi Loom create plans and their linked tickets today, where are the cognitive and tool-call seams, and what cohesive design options could better preserve the separation between plan-level execution strategy and ticket-level execution truth?

## Objective
Build a source-grounded understanding of the current plan and ticket module workflow, then synthesize design options for a more cohesive AI-facing and human-facing plan creation flow without collapsing the layer boundary between plans and tickets.

## Status Summary
Synthesis complete: current workflow mapped, main seams identified, and boundary-preserving design options compared.

## Scope
- plans module tool and store behavior
- README and area documentation describing plan/ticket responsibilities
- tests that reveal intended order of operations and data shape
- ticketing module tool and store behavior relevant to plan linkage

## Non-Goals
- changing durable project principles
- designing unrelated Ralph or critique workflow changes
- implementing a new workflow in this session

## Methodology
- compare current implementation against intended layer semantics and AI workflow needs
- inspect constitutional memory for boundary constraints
- read plans and ticketing READMEs plus relevant source files
- search for existing research/docs/plans
- trace tool-call order in plan and ticket tool implementations and tests

## Keywords
- execution strategy
- linkage
- plans
- tickets
- tool design
- workflow

## Conclusions
- The codebase already hints at a desired wrapper model: plans summarize linked tickets and derive live ticket status, while tickets remain self-contained execution units with acceptance criteria and journals.
- The current data model treats linked tickets as first-class but optional. Plans can exist with zero linked tickets, yet mature plan reads and renders revolve around linked tickets because ticket status/title are derived live into the plan overview and markdown.
- The main cohesion problem is orchestration, not ontology. The architectural separation between plans as execution strategy and tickets as execution truth is sound; the awkwardness comes from requiring the planner to span several tool calls and persistence surfaces to express one conceptual act.
- Ticket-side references are insufficient to model authoritative plan membership. A ticket can carry `body.plan` text and `externalRefs` such as `plan:<id>`, but the plan entity separately owns `linkedTickets` and `contextRefs.ticketIds`, creating a real distinction between active execution-slice membership and loose contextual reference.
- Today the primary workflow is intentionally split: create a durable plan scaffold with `plan_write(create)`, create or refine tickets through `ticket_write`, then link tickets one-by-one via `plan_ticket_link`; this preserves layer boundaries but creates a cognitively fragmented planning experience.

## Recommendations
- Medium term: model plan authoring as phases—scaffold, strategy drafting, execution-slice materialization—so zero-ticket plans remain valid early, but the primary mature workflow naturally instantiates linked tickets once the execution slice is clear.
- Short term: add a higher-level composite authoring surface that can create or update a plan, create zero or more tickets, and link them in one bounded workflow while internally delegating to the existing plan and ticket stores. Preserve current low-level tools as primitives.
- Short term: clarify semantics between `linkedTickets` and `contextRefs.ticketIds` in tool docs and prompt guidance so AI callers know which one means active plan membership versus loose packet context.
- Short term: fix current surface mismatches before adding new UX: `plan_write(create)` should pass through `risksAndQuestions`, and unlink/provenance behavior should either match the docs or the docs should describe the closed-vs-open nuance truthfully.
- Use ticket-intent drafts inside plans only if review-before-materialization is a real requirement. Otherwise avoid a second long-lived representation of ticket work inside plans, because that would create drift against the ticket ledger.

## Open Questions
- If a composite flow creates tickets from a plan, what minimum ticket detail is required up front to keep tickets self-contained instead of generating hollow shells?
- Should plan creation surface linked-ticket intent only as ephemeral input to materialization, or should plans gain a durable draft execution-slice concept?
- Should the primary AI-facing workflow optimize for a single atomic call, or is a preview/apply two-step more trustworthy for multi-ticket creation?

## Linked Work
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

- spec:design-widget-first-plans-ux

## Hypotheses
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)

## Artifacts
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)
