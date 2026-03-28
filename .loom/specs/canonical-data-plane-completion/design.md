---
id: canonical-data-plane-completion
title: "Canonical data plane completion"
status: archived
created-at: 2026-03-19T07:51:58.382Z
updated-at: 2026-03-28T00:09:59.164Z
research:
  - sqlite-data-plane-audit-and-enrichment-opportunities
initiatives:
  - canonical-shared-data-plane
capabilities:
  - canonical-event-plane
  - portable-runtime-boundary
  - artifact-subrecord-projection
  - adapter-contract-surface
---

## Design Notes
The spec is intentionally the completion milestone for the current internal-only cutover. It assumes phase-1 canonical link projection is complete and builds on it without preserving backwards-compatibility shims. The implementation should prefer shared storage helpers and package-level materialization boundaries so the resulting data plane is coherent rather than one-off per package.

Core design:
- entities remain package-owned typed snapshots
- links remain the canonical relationship graph
- events become the canonical timeline; payloads carry domain-specific change descriptors
- runtime attachments carry clone-local launch/process descriptors
- selected high-value embedded subrecords become `artifact` entities plus owner links and are rehydrated into package read models on read

Artifact subrecord conventions:
- display ids are deterministic and scoped by owner + subtype + child id
- tags must include subtype and owner id for queryability
- attributes contain the typed payload plus owner references
- owner relations are expressed through canonical links, not embedded path-like refs alone

Event conventions:
- lifecycle events (`created`, `updated`, `status_changed`) are emitted by shared entity-upsert helpers inside the same transaction as the entity write
- graph events (`linked`, `unlinked`) are emitted by the link projection helper inside the same transaction as link mutation
- domain mutation events reuse existing event kinds with structured payloads rather than exploding the enum unnecessarily; payloads must include a stable `change` discriminator

Runtime boundary conventions:
- worker runtime attachments store workspace/process/command/prompt/launch status details per current worktree
- critique/Ralph/docs launch/update descriptors are regenerated from canonical state and are not canonical stored fields
- packets, dashboards, and rendered markdown are derived read surfaces, not canonical stored attributes, whenever typed source state already exists

## Capability Map
- canonical-event-plane: Canonical event plane
- portable-runtime-boundary: Portable runtime boundary
- artifact-subrecord-projection: Artifact-backed subrecord projection
- adapter-contract-surface: Adapter-facing data-plane contract

## Requirements
- req-001: Canonical entity persistence emits `created`, `updated`, and `status_changed` events from the same transaction that writes the entity when the corresponding lifecycle change occurs.
  Acceptance: Changing a projected relationship adds/removes canonical links and emits corresponding `linked`/`unlinked` events in the same logical write.; Creating and then updating a representative entity produces an ordered event stream with `created` followed by structured `updated`/`status_changed` events without duplicate sequences.; Worker, critique, Ralph, research, and docs flows emit domain-specific change payloads that let an adapter observe what changed without diffing the full entity blob.
  Capabilities: canonical-event-plane
- req-002: Event sequences are allocated transactionally so concurrent writers cannot produce duplicate or out-of-order per-entity sequence numbers.
  Acceptance: Changing a projected relationship adds/removes canonical links and emits corresponding `linked`/`unlinked` events in the same logical write.; Creating and then updating a representative entity produces an ordered event stream with `created` followed by structured `updated`/`status_changed` events without duplicate sequences.; Worker, critique, Ralph, research, and docs flows emit domain-specific change payloads that let an adapter observe what changed without diffing the full entity blob.
  Capabilities: canonical-event-plane
- req-003: Packages with named domain mutation boundaries emit structured canonical events for the mutation payloads that matter to adapters, including worker coordination changes, critique review changes, Ralph iteration/decision changes, research artifact changes, and documentation revisions.
  Acceptance: Changing a projected relationship adds/removes canonical links and emits corresponding `linked`/`unlinked` events in the same logical write.; Creating and then updating a representative entity produces an ordered event stream with `created` followed by structured `updated`/`status_changed` events without duplicate sequences.; Worker, critique, Ralph, research, and docs flows emit domain-specific change payloads that let an adapter observe what changed without diffing the full entity blob.
  Capabilities: canonical-event-plane
- req-004: Projected link synchronization emits canonical `linked` and `unlinked` events that identify the affected edge and projection owner.
  Acceptance: Changing a projected relationship adds/removes canonical links and emits corresponding `linked`/`unlinked` events in the same logical write.; Creating and then updating a representative entity produces an ordered event stream with `created` followed by structured `updated`/`status_changed` events without duplicate sequences.; Worker, critique, Ralph, research, and docs flows emit domain-specific change payloads that let an adapter observe what changed without diffing the full entity blob.
  Capabilities: canonical-event-plane
- req-005: Canonical entity attributes do not persist dashboards, packets, or rendered markdown when they are deterministic projections of typed source state already stored canonically.
  Acceptance: Canonical snapshots stay portable across clones because absolute or machine-local launch fields are no longer persisted in entity attributes.; Reading worker, critique, Ralph, docs, and plan records still yields packets/dashboard/launch refs, but their canonical entity payloads no longer store those derived fields.; Worker runtime state survives in `runtime_attachments` keyed to the current worktree and can be removed independently of canonical worker state.
  Capabilities: portable-runtime-boundary
