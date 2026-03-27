---
id: curated-documentation-governance
title: "Curated documentation governance"
status: active
type: overview
section: overviews
topic-id: curated-documentation-governance
topic-role: owner
publication-status: current-owner
publication-summary: "Current canonical overview for governed topic curated-documentation-governance."
recommended-action: update-current-owner
current-owner: curated-documentation-governance
active-owners:
  - curated-documentation-governance
audience:
  - ai
  - human
source: workspace:workspace
verified-at: 2026-03-27T10:58:00.000Z
verification-source: manual:pl-0130-iter-002-postclose
successor: null
successor-title: null
predecessors: []
retirement-reason: null
topics:
  - audit
  - closeout
  - docs-governance
  - documentation
  - governance
outputs: []
upstream-path: null
---

# Curated documentation governance

Pi Loom now treats documentation as a governed explanatory layer rather than an append-only note pile. Each governed topic has one current canonical overview, companion material has an explicit supporting role, historical records stay readable without competing with current truth, and workflow gates require significant execution work to say what happened to the docs surface before that work can close.

## What the governed model means

The docs layer is SQLite-backed canonical state. Repository files under `.loom/docs/` are review projections derived from that canonical record, not a second source of truth. Maintainers should change documentation truth through `docs_write`, `docs_update`, or projection reconcile workflows instead of assuming a raw file edit publishes canonical reality.

A governed topic is identified by a stable `topicId`. The current owner for that topic is the active overview whose `topicRole` is `owner`. Companion guides, workflows, concepts, operations notes, and FAQs may share the same topic, but they do not replace the owner overview and should not compete with it in default retrieval.

## Publication and lifecycle rules

Governed docs use explicit lifecycle and publication metadata instead of filename conventions:

- `active + owner` means the doc is the current canonical overview for its topic.
- `active + companion` means the doc is current supporting material and should appear only when the caller intentionally asks for supporting docs or narrows to its type.
- `superseded` keeps historical truth while pointing at the successor that now owns current truth.
- `archived` keeps readable history for retired material without treating it as current guidance.
- Missing topic metadata is migration debt, not hidden truth to infer from titles or paths.

When new material would duplicate an existing active owner, update or supersede the existing record instead of publishing a parallel overview.

## Retrieval defaults

`docs_list` now defaults to curated discovery. Ordinary discovery surfaces current topic owners and active governance debt. Supporting companions and historical records require explicit access through `includeSupporting`, `includeHistorical`, or narrower exact filters. This keeps query results aligned with current truth while preserving traceable history.

## Drift detection and verification

`docs_audit` is the governance backstop. It classifies four failure modes:

1. `stale`: the document or one of its linked source/context records changed after the last recorded review.
2. `overlapping`: multiple active owner overviews claim the same topic.
3. `orphaned`: source targets, context refs, topic metadata, or upstream paths no longer resolve cleanly.
4. `unverified`: the record lacks `verifiedAt` or `verificationSource` evidence.

A clean document is not just well-written; it is also verified against the current owning work. When a ticket, spec, initiative, critique, or upstream file changes after verification, the document should be re-reviewed and its verification metadata refreshed. Refreshing verification without changing the body is valid when the document still matches reality.

## Ticket closeout expectations

The execution ledger now forces documentation accountability. Closing meaningful work requires a truthful docs disposition:

- `create` when the work produced a new governed doc.
- `update` when an existing governed doc changed.
- `supersede` when current truth moved to a successor record.
- `archive` when the accepted result is historical-only.
- `waive` only when the explanatory surface truly did not change, with an explicit waiver note.

For non-waiver closeout, the cited docs must link back to the ticket through `sourceTarget` or `contextRefs`, and those docs must pass their own governance audit before the ticket can close. This prevents execution completion from outrunning explanatory truth.

## Recommended maintenance loop

1. Discover the current topic owner with `docs_list` before creating new records.
2. Read the existing owner or packet so updates start from bounded current context.
3. Publish changes through `docs_write` or `docs_update`, keeping topic ownership, lifecycle metadata, and verification evidence explicit.
4. Run `docs_audit` when work could have introduced drift, and persist critique when the findings need durable review.
5. Close related tickets only after the referenced docs reflect accepted reality and the recorded docs disposition matches what actually changed.

## Common failure modes

- Publishing a second active overview for the same topic instead of updating the current owner.
- Treating `.loom/docs/` files as canonical truth instead of derived review surfaces.
- Leaving `verifiedAt` or `verificationSource` empty after substantive work.
- Closing a ticket with `docsDisposition=waive` when the work actually changed operator understanding.
- Ignoring stale audit findings after linked specs, tickets, critiques, or upstream docs changed.

## Verification evidence for this operating model

The rollout verification pass exercised the targeted docs and ticketing test suites that cover governed metadata, curated retrieval defaults, audit classification, projection rendering, and documentation-impact closeout gating. The final rollout critique was resolved only after the post-follow-up workspace audit returned zero findings across the governed active corpus, so maintainers should treat this overview plus the active audit surface as the durable operating contract for keeping the governed docs corpus truthful.
