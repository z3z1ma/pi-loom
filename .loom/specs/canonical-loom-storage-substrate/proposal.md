---
id: canonical-loom-storage-substrate
title: "Canonical Loom storage substrate"
status: finalized
created-at: 2026-03-28T03:47:42.601Z
updated-at: 2026-03-28T03:48:31.849Z
research: []
initiatives: []
capabilities:
  - explicit-space-repository-and-worktree-topology
  - canonical-entities-links-and-display-ids
  - append-only-events-and-lifecycle-history
  - clone-local-runtime-attachment-boundary
  - backend-portability-and-repository-scoped-reservations
---

## Overview
Pi Loom persists canonical shared truth in a SQLite-backed storage substrate that models spaces, repositories, worktrees, entities, links, events, runtime attachments, and related reservations as the durable coordination contract for every Loom layer. The substrate must preserve explicit identity, append-only history where promised, portable cross-layer graph semantics, and a hard boundary between canonical shared records and clone-local runtime state so higher layers can project, packetize, search, and orchestrate without treating rendered markdown, packets, or local process details as source of truth.

## Capabilities
- explicit-space-repository-and-worktree-topology: Explicit space, repository, and worktree topology
- canonical-entities-links-and-display-ids: Canonical entities, graph links, and human-facing display ids
- append-only-events-and-lifecycle-history: Append-only lifecycle and mutation history
- clone-local-runtime-attachment-boundary: Clone-local runtime attachment boundary
- backend-portability-and-repository-scoped-reservations: Backend portability and repository-scoped reservations

## Requirements
- req-001: A repository MAY remain canonically known to a space even when no local worktree is currently available, allowing higher layers to distinguish enrolled shared identity from local execution availability.
  Acceptance: A caller can distinguish space-level identity, repository identity, and worktree identity from storage-backed data.; Higher-layer records can resolve or store repository ownership without guessing from cwd alone.; Unavailable local clones or worktrees do not erase canonical repository membership or force the system to fabricate a replacement identity.
  Capabilities: explicit-space-repository-and-worktree-topology
- req-002: Repository and worktree identity SHALL remain distinct from the current process working directory so later reads, writes, and runtime launches can target the intended repository truthfully.
  Acceptance: A caller can distinguish space-level identity, repository identity, and worktree identity from storage-backed data.; Higher-layer records can resolve or store repository ownership without guessing from cwd alone.; Unavailable local clones or worktrees do not erase canonical repository membership or force the system to fabricate a replacement identity.
  Capabilities: explicit-space-repository-and-worktree-topology
- req-003: Repository-scoped records SHALL be able to preserve owning repository identity without collapsing all durable state into one undifferentiated workspace bucket.
  Acceptance: A caller can distinguish space-level identity, repository identity, and worktree identity from storage-backed data.; Higher-layer records can resolve or store repository ownership without guessing from cwd alone.; Unavailable local clones or worktrees do not erase canonical repository membership or force the system to fabricate a replacement identity.
  Capabilities: explicit-space-repository-and-worktree-topology
- req-004: The canonical storage model SHALL preserve durable records for spaces, repositories, and worktrees as first-class topology concepts that higher layers can address explicitly.
  Acceptance: A caller can distinguish space-level identity, repository identity, and worktree identity from storage-backed data.; Higher-layer records can resolve or store repository ownership without guessing from cwd alone.; Unavailable local clones or worktrees do not erase canonical repository membership or force the system to fabricate a replacement identity.
  Capabilities: explicit-space-repository-and-worktree-topology
- req-005: Canonical entity identifiers SHALL be opaque storage ids rather than human-authored slugs that leak implementation assumptions into every caller.
  Acceptance: A caller can resolve a durable record by display id without exposing or depending on the opaque internal storage id.; Links can express durable relationships among canonical records without requiring higher layers to infer the graph from filenames or free-form prose alone.; Upper layers can rebuild package-specific views from the shared entity envelope plus typed attributes.
  Capabilities: canonical-entities-links-and-display-ids
- req-006: Cross-layer relationships that matter to shared truth SHALL be representable through first-class canonical links instead of relying exclusively on path conventions, markdown heuristics, or transcript memory.
  Acceptance: A caller can resolve a durable record by display id without exposing or depending on the opaque internal storage id.; Links can express durable relationships among canonical records without requiring higher layers to infer the graph from filenames or free-form prose alone.; Upper layers can rebuild package-specific views from the shared entity envelope plus typed attributes.
  Capabilities: canonical-entities-links-and-display-ids
- req-007: Entity envelopes SHALL preserve enough common metadata such as kind, status, tags, timestamps, repository ownership, and typed attributes for higher layers to rebuild their own bounded read models.
  Acceptance: A caller can resolve a durable record by display id without exposing or depending on the opaque internal storage id.; Links can express durable relationships among canonical records without requiring higher layers to infer the graph from filenames or free-form prose alone.; Upper layers can rebuild package-specific views from the shared entity envelope plus typed attributes.
  Capabilities: canonical-entities-links-and-display-ids
- req-008: Human-facing lookup SHALL remain available through per-kind display ids so users and upper layers can address research, specs, plans, tickets, and related records without knowing opaque ids.
  Acceptance: A caller can resolve a durable record by display id without exposing or depending on the opaque internal storage id.; Links can express durable relationships among canonical records without requiring higher layers to infer the graph from filenames or free-form prose alone.; Upper layers can rebuild package-specific views from the shared entity envelope plus typed attributes.
  Capabilities: canonical-entities-links-and-display-ids
