---
id: curated-documentation-governance
title: "Curated documentation governance"
status: finalized
created-at: 2026-03-27T07:28:59.888Z
updated-at: 2026-03-27T07:32:57.606Z
research: []
initiatives: []
capabilities:
  - topic-owned-canonical-surface
  - lifecycle-and-successor-semantics
  - provenance-and-publication-truth
  - drift-audit-classification
  - curated-retrieval-and-workflow-dispositions
---

## Overview
Pi Loom maintains a curated documentation surface where each governed topic has one current canonical overview, companion documents have explicit roles, historical records remain traceable without competing with current truth, audits classify documentation drift, and significant work records an explicit documentation disposition before execution closes.

## Capabilities
- topic-owned-canonical-surface: Topic-owned canonical surface
- lifecycle-and-successor-semantics: Lifecycle and successor semantics
- provenance-and-publication-truth: Provenance and publication truth
- drift-audit-classification: Drift audit classification
- curated-retrieval-and-workflow-dispositions: Curated retrieval and workflow dispositions

## Requirements
- req-001: Each topic has at most one active canonical overview; any additional active documentation for that topic must use a distinct doc type and narrower role.
  Acceptance: A second active overview for the same topic is rejected or flagged as overlapping governance debt.; Migrating an overview to new content preserves the topic identity instead of fragmenting current truth across sibling docs.; Readers can identify the canonical owner for a topic separately from companion guides, workflows, concepts, operations notes, or FAQs.
  Capabilities: topic-owned-canonical-surface
- req-002: Every governed document declares one stable topic identifier that names the behavior or area it explains across revisions and successor chains.
  Acceptance: A second active overview for the same topic is rejected or flagged as overlapping governance debt.; Migrating an overview to new content preserves the topic identity instead of fragmenting current truth across sibling docs.; Readers can identify the canonical owner for a topic separately from companion guides, workflows, concepts, operations notes, or FAQs.
  Capabilities: topic-owned-canonical-surface
- req-003: When new material would duplicate an existing active topic owner, the system updates or supersedes the existing document instead of creating ambiguous parallel overviews.
  Acceptance: A second active overview for the same topic is rejected or flagged as overlapping governance debt.; Migrating an overview to new content preserves the topic identity instead of fragmenting current truth across sibling docs.; Readers can identify the canonical owner for a topic separately from companion guides, workflows, concepts, operations notes, or FAQs.
  Capabilities: topic-owned-canonical-surface
- req-004: A superseded document records the successor that now owns current truth, or an explicit retirement rationale when the topic no longer has a current published replacement.
  Acceptance: Consumers can distinguish current truth from historical material without inspecting raw revision history.; Default retrieval excludes superseded and archived docs unless the caller explicitly asks for history.; Removed or replaced features retain an explainable documentation trail through successor or retirement metadata.
  Capabilities: lifecycle-and-successor-semantics
- req-005: Archived documents remain readable history but never participate in default current-truth retrieval or satisfy active topic ownership.
  Acceptance: Consumers can distinguish current truth from historical material without inspecting raw revision history.; Default retrieval excludes superseded and archived docs unless the caller explicitly asks for history.; Removed or replaced features retain an explainable documentation trail through successor or retirement metadata.
  Capabilities: lifecycle-and-successor-semantics
- req-006: V1 documentation lifecycle exposes active, superseded, and archived records only; draft or proposed publication states are deferred.
  Acceptance: Consumers can distinguish current truth from historical material without inspecting raw revision history.; Default retrieval excludes superseded and archived docs unless the caller explicitly asks for history.; Removed or replaced features retain an explainable documentation trail through successor or retirement metadata.
  Capabilities: lifecycle-and-successor-semantics
- req-007: Canonical SQLite-backed documentation records remain the source of truth; repository files and exports are derived review surfaces rather than editable primary state.
  Acceptance: A reader can trace a governed doc back to the ticket, spec, critique, initiative, or workspace context that authorized it.; Audit tooling has enough provenance to classify stale or orphaned material without inferring ownership from file names alone.; Editing an exported markdown projection without canonical reconciliation does not silently redefine documentation truth.
  Capabilities: provenance-and-publication-truth
- req-008: Every published document records its source target, update reason, relevant context refs, scope paths, and linked output paths when repository review surfaces exist.
  Acceptance: A reader can trace a governed doc back to the ticket, spec, critique, initiative, or workspace context that authorized it.; Audit tooling has enough provenance to classify stale or orphaned material without inferring ownership from file names alone.; Editing an exported markdown projection without canonical reconciliation does not silently redefine documentation truth.
  Capabilities: provenance-and-publication-truth
- req-009: Revision history preserves when and why governed explanatory truth changed so audits and maintainers can trace claims back to the work that justified them.
  Acceptance: A reader can trace a governed doc back to the ticket, spec, critique, initiative, or workspace context that authorized it.; Audit tooling has enough provenance to classify stale or orphaned material without inferring ownership from file names alone.; Editing an exported markdown projection without canonical reconciliation does not silently redefine documentation truth.
  Capabilities: provenance-and-publication-truth
