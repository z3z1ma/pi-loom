---
id: bounded-documentation-maintenance
title: "Bounded documentation maintenance"
status: finalized
created-at: 2026-03-28T03:54:37.122Z
updated-at: 2026-03-28T03:55:37.223Z
research: []
initiatives: []
capabilities:
  - post-completion-explanatory-memory
  - direct-writes-versus-bounded-maintainer-passes
  - provenance-upstream-ingestion-and-revision-history
  - repository-aware-path-and-output-truth
---

## Overview
Pi Loom maintains documentation as a post-completion explanatory memory layer updated through direct writes or bounded fresh-context maintainer passes. Documentation records must preserve high-level accepted system understanding, revision history, provenance to upstream work or repository documents, and explicit separation from plans, tickets, critique, and raw repository files so the durable explanatory corpus stays truthful and governable.

## Capabilities
- post-completion-explanatory-memory: Post-completion explanatory memory
- direct-writes-versus-bounded-maintainer-passes: Direct writes versus bounded maintainer passes
- provenance-upstream-ingestion-and-revision-history: Provenance, upstream ingestion, and revision history
- repository-aware-path-and-output-truth: Repository-aware path and output truth

## Requirements
- req-001: Documentation SHALL be used for architecture, workflow, concept, and operations explanations that describe accepted system reality rather than desired future behavior or live execution state.
  Acceptance: A reader can tell that a document describes accepted reality rather than a work-in-progress plan.; The document remains useful to future humans or agents as durable explanatory context.; The layer does not collapse into lower-layer execution or review notes.
  Capabilities: post-completion-explanatory-memory
- req-002: Documentation SHALL remain explanatory and high-level rather than becoming an API reference generator or a copy of ticket journals.
  Acceptance: A reader can tell that a document describes accepted reality rather than a work-in-progress plan.; The document remains useful to future humans or agents as durable explanatory context.; The layer does not collapse into lower-layer execution or review notes.
  Capabilities: post-completion-explanatory-memory
- req-003: Documentation updates SHALL happen after relevant implementation and review reality is known strongly enough to describe truthfully.
  Acceptance: A reader can tell that a document describes accepted reality rather than a work-in-progress plan.; The document remains useful to future humans or agents as durable explanatory context.; The layer does not collapse into lower-layer execution or review notes.
  Capabilities: post-completion-explanatory-memory
- req-004: The docs layer SHALL remain distinct from plans, tickets, critique, and specs even when it cites or links them.
  Acceptance: A reader can tell that a document describes accepted reality rather than a work-in-progress plan.; The document remains useful to future humans or agents as durable explanatory context.; The layer does not collapse into lower-layer execution or review notes.
  Capabilities: post-completion-explanatory-memory
- req-005: Both update modes SHALL operate on the same canonical documentation records rather than splitting truth between orchestrated and direct paths.
  Acceptance: Both paths converge on the same canonical doc record and revision history.; Operators can choose the correct maintenance path based on whether the exact mutation is already known.; Packetized maintainer passes remain bounded rather than free-form chat continuations.
  Capabilities: direct-writes-versus-bounded-maintainer-passes
- req-006: Bounded documentation update passes SHALL compile packet context and expect a fresh maintainer process to land the resulting canonical revision.
  Acceptance: Both paths converge on the same canonical doc record and revision history.; Operators can choose the correct maintenance path based on whether the exact mutation is already known.; Packetized maintainer passes remain bounded rather than free-form chat continuations.
  Capabilities: direct-writes-versus-bounded-maintainer-passes
- req-007: Direct documentation writes SHALL be used when the exact desired canonical mutation is already known.
  Acceptance: Both paths converge on the same canonical doc record and revision history.; Operators can choose the correct maintenance path based on whether the exact mutation is already known.; Packetized maintainer passes remain bounded rather than free-form chat continuations.
  Capabilities: direct-writes-versus-bounded-maintainer-passes
- req-008: The difference between 'apply this known state' and 'perform a bounded maintainer pass' SHALL remain explicit in the docs workflow.
  Acceptance: Both paths converge on the same canonical doc record and revision history.; Operators can choose the correct maintenance path based on whether the exact mutation is already known.; Packetized maintainer passes remain bounded rather than free-form chat continuations.
  Capabilities: direct-writes-versus-bounded-maintainer-passes
- req-009: Documentation records SHALL preserve provenance to upstream source targets such as initiatives, specs, tickets, critiques, workspace context, or existing repository documentation files.
  Acceptance: A reader can tell what upstream work or file a documentation record came from.; Repo files can be linked as upstream content sources without becoming the only durable metadata surface.; Revision history preserves why the document changed over time.
  Capabilities: provenance-upstream-ingestion-and-revision-history
- req-010: Each documentation update SHALL append revision history so later readers can see when and why the explanatory record changed.
  Acceptance: A reader can tell what upstream work or file a documentation record came from.; Repo files can be linked as upstream content sources without becoming the only durable metadata surface.; Revision history preserves why the document changed over time.
  Capabilities: provenance-upstream-ingestion-and-revision-history
- req-011: High-value repository documents MAY be ingested into the docs layer through explicit upstream-path linkage rather than by silently assuming the raw file is self-governing metadata.
  Acceptance: A reader can tell what upstream work or file a documentation record came from.; Repo files can be linked as upstream content sources without becoming the only durable metadata surface.; Revision history preserves why the document changed over time.
  Capabilities: provenance-upstream-ingestion-and-revision-history
- req-012: Verification evidence such as verified-at time or verification source SHALL remain recordable so document currency is inspectable.
  Acceptance: A reader can tell what upstream work or file a documentation record came from.; Repo files can be linked as upstream content sources without becoming the only durable metadata surface.; Revision history preserves why the document changed over time.
  Capabilities: provenance-upstream-ingestion-and-revision-history
- req-013: Documentation maintenance SHALL fail closed rather than guessing a repository identity when an ambiguous path or runtime target would misroute the update.
  Acceptance: A documentation record can survive multi-repository export/import without losing which repository its paths belong to.; Ambiguous repository targeting does not silently rewrite the wrong documentation context.; Linked outputs are understandable as derived surfaces, not source of truth.
  Capabilities: repository-aware-path-and-output-truth
- req-014: Linked output paths SHALL describe derived review surfaces or published outputs truthfully without pretending those outputs are canonical storage.
  Acceptance: A documentation record can survive multi-repository export/import without losing which repository its paths belong to.; Ambiguous repository targeting does not silently rewrite the wrong documentation context.; Linked outputs are understandable as derived surfaces, not source of truth.
  Capabilities: repository-aware-path-and-output-truth
- req-015: Path-bearing documentation fields SHALL remain repository-qualified and portable when ambiguity exists in a shared Loom space.
  Acceptance: A documentation record can survive multi-repository export/import without losing which repository its paths belong to.; Ambiguous repository targeting does not silently rewrite the wrong documentation context.; Linked outputs are understandable as derived surfaces, not source of truth.
  Capabilities: repository-aware-path-and-output-truth
- req-016: The canonical documentation record SHALL remain the authoritative explanatory memory even when linked output files or upstream raw docs also exist.
  Acceptance: A documentation record can survive multi-repository export/import without losing which repository its paths belong to.; Ambiguous repository targeting does not silently rewrite the wrong documentation context.; Linked outputs are understandable as derived surfaces, not source of truth.
  Capabilities: repository-aware-path-and-output-truth

## Clarifications
(none)