- req-009: A storage implementation SHALL NOT require callers to rewrite or delete prior events in order to record later truth about the same entity.
  Acceptance: A reader can distinguish current entity state from its event history.; Decision and mutation history remains inspectable even when a package also stores the current aggregate snapshot in entity attributes.; Later lifecycle updates do not destroy or rewrite prior durable event records.
  Capabilities: append-only-events-and-lifecycle-history
- req-010: Canonical entity events SHALL be append-only records rather than mutable status snapshots disguised as history.
  Acceptance: A reader can distinguish current entity state from its event history.; Decision and mutation history remains inspectable even when a package also stores the current aggregate snapshot in entity attributes.; Later lifecycle updates do not destroy or rewrite prior durable event records.
  Capabilities: append-only-events-and-lifecycle-history
- req-011: Higher-layer packages MAY keep rich typed snapshots in entity attributes, but appending canonical events SHALL remain the durable path for notable lifecycle or decision history.
  Acceptance: A reader can distinguish current entity state from its event history.; Decision and mutation history remains inspectable even when a package also stores the current aggregate snapshot in entity attributes.; Later lifecycle updates do not destroy or rewrite prior durable event records.
  Capabilities: append-only-events-and-lifecycle-history
- req-012: The storage contract SHALL support ordered per-entity event playback so higher layers can reconstruct decisions, lifecycle transitions, and mutation provenance truthfully.
  Acceptance: A reader can distinguish current entity state from its event history.; Decision and mutation history remains inspectable even when a package also stores the current aggregate snapshot in entity attributes.; Later lifecycle updates do not destroy or rewrite prior durable event records.
  Capabilities: append-only-events-and-lifecycle-history
- req-013: Canonical records SHALL remain intelligible without one specific machine, clone, absolute path, process id, or local scratch directory.
  Acceptance: A later reader can tell whether a stored fact is shared canonical truth or a clone-local runtime attachment.; Deleting or rotating local runtime attachments does not erase the canonical record of the related Loom entity.; Derived human-facing artifacts can be regenerated from canonical state instead of serving as the only durable copy of the information.
  Capabilities: clone-local-runtime-attachment-boundary
- req-014: Higher layers MAY attach local runtime descriptors, observability artifacts, or worktree control-plane state, but those attachments SHALL remain distinguishable from canonical shared records.
  Acceptance: A later reader can tell whether a stored fact is shared canonical truth or a clone-local runtime attachment.; Deleting or rotating local runtime attachments does not erase the canonical record of the related Loom entity.; Derived human-facing artifacts can be regenerated from canonical state instead of serving as the only durable copy of the information.
  Capabilities: clone-local-runtime-attachment-boundary
- req-015: Rendered markdown, packets, dashboards, and similar human-facing exports SHALL NOT become alternate canonical stores merely because they were derived from canonical data.
  Acceptance: A later reader can tell whether a stored fact is shared canonical truth or a clone-local runtime attachment.; Deleting or rotating local runtime attachments does not erase the canonical record of the related Loom entity.; Derived human-facing artifacts can be regenerated from canonical state instead of serving as the only durable copy of the information.
  Capabilities: clone-local-runtime-attachment-boundary
- req-016: Runtime attachments SHALL be modeled as clone-local records associated with a local execution environment rather than as canonical substitutes for shared entities.
  Acceptance: A later reader can tell whether a stored fact is shared canonical truth or a clone-local runtime attachment.; Deleting or rotating local runtime attachments does not erase the canonical record of the related Loom entity.; Derived human-facing artifacts can be regenerated from canonical state instead of serving as the only durable copy of the information.
  Capabilities: clone-local-runtime-attachment-boundary
- req-017: A backend migration SHALL preserve canonical entity, link, event, runtime-attachment, and reservation meanings even if physical implementation details change.
  Acceptance: A future backend can preserve the same high-level storage concepts without redefining what counts as canonical truth.; Repository-scoped reservations remain stable even when local branches or worktrees have already been deleted.; Upper layers depend on storage meanings that survive backend substitution, not on SQLite-specific incidental behavior.
  Capabilities: backend-portability-and-repository-scoped-reservations
- req-018: Portable storage semantics SHALL be defined by the data contract and behavioral boundaries, not by one specific SQL engine feature leaking into every upper-layer assumption.
  Acceptance: A future backend can preserve the same high-level storage concepts without redefining what counts as canonical truth.; Repository-scoped reservations remain stable even when local branches or worktrees have already been deleted.; Upper layers depend on storage meanings that survive backend substitution, not on SQLite-specific incidental behavior.
  Capabilities: backend-portability-and-repository-scoped-reservations
- req-019: Repository-scoped coordination records such as durable branch-family reservations SHALL remain canonical shared truth rather than ephemeral runtime guesses.
  Acceptance: A future backend can preserve the same high-level storage concepts without redefining what counts as canonical truth.; Repository-scoped reservations remain stable even when local branches or worktrees have already been deleted.; Upper layers depend on storage meanings that survive backend substitution, not on SQLite-specific incidental behavior.
  Capabilities: backend-portability-and-repository-scoped-reservations
- req-020: SQLite MAY be the current canonical backend, but the meaning of shared storage records SHALL remain valid under future adapter-compatible backends.
  Acceptance: A future backend can preserve the same high-level storage concepts without redefining what counts as canonical truth.; Repository-scoped reservations remain stable even when local branches or worktrees have already been deleted.; Upper layers depend on storage meanings that survive backend substitution, not on SQLite-specific incidental behavior.
  Capabilities: backend-portability-and-repository-scoped-reservations

## Clarifications
(none)