- req-010: A stale finding means the linked source context or governed behavior changed materially without corresponding documentation review.
  Acceptance: Audit output names a concrete finding class rather than a generic drift warning.; Each finding class maps to an obvious remediation path such as update, supersede, archive, relink, or add missing verification evidence.; The audit surface can detect ambiguity even when the underlying docs remain syntactically valid.
  Capabilities: drift-audit-classification
- req-011: An orphaned finding means a document lacks authoritative source ownership, successor context, or maintainable provenance for the behavior it claims to explain.
  Acceptance: Audit output names a concrete finding class rather than a generic drift warning.; Each finding class maps to an obvious remediation path such as update, supersede, archive, relink, or add missing verification evidence.; The audit surface can detect ambiguity even when the underlying docs remain syntactically valid.
  Capabilities: drift-audit-classification
- req-012: An overlapping finding means multiple active docs claim the same topic and role without an intentional ownership boundary.
  Acceptance: Audit output names a concrete finding class rather than a generic drift warning.; Each finding class maps to an obvious remediation path such as update, supersede, archive, relink, or add missing verification evidence.; The audit surface can detect ambiguity even when the underlying docs remain syntactically valid.
  Capabilities: drift-audit-classification
- req-013: An unverified finding means the document lacks required review or docs-impact evidence for its current claims.
  Acceptance: Audit output names a concrete finding class rather than a generic drift warning.; Each finding class maps to an obvious remediation path such as update, supersede, archive, relink, or add missing verification evidence.; The audit surface can detect ambiguity even when the underlying docs remain syntactically valid.
  Capabilities: drift-audit-classification
- req-014: Governance audits classify at least stale, overlapping, orphaned, and unverified documentation findings.
  Acceptance: Audit output names a concrete finding class rather than a generic drift warning.; Each finding class maps to an obvious remediation path such as update, supersede, archive, relink, or add missing verification evidence.; The audit surface can detect ambiguity even when the underlying docs remain syntactically valid.
  Capabilities: drift-audit-classification
- req-015: Closing significant work without a recorded docs-impact disposition is incomplete even when the code or plan work itself is otherwise done.
  Acceptance: A default docs query prefers active canonical truth over historical residue.; Deferrals are durable and actionable because they point at a blocker or follow-up ticket instead of chat-only intent.; Significant work cannot close truthfully with an implicit or omitted docs decision.
  Capabilities: curated-retrieval-and-workflow-dispositions
- req-016: Default retrieval and publication surfaces return active canonical docs first, then companion active docs, and only include superseded or archived history on explicit request.
  Acceptance: A default docs query prefers active canonical truth over historical residue.; Deferrals are durable and actionable because they point at a blocker or follow-up ticket instead of chat-only intent.; Significant work cannot close truthfully with an implicit or omitted docs decision.
  Capabilities: curated-retrieval-and-workflow-dispositions
- req-017: Execution records distinguish explanatory docs from tickets, plans, and critiques so the docs layer remains curated explanation rather than a dump of execution history.
  Acceptance: A default docs query prefers active canonical truth over historical residue.; Deferrals are durable and actionable because they point at a blocker or follow-up ticket instead of chat-only intent.; Significant work cannot close truthfully with an implicit or omitted docs decision.
  Capabilities: curated-retrieval-and-workflow-dispositions
- req-018: Significant work closeout records one explicit docs-impact disposition: no-docs-impact, update-existing-doc, publish-new-doc, supersede-or-archive-doc, or defer-with-ticket-or-blocker.
  Acceptance: A default docs query prefers active canonical truth over historical residue.; Deferrals are durable and actionable because they point at a blocker or follow-up ticket instead of chat-only intent.; Significant work cannot close truthfully with an implicit or omitted docs decision.
  Capabilities: curated-retrieval-and-workflow-dispositions

## Clarifications
- 2026-03-27T07:29:34.144Z Does v1 include a draft or proposed documentation lifecycle state for unpublished work? -> No. V1 stays intentionally sparse: docs governance only distinguishes active current truth from superseded or archived history. Unpublished brainstorming remains in specs, plans, tickets, or source files until a document is ready to become governed explanatory truth. A draft/proposed docs lifecycle is deferred until curated retrieval, audit, and corpus migration are stable enough to avoid mixing tentative notes into the default truth surface.
- 2026-03-27T07:30:30.228Z Can multiple active overview documents coexist for the same governed topic? -> No. A governed topic may have at most one active canonical overview at a time. Additional active documents on the same topic are only allowed when they serve a distinct role such as guide, workflow, operations, concept, or FAQ and their scope is subordinate to or explicitly different from the topic's canonical overview.
- 2026-03-27T07:30:36.426Z How may significant work defer documentation updates when docs changes are not completed in the same execution slice? -> Deferral is only valid when the execution closeout records an explicit docs-impact disposition that points to a concrete follow-up ticket or durable blocker. 'We should document this later' is not sufficient. The default workflow must force either no-docs-impact, update-existing-doc, publish-new-doc, supersede-or-archive-doc, or defer-with-ticket-or-blocker before significant work can close truthfully.