- req-006: Critique, Ralph, and docs launch/update descriptors that are derivable from canonical state are regenerated on read instead of stored in canonical entity attributes.
  Acceptance: Canonical snapshots stay portable across clones because absolute or machine-local launch fields are no longer persisted in entity attributes.; Reading worker, critique, Ralph, docs, and plan records still yields packets/dashboard/launch refs, but their canonical entity payloads no longer store those derived fields.; Worker runtime state survives in `runtime_attachments` keyed to the current worktree and can be removed independently of canonical worker state.
  Capabilities: portable-runtime-boundary
- req-007: Package read APIs continue to return equivalent read models after rebuilding these derived surfaces from canonical state and runtime attachments.
  Acceptance: Canonical snapshots stay portable across clones because absolute or machine-local launch fields are no longer persisted in entity attributes.; Reading worker, critique, Ralph, docs, and plan records still yields packets/dashboard/launch refs, but their canonical entity payloads no longer store those derived fields.; Worker runtime state survives in `runtime_attachments` keyed to the current worktree and can be removed independently of canonical worker state.
  Capabilities: portable-runtime-boundary
- req-008: Worker launch descriptors, workspace execution locators, command lines, process ids, and similar clone-local runtime details do not remain inside canonical worker entity attributes.
  Acceptance: Canonical snapshots stay portable across clones because absolute or machine-local launch fields are no longer persisted in entity attributes.; Reading worker, critique, Ralph, docs, and plan records still yields packets/dashboard/launch refs, but their canonical entity payloads no longer store those derived fields.; Worker runtime state survives in `runtime_attachments` keyed to the current worktree and can be removed independently of canonical worker state.
  Capabilities: portable-runtime-boundary
- req-009: Aggregate read APIs reconstruct their nested arrays from canonical artifact entities so there is one canonical representation for the projected subrecords.
  Acceptance: After writing representative research, critique, Ralph, and worker records, corresponding artifact entities exist with stable display ids and links back to their owners.; Mutating or deleting a projected subrecord updates or removes the matching artifact entity without leaving stale projections.; Owning aggregate reads still return the expected nested collections, but the collections are derived from the projected artifact entities rather than duplicated canonical blob state.
  Capabilities: artifact-subrecord-projection
- req-010: Artifact projections are queryable by tags, status, and links enough for adapter use without loading the owning aggregate first.
  Acceptance: After writing representative research, critique, Ralph, and worker records, corresponding artifact entities exist with stable display ids and links back to their owners.; Mutating or deleting a projected subrecord updates or removes the matching artifact entity without leaving stale projections.; Owning aggregate reads still return the expected nested collections, but the collections are derived from the projected artifact entities rather than duplicated canonical blob state.
  Capabilities: artifact-subrecord-projection
- req-011: Projected artifact entities synchronize create/update/remove with their owning aggregate without deleting unrelated artifacts owned by other projection concerns.
  Acceptance: After writing representative research, critique, Ralph, and worker records, corresponding artifact entities exist with stable display ids and links back to their owners.; Mutating or deleting a projected subrecord updates or removes the matching artifact entity without leaving stale projections.; Owning aggregate reads still return the expected nested collections, but the collections are derived from the projected artifact entities rather than duplicated canonical blob state.
  Capabilities: artifact-subrecord-projection
- req-012: Research artifacts, critique findings, Ralph iterations, and worker checkpoints are projected as canonical `artifact` entities with deterministic display ids, typed payloads, and stable owner links.
  Acceptance: After writing representative research, critique, Ralph, and worker records, corresponding artifact entities exist with stable display ids and links back to their owners.; Mutating or deleting a projected subrecord updates or removes the matching artifact entity without leaving stale projections.; Owning aggregate reads still return the expected nested collections, but the collections are derived from the projected artifact entities rather than duplicated canonical blob state.
  Capabilities: artifact-subrecord-projection
- req-013: Durable initiative/plan/ticket context is updated so later work can reason from the accepted final data-plane shape rather than the phase-1 stop point.
  Acceptance: A new maintainer can identify how to build another harness adapter from the repository documentation and tests alone.; Durable memory artifacts reflect that the data-plane completion milestone supersedes the phase-1-only stop point.; Integration tests exercise representative end-to-end flows that populate canonical entities, links, events, runtime attachments, and artifact projections together.
  Capabilities: adapter-contract-surface
- req-014: Tests cover adapter-relevant queries across entities, links, events, runtime attachments, and projected artifacts for representative workflows.
  Acceptance: A new maintainer can identify how to build another harness adapter from the repository documentation and tests alone.; Durable memory artifacts reflect that the data-plane completion milestone supersedes the phase-1-only stop point.; Integration tests exercise representative end-to-end flows that populate canonical entities, links, events, runtime attachments, and artifact projections together.
  Capabilities: adapter-contract-surface
- req-015: Top-level documentation describes the final canonical data-plane contract, including event payload conventions, runtime attachment usage, and artifact subrecord display-id/link conventions.
  Acceptance: A new maintainer can identify how to build another harness adapter from the repository documentation and tests alone.; Durable memory artifacts reflect that the data-plane completion milestone supersedes the phase-1-only stop point.; Integration tests exercise representative end-to-end flows that populate canonical entities, links, events, runtime attachments, and artifact projections together.
  Capabilities: adapter-contract-surface
