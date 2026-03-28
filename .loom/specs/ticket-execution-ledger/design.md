---
id: ticket-execution-ledger
title: "Ticket execution ledger"
status: finalized
created-at: 2026-03-28T03:52:16.109Z
updated-at: 2026-03-28T03:53:16.524Z
research: []
initiatives: []
capabilities:
  - self-contained-ticket-work-definitions
  - stored-status-derived-effective-status-and-dependencies
  - journal-checkpoint-attachment-and-freeze-rules
  - branch-intent-and-shared-human-ai-surfaces
---

## Design Notes
## Problem framing
Pi Loom's execution model depends on one truthful shared ledger for live work. Without a strong ticket contract, plans, Ralph runs, critique records, or chats start becoming shadow ledgers and later workers cannot tell what is actually current.

## Desired behavior
A ticket should be a detail-first, self-contained execution record that explains why the work exists, what generally needs to happen, what evidence proves completion, and what has changed so far. The ticket layer must remain authoritative for live execution truth even when bounded orchestration or review layers surround it.

## Scope
This spec covers ticket detail and status semantics, dependency graphs, journal/checkpoint/attachment behavior, closed-ticket structural freeze rules, branch intent, and the distinction between human and AI surfaces over the same ledger.

## Non-goals
This spec does not turn tickets into replacement specs, plans, or docs. It does not require every ephemeral one-off action to become a durable ticket. It also does not let Ralph or critique replace ticket truth.

## Dependencies and adjacent specs
Tickets depend on plans for broader execution strategy, on specs for intended behavior where applicable, on research and initiatives for upstream context, and on critique/Ralph/docs as surrounding layers that must still defer to ticket truth for live execution state.

## Risks and edge cases
The largest risk is allowing tickets to become vague placeholders that cannot survive handoff. Another is letting plans, Ralph, or critique accumulate newer truth than the ticket itself. Closed-ticket mutation rules and effective-status rollups are also easy places to lie if stored and derived state are blurred.

## Verification expectations
A conforming ticket can be read in isolation and still explain the execution slice, acceptance, dependencies, risks, and verification expectations. Later readers should be able to distinguish stored status from derived ready/blocked summaries and should see a truthful history of progress or blockers in the journal/checkpoint record.

## Provenance
Derived from README.md, ticketing/README.md, ticket tool/store contracts, and current execution-ledger guidance in the repository.

## Open questions
Human workbench UX may evolve, but both human and AI surfaces must remain backed by the same canonical ticket ledger described here.

## Capability Map
- self-contained-ticket-work-definitions: Self-contained ticket work definitions
- stored-status-derived-effective-status-and-dependencies: Stored status, derived effective status, and dependency truth
- journal-checkpoint-attachment-and-freeze-rules: Journal, checkpoint, attachment, and freeze rules
- branch-intent-and-shared-human-ai-surfaces: Branch intent and shared human/AI surfaces

## Requirements
- req-001: A ticket SHALL preserve enough context to explain why the work exists, what scope it covers, what non-goals apply, and what evidence will prove completion.
  Acceptance: A newcomer can read the ticket and understand what must happen next and why.; Acceptance and verification expectations are explicit rather than implicit.; The ticket remains useful even when opened outside the surrounding chat context.
  Capabilities: self-contained-ticket-work-definitions
- req-002: Acceptance criteria, implementation intent, risks, and verification expectations SHALL remain explicit in the ticket body rather than implied by surrounding chat.
  Acceptance: A newcomer can read the ticket and understand what must happen next and why.; Acceptance and verification expectations are explicit rather than implicit.; The ticket remains useful even when opened outside the surrounding chat context.
  Capabilities: self-contained-ticket-work-definitions
- req-003: The ticket layer SHALL remain the canonical shared ledger for live execution truth.
  Acceptance: A newcomer can read the ticket and understand what must happen next and why.; Acceptance and verification expectations are explicit rather than implicit.; The ticket remains useful even when opened outside the surrounding chat context.
  Capabilities: self-contained-ticket-work-definitions
- req-004: Tickets SHALL remain detailed enough to survive handoff even when a plan or spec already exists above them.
  Acceptance: A newcomer can read the ticket and understand what must happen next and why.; Acceptance and verification expectations are explicit rather than implicit.; The ticket remains useful even when opened outside the surrounding chat context.
  Capabilities: self-contained-ticket-work-definitions
- req-005: Dependencies SHALL be first-class enough that later callers can query ready versus blocked work truthfully.
  Acceptance: A caller can tell whether a ticket is merely open, actively in progress, in review, closed, ready, or blocked.; Dependency changes alter graph truth rather than only changing human-written prose.; Ready/blocked views do not overwrite the underlying stored status field.
  Capabilities: stored-status-derived-effective-status-and-dependencies
- req-006: List and graph surfaces MAY derive effective execution states such as ready or blocked, but those derived states SHALL remain distinguishable from the stored status field.
  Acceptance: A caller can tell whether a ticket is merely open, actively in progress, in review, closed, ready, or blocked.; Dependency changes alter graph truth rather than only changing human-written prose.; Ready/blocked views do not overwrite the underlying stored status field.
  Capabilities: stored-status-derived-effective-status-and-dependencies
- req-007: The ticket system SHALL preserve a stored status lifecycle for open, in-progress, review, and closed truth.
  Acceptance: A caller can tell whether a ticket is merely open, actively in progress, in review, closed, ready, or blocked.; Dependency changes alter graph truth rather than only changing human-written prose.; Ready/blocked views do not overwrite the underlying stored status field.
  Capabilities: stored-status-derived-effective-status-and-dependencies
- req-008: Ticket graph semantics SHALL remain durable rather than being reconstructed from informal prose references alone.
  Acceptance: A caller can tell whether a ticket is merely open, actively in progress, in review, closed, ready, or blocked.; Dependency changes alter graph truth rather than only changing human-written prose.; Ready/blocked views do not overwrite the underlying stored status field.
  Capabilities: stored-status-derived-effective-status-and-dependencies
- req-009: Checkpoints and attachments MAY be added to improve auditability or handoff without displacing the ticket body as the core execution definition.
  Acceptance: A later reader can inspect how the work evolved from ticket journals or checkpoints.; Closed tickets cannot silently mutate their structural relationships while still claiming historical closure.; Reopening a ticket is an explicit lifecycle transition, not an undocumented workaround.
  Capabilities: journal-checkpoint-attachment-and-freeze-rules
- req-010: Closed tickets SHALL reject structural relationship changes such as dependencies or parentage until they are reopened, while still allowing append-only historical additions where explicitly supported.
  Acceptance: A later reader can inspect how the work evolved from ticket journals or checkpoints.; Closed tickets cannot silently mutate their structural relationships while still claiming historical closure.; Reopening a ticket is an explicit lifecycle transition, not an undocumented workaround.
  Capabilities: journal-checkpoint-attachment-and-freeze-rules
- req-011: Reopen semantics SHALL restore closed work truthfully instead of requiring ad hoc manual resurrection.
  Acceptance: A later reader can inspect how the work evolved from ticket journals or checkpoints.; Closed tickets cannot silently mutate their structural relationships while still claiming historical closure.; Reopening a ticket is an explicit lifecycle transition, not an undocumented workaround.
  Capabilities: journal-checkpoint-attachment-and-freeze-rules
- req-012: Ticket journal entries SHALL preserve decisions, discoveries, blockers, verification, and progress as durable execution history.
  Acceptance: A later reader can inspect how the work evolved from ticket journals or checkpoints.; Closed tickets cannot silently mutate their structural relationships while still claiming historical closure.; Reopening a ticket is an explicit lifecycle transition, not an undocumented workaround.
  Capabilities: journal-checkpoint-attachment-and-freeze-rules
- req-013: Branch selection SHALL NOT rely on transient local git heuristics or external refs alone when canonical ticket intent is available.
  Acceptance: Human and AI surfaces agree on ticket state because they share one underlying ledger.; Rendered views or projections can be regenerated without losing ticket truth.; Worktree-backed runtimes can determine branch intent from ticket truthfully.
  Capabilities: branch-intent-and-shared-human-ai-surfaces
- req-014: Execution tickets SHALL preserve branch intent through durable fields that distinguish default behavior, family allocation, and exact branch overrides.
  Acceptance: Human and AI surfaces agree on ticket state because they share one underlying ledger.; Rendered views or projections can be regenerated without losing ticket truth.; Worktree-backed runtimes can determine branch intent from ticket truthfully.
  Capabilities: branch-intent-and-shared-human-ai-surfaces
- req-015: Human workbench surfaces and AI-facing ticket tools SHALL operate over the same canonical ticket ledger rather than creating separate truth systems.
  Acceptance: Human and AI surfaces agree on ticket state because they share one underlying ledger.; Rendered views or projections can be regenerated without losing ticket truth.; Worktree-backed runtimes can determine branch intent from ticket truthfully.
  Capabilities: branch-intent-and-shared-human-ai-surfaces
- req-016: Ticket projections or rendered views MAY improve readability, but the canonical SQLite-backed ticket record SHALL remain the authoritative source.
  Acceptance: Human and AI surfaces agree on ticket state because they share one underlying ledger.; Rendered views or projections can be regenerated without losing ticket truth.; Worktree-backed runtimes can determine branch intent from ticket truthfully.
  Capabilities: branch-intent-and-shared-human-ai-surfaces
