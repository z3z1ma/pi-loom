# Pi Loom Data Plane Audit

_Last updated: 2026-03-19_

This file is the current-state map of Pi Loom's SQLite-backed data plane across every package.

Update after the completion cutover:

- canonical links are live across the major package stores
- canonical events are now part of the normal write path instead of a narrow special case
- worker launch/process state is stored in `runtime_attachments`, not canonical worker entities
- research artifacts, critique findings, Ralph iterations, and worker checkpoints are projected as canonical `artifact` entities
- docs, critique, Ralph, and workers rebuild read-model surfaces from smaller canonical snapshots instead of persisting full read-result blobs

Where the older per-package audit sections below conflict with this completion update, this update reflects the current accepted system.

The short version:

- Pi Loom now uses `spaces`, `repositories`, `worktrees`, `entities`, `links`, `events`, and `runtime_attachments` as an active shared substrate rather than a mostly dormant future boundary.
- Entities remain the package-owned typed state snapshots.
- Links now carry canonical graph truth for the implemented cross-package relationships.
- Events now carry canonical lifecycle and mutation truth for the implemented write flows.
- Runtime attachments now isolate clone-local launch and process state from canonical entities.
- A first wave of high-value embedded subrecords now exists as canonical `artifact` entities linked back to their owners.
- Some packages still keep rich aggregate payloads, but the system is no longer just a family of isolated entity blobs.

That means the next-stage opportunity is unusually clear:

1. Keep the rich typed domain payloads.
2. Stop treating `entities.attributes_json` as the only place relationships live.
3. Continue broadening cross-layer relationships and child-record projections where adapters gain real leverage.
4. Keep event payloads and artifact conventions stable enough to become the adapter contract.
5. Keep clone-local/runtime-only details out of canonical entities.
6. Make the data plane the product, and let every harness adapter consume the same entity/link/event/runtime/artifact substrate.

---

## 1. Physical SQLite catalog

Defined in `packages/pi-storage/storage/sqlite.ts`.

### 1.1 Tables

| Table | Purpose | Key columns | Reality today |
|---|---|---|---|
| `spaces` | Top-level workspace / project scope | `id`, `slug`, `title`, `description`, `repository_ids_json`, timestamps | Used by storage substrate only; foundational identity layer |
| `repositories` | Repository identity within a space | `id`, `space_id`, `slug`, `display_name`, `default_branch`, `remote_urls_json`, timestamps | Used by workspace initialization and storage substrate |
| `worktrees` | Worktree identity and lifecycle | `id`, `repository_id`, `branch`, `base_ref`, `logical_key`, `status`, timestamps | Used by workspace initialization; runtime attachments hang off this |
| `entities` | Canonical shared entity catalog | `id`, `kind`, `space_id`, `owning_repository_id`, `display_id`, `title`, `summary`, `status`, `version`, `tags_json`, `attributes_json`, timestamps | Still the main typed state snapshot surface |
| `links` | First-class graph edges between entities | `id`, `kind`, `from_entity_id`, `to_entity_id`, `metadata_json`, timestamps | Active canonical graph for implemented package relationships |
| `events` | Append-only entity history | `id`, `entity_id`, `kind`, `sequence`, `created_at`, `actor`, `payload_json` | Active lifecycle and mutation timeline for the implemented write paths |
| `runtime_attachments` | Clone-local runtime attachment records | `id`, `worktree_id`, `kind`, `locator`, `process_id`, `lease_expires_at`, `metadata_json`, timestamps | Active boundary for worker launch/process state |

### 1.2 Indexes

| Index | Coverage | Note |
|---|---|---|
| `idx_repositories_space` | `repositories(space_id)` | Good |
| `idx_worktrees_repository` | `worktrees(repository_id)` | Good |
| `idx_entities_space_kind` | `entities(space_id, kind)` | Good for package scans |
| `idx_entities_display_id` | `entities(display_id)` | Weak: not composite, not unique |
| `idx_links_from_entity` | `links(from_entity_id)` | Incomplete: no matching `to_entity_id` index |
| `idx_events_entity_sequence` | `events(entity_id, sequence)` | Unique, supports ordered playback and guards duplicate per-entity sequence numbers |
| `idx_runtime_attachments_worktree` | `runtime_attachments(worktree_id)` | Good |

### 1.3 Core storage contract

Defined in `packages/pi-storage/storage/contract.ts`.

#### Entity kinds

- `constitution`
- `research`
- `initiative`
- `spec_change`
- `spec_capability`
- `plan`
- `ticket`
- `worker`
- `critique`
- `ralph_run`
- `documentation`
- `artifact`

#### Link kinds

- `depends_on`
- `blocks`
- `belongs_to`
- `references`
- `implements`
- `documents`
- `critiques`
- `spawned_from`
- `scoped_to_repository`

#### Event kinds

- `created`
- `updated`
- `status_changed`
- `linked`
- `unlinked`
- `imported`
- `exported`
- `decision_recorded`

#### Runtime attachment kinds

- `worker_runtime`
- `manager_runtime`
- `launch_descriptor`
- `local_process`

### 1.4 What the substrate really is

Pi Loom's physical substrate is a hybrid of:

- a small normalized catalog for identity and topology (`spaces`, `repositories`, `worktrees`)
- a generic typed entity catalog (`entities`)
- a dormant graph edge table (`links`)
- a dormant-but-useful event log (`events`)
- a local runtime side-channel (`runtime_attachments`)

The current implementation style is now a hybrid:

- typed entity snapshots in `entities`
- canonical graph truth in `links`
- canonical mutation history in `events`
- clone-local execution details in `runtime_attachments`
- selected child records projected into `artifact` entities

The system still uses rich package-owned snapshots, but it is no longer accurate to describe it as only a document store over `entities.attributes_json`.

### 1.5 Storage-substrate strengths

1. There is already a stable canonical catalog boundary.
2. Every domain has a durable `kind`, `display_id`, `status`, `tags`, and `attributes` envelope.
3. Review surfaces are conceptually derived from canonical state, which is the right boundary.
4. The substrate already has the right primitives for a future Postgres-backed graph: entities, links, events, runtime attachments, and artifact child projections.

### 1.6 Storage-substrate gaps and bug risks

1. **The model is under-indexed for graph work.** `links` only has a `from_entity_id` index; list queries use `from_entity_id = ? OR to_entity_id = ?`.
2. **`display_id` is not protected by a composite uniqueness constraint.** The code relies on discipline and deterministic IDs more than the database does.
3. **Event sequencing is client-side.** `appendEntityEvent()` computes sequence as `existing.length + 1`, which is race-prone under concurrent writers.
4. **Conflict semantics are shallow.** `upsertEntity` trusts caller-supplied `version`; the substrate does not enforce monotonicity itself.
5. **The graph substrate is present but not actually used by most packages.** That is the single biggest strategic mismatch in the system.

---

## 2. Current global pattern

### 2.1 Canonical pattern in one sentence

Most packages do this:

- write one `entities` row per domain object
- put the actual domain model in `attributes_json`
- occasionally append an `events` row
- almost never write a `links` row
- never meaningfully use `runtime_attachments`

### 2.2 What this means architecturally

Pi Loom is currently:

- **strong as a typed document store**
- **moderate as a stateful knowledge store**
- **weak as a queryable graph store**
- **weaker than it should be as an adapter substrate**

### 2.3 Richness rubric used below

- **Very high**: deep structured domain payload, multiple nested record types, meaningful lifecycle semantics
- **High**: clearly structured payload with strong domain detail, but still mostly embedded
- **Medium**: solid top-level schema, but many important relationships or histories are string arrays / prose blobs
- **Low**: thin payload or mostly free-form strings

---

## 3. Package-by-package data model

## 3.1 `pi-constitution`

### Canonical storage

- **Entity kind:** `constitution`
- **Tables used:** `entities`, `events`
- **Links table:** unused
- **Runtime attachments:** unused
- **Canonical envelope:** `attributes = { state }`
- **Tags:** `['constitution']`
- **Status:** always effectively `active`

### Stored fields

#### `ConstitutionalState`

- identity and lifecycle:
  - `projectId`
  - `title`
  - `createdAt`
  - `updatedAt`
- vision:
  - `visionSummary`
  - `visionNarrative`
- principles and constraints:
  - `principles[]` -> `{ id, title, summary, rationale }`
  - `constraints[]` -> `{ id, title, summary, rationale }`
- roadmap:
  - `roadmapItems[]` -> `{ id, title, status, horizon, summary, rationale, initiativeIds[], researchIds[], specChangeIds[], updatedAt }`
  - `roadmapItemIds[]`
- strategic rollups:
  - `strategicDirectionSummary`
  - `currentFocus[]`
  - `openConstitutionQuestions[]`
- derived linkage rollups:
  - `initiativeIds[]`
  - `researchIds[]`
  - `specChangeIds[]`
- derived completeness:
  - `completeness`

#### Event payloads

`decision_recorded` events carry:

- `id`
- `createdAt`
- `kind`
- `question`
- `answer`
- `affectedArtifacts[]`

### How it stores data

- The actual canonical entity stores only `state`.
- `brief`, rendered markdown sections, dashboard, and decisions array are reconstructed on read.
- Decisions are not inside `attributes_json`; they are rebuilt from `events`.

### Richness

- **Richness:** Medium
- **Why:** strong constitutional content and roadmap structure, but weak relationship modeling and somewhat asymmetrical persistence.

### Observations

- Good: roadmap items already carry structured upstream/downstream IDs.
- Good: normalization recomputes completeness and aggregate linked IDs consistently.
- Weak: links are all embedded arrays rather than first-class edges.
- Weak: `initiativeIds[]`, `researchIds[]`, `specChangeIds[]`, and `completeness` are derived but also persisted.
- Weak: decisions are event payloads only, with free-form `affectedArtifacts[]`.

---

## 3.2 `pi-research`

### Canonical storage

- **Entity kind:** `research`
- **Tables used:** `entities`, `events`
- **Links table:** unused
- **Runtime attachments:** unused
- **Canonical envelope:** `attributes = { state, hypotheses, artifacts }`
- **Tags:** `state.tags`
- **Status:** `state.status`

### Stored fields

#### `ResearchState`

- identity and lifecycle:
  - `researchId`
  - `title`
  - `status`
  - `createdAt`
  - `updatedAt`
  - `archivedAt`
  - `synthesizedAt`
- framing:
  - `question`
  - `objective`
  - `scope[]`
  - `nonGoals[]`
  - `methodology[]`
  - `keywords[]`
- synthesis:
  - `statusSummary`
  - `conclusions[]`
  - `recommendations[]`
  - `openQuestions[]`
- cross-layer references:
  - `initiativeIds[]`
  - `specChangeIds[]`
  - `ticketIds[]`
  - `capabilityIds[]`
  - `artifactIds[]`
  - `sourceRefs[]`
  - `supersedes[]`
  - `tags[]`

#### `ResearchHypothesisRecord[]`

- `id`
- `researchId`
- `statement`
- `status`
- `confidence`
- `evidence[]`
- `results[]`
- `createdAt`
- `updatedAt`

#### `ResearchArtifactRecord[]`

- `id`
- `researchId`
- `kind`
- `title`
- `artifactRef`
- `createdAt`
- `summary`
- `sourceUri`
- `tags[]`
- `linkedHypothesisIds[]`

#### Event payloads

`updated` events are used for hypothesis revisions.

### How it stores data

- Stores broad research state plus full hypothesis history plus artifact metadata.
- Rebuilds current hypothesis projection, dashboard, synthesis, and map on read.
- Artifact body content is notably not preserved canonically, even though write input allows `body`.

### Richness

- **Richness:** High
- **Why:** best evidence/discovery model in the repo, but still primarily embedded and not graph-native.

### Observations

- Good: hypotheses keep history, not just latest state.
- Good: artifacts are typed and linked to hypotheses.
- Weak: artifact bodies are dropped.
- Weak: many references are free-form string arrays.
- Weak: only hypothesis updates emit events; broader research lifecycle does not.

---

## 3.3 `pi-initiatives`

### Canonical storage

- **Entity kind:** `initiative`
- **Tables used:** `entities`, `events`
- **Links table:** unused
- **Runtime attachments:** unused
- **Canonical envelope:** `attributes = { state, decisions }`
- **Tags:** `state.tags`
- **Status:** `state.status`

### Stored fields

#### `InitiativeState`

- identity and lifecycle:
  - `initiativeId`
  - `title`
  - `status`
  - `createdAt`
  - `updatedAt`
  - `completedAt`
  - `archivedAt`
- strategic framing:
  - `objective`
  - `outcomes[]`
  - `scope[]`
  - `nonGoals[]`
  - `successMetrics[]`
  - `risks[]`
  - `statusSummary`
  - `targetWindow`
  - `owners[]`
  - `tags[]`
- cross-layer references:
  - `researchIds[]`
  - `specChangeIds[]`
  - `ticketIds[]`
  - `capabilityIds[]`
  - `supersedes[]`
  - `roadmapRefs[]`
- milestones:
  - `milestones[]` -> `{ id, title, status, description, specChangeIds[], ticketIds[] }`

#### `InitiativeDecisionRecord[]`

- `id`
- `initiativeId`
- `createdAt`
- `kind`
- `question`
- `answer`

#### Event payloads

- `decision_recorded`

### How it stores data

- Initiative state and decisions live inside one entity blob.
- Dashboard joins to roadmap/spec/ticket/research data by embedded IDs.
- Cross-package consistency depends on side-effect sync into other packages.

### Richness

- **Richness:** Medium
- **Why:** strategically expressive, but weakly normalized and prone to sync drift.

### Observations

- Good: milestones are structured rather than prose.
- Weak: milestones are not first-class entities.
- Weak: nearly all links are embedded arrays.
- Weak: reads can auto-create a default initiative if missing.
- Bug: `linkTicket` / `unlinkTicket` call ticket membership sync without `await`.
- Weak: `summary.ref` is path-shaped rather than clearly canonical.

---

## 3.4 `pi-specs`

### Canonical storage

- **Entity kinds:** `spec_change`, `spec_capability`
- **Tables used:** `entities`, `events`
- **Links table:** unused
- **Runtime attachments:** unused
- **Canonical envelopes:**
  - `spec_change`: `attributes = { state, decisions, analysis, checklist, linkedTickets }`
  - `spec_capability`: `attributes = { record }`
- **Tags:**
  - `spec_change`: `['spec-change']`
  - `spec_capability`: `['spec-capability']`

### Stored fields

#### `SpecChangeState`

- identity and lifecycle:
  - `changeId`
  - `title`
  - `status`
  - `createdAt`
  - `updatedAt`
  - `finalizedAt`
  - `archivedAt`
  - `archivedRef`
- cross-layer references:
  - `initiativeIds[]`
  - `researchIds[]`
  - `supersedes[]`
- design:
  - `proposalSummary`
  - `designNotes`
- structured change contract:
  - `requirements[]` -> `{ id, text, acceptance[], capabilities[] }`
  - `capabilities[]` -> `{ id, title, summary, requirements[], scenarios[] }`
  - `tasks[]` -> `{ id, title, summary, deps[], requirements[], capabilities[], acceptance[] }`
- artifact timestamps:
  - `artifactVersions.proposal`
  - `artifactVersions.design`
  - `artifactVersions.tasks`
  - `artifactVersions.analysis`
  - `artifactVersions.checklist`

#### `SpecDecisionRecord[]`

- `id`
- `changeId`
- `createdAt`
- `kind`
- `question`
- `answer`

#### Stored sibling fields on `spec_change`

- `analysis` (markdown string)
- `checklist` (markdown string)
- `linkedTickets` -> `{ changeRef, ensuredAt, mode, capabilityIds[], links[] }`

#### `SpecLinkedTicketEntry[]`

- `taskId`
- `ticketId`
- `signature`
- `capabilityIds[]`
- `requirementIds[]`
- `dependencyTaskIds[]`

#### `CanonicalCapabilityRecord` (`spec_capability`)

- `id`
- `title`
- `summary`
- `requirements[]` (flattened to requirement text, not IDs)
- `scenarios[]`
- `sourceChanges[]`
- `updatedAt`
- `ref`

#### Event payloads

- `decision_recorded`

### How it stores data

- Active spec changes are rich structured aggregates.
- Capability entities only become first-class rows when changes are archived.
- Ticket projection state is persisted back into the spec change blob.
- Ticket rows also receive duplicated spec metadata in ticket frontmatter.

### Richness

- **Richness:** Very high
- **Why:** best bounded contract model in the repo, but still largely blob-based and asymmetric between active vs archived capabilities.

### Observations

- Good: requirements, capabilities, and tasks are genuinely structured.
- Good: spec → ticket projection has explicit signatures and dependency metadata.
- Weak: capabilities are globally queryable only after archive.
- Weak: capability archival loses requirement IDs and acceptance structure.
- Weak: no first-class rows for tasks, requirements, or projections.
- Weak: most lifecycle changes do not emit events.
- Weak: ticket projection is duplicated across spec and ticket payloads.
- Risk: `ensureSpecTickets` will overwrite benign manual ticket enrichment because projection matching is strict.

---

## 3.5 `pi-plans`

### Canonical storage

- **Entity kind:** `plan`
- **Tables used:** `entities`
- **Links table:** unused
- **Events table:** unused
- **Runtime attachments:** unused
- **Canonical envelope:** `attributes = { state }`
- **Tags:** `['plan']`
- **Status:** `state.status`

### Stored fields

#### `PlanState`

- identity and lifecycle:
  - `planId`
  - `title`
  - `status`
  - `createdAt`
  - `updatedAt`
  - `summary`
- long-form execution narrative:
  - `purpose`
  - `contextAndOrientation`
  - `milestones`
  - `planOfWork`
  - `concreteSteps`
  - `validation`
  - `idempotenceAndRecovery`
  - `artifactsAndNotes`
  - `interfacesAndDependencies`
  - `risksAndQuestions`
  - `outcomesAndRetrospective`
- scope and provenance:
  - `scopePaths[]`
  - `sourceTarget { kind, ref }`
  - `contextRefs { roadmapItemIds[], initiativeIds[], researchIds[], specChangeIds[], ticketIds[], critiqueIds[], docIds[] }`
- linked work:
  - `linkedTickets[]` -> `{ ticketId, role, order }`
- structured logs:
  - `progress[]` -> `{ timestamp, status, text }`
  - `discoveries[]` -> `{ note, evidence }`
  - `decisions[]` -> `{ decision, rationale, date, author }`
  - `revisionNotes[]` -> `{ timestamp, change, reason }`
- derived:
  - `packetSummary`

### How it stores data

- Stores only typed plan state.
- Rebuilds packet, rendered `plan.md`, summary, and dashboard on read.
- This is one of the cleaner boundaries in the repo.

### Richness

- **Richness:** High
- **Why:** typed execution strategy, but too much of the meaning still lives in long prose sections.

### Observations

- Good: durable structure for progress, discoveries, decisions, and revision notes.
- Good: derived markdown is not canonical state.
- Weak: `linkedTickets` are embedded only; no canonical edges.
- Weak: tags are too thin to support discovery.
- Weak: `contextRefs` merge but do not support true replace/remove semantics.
- Bug: unlinking a ticket from a plan does not remove the `plan:<id>` external ref from the ticket.

---

## 3.6 `pi-ticketing`

### Canonical storage

- **Entity kind:** `ticket`
- **Tables used:** `entities`
- **Links table:** unused
- **Events table:** unused
- **Runtime attachments:** unused
- **Canonical envelope:** `attributes = { record }`, where `record` is the full `TicketReadResult`
- **Tags:** `ticket.frontmatter.tags`
- **Status:** computed from stored ticket state

### Stored fields

#### `TicketFrontmatter`

- identity and core fields:
  - `id`
  - `title`
  - `status`
  - `priority`
  - `type`
  - `created-at`
  - `updated-at`
- linkage and classification:
  - `tags[]`
  - `deps[]`
  - `links[]`
  - `initiative-ids[]`
  - `research-ids[]`
  - `spec-change`
  - `spec-capabilities[]`
  - `spec-requirements[]`
  - `parent`
  - `assignee`
  - `labels[]`
  - `external-refs[]`
- acceptance / review:
  - `acceptance[]`
  - `risk`
  - `review-status`

#### `TicketBody`

- `summary`
- `context`
- `plan`
- `notes`
- `verification`
- `journalSummary`

#### `TicketRecord`

- `frontmatter`
- `body`
- `closed`
- `archived`
- `archivedAt`
- `ref`

#### Embedded operational arrays in canonical payload

- `journal[]` -> `{ id, ticketId, createdAt, kind, text, metadata }`
- `attachments[]` -> `{ id, ticketId, createdAt, label, mediaType, artifactRef, sourceRef, description, metadata }`
- `checkpoints[]` -> `{ id, ticketId, title, createdAt, body, checkpointRef, supersedes }`
- derived read-time relation arrays:
  - `children[]`
  - `blockers[]`

### How it stores data

- Stores the entire ticket read model as one blob.
- Keeps the markdown-era conceptual model: frontmatter plus body sections.
- Rebuilds summary and graph views by scanning embedded fields.
- Attachments can inline base64 content directly into `attributes_json` metadata.

### Richness

- **Richness:** Very high locally, low relationally
- **Why:** ticket payload is extremely expressive, but almost nothing is first-class in the shared graph.

### Observations

- Good: richest execution-unit payload in the repo.
- Weak: dependencies, parentage, and arbitrary links are embedded strings, not canonical edges.
- Weak: journal timeline is not backed by canonical events.
- Weak: attachment content can bloat entity blobs.
- Weak: important selectors like priority, type, review status, and archived state are not promoted beyond the blob.
- Weak: deleting a ticket repairs `deps` and `parent`, but not descriptive `links[]` or `external-refs[]` everywhere.

---

## 3.7 `pi-workers`

### Canonical storage

- **Entity kind:** `worker`
- **Tables used:** `entities`
- **Links table:** unused
- **Events table:** unused
- **Runtime attachments:** unused by the package store, despite the concept existing in substrate
- **Canonical envelope:** `attributes = { worker }`, where `worker` is the full `WorkerReadResult`
- **Tags:** `[telemetryState, ...ticketIds]`
- **Status:** `state.status`

### Stored fields

#### `WorkerState`

- identity and lifecycle:
  - `workerId`
  - `title`
  - `objective`
  - `summary`
  - `status`
  - `createdAt`
  - `updatedAt`
- coordination:
  - `managerRef { kind, ref, label }`
  - `linkedRefs { initiativeIds[], researchIds[], specChangeIds[], ticketIds[], critiqueIds[], docIds[], planIds[], ralphRunIds[] }`
- workspace descriptor:
  - `workspace { repositoryRoot, strategy, baseRef, branch, labels[], workspaceKey }`
- telemetry / execution rollups:
  - `latestTelemetry { state, summary, heartbeatAt, checkpointId, pendingMessages, notes[] }`
  - `latestCheckpointId`
  - `latestCheckpointSummary`
  - `lastMessageAt`
  - `lastLaunchAt`
  - `lastSchedulerAt`
  - `lastSchedulerSummary`
  - `launchCount`
  - `lastRuntimeKind`
  - `interventionCount`
  - `packetSummary`
- review pipeline:
  - `completionRequest { requestedAt, scopeComplete[], validationEvidence[], remainingRisks[], branchState, summary, requestedBy }`
  - `approval { status, decidedAt, decidedBy, summary, rationale[] }`
  - `consolidation { status, strategy, summary, validation[], conflicts[], followUps[], decidedAt }`

#### `WorkerMessageRecord[]`

- `id`
- `workerId`
- `createdAt`
- `direction`
- `awaiting`
- `kind`
- `status`
- `from`
- `text`
- `relatedRefs[]`
- `replyTo`
- `acknowledgedAt`
- `acknowledgedBy`
- `resolvedAt`
- `resolvedBy`

#### `WorkerCheckpointRecord[]`

- `id`
- `workerId`
- `createdAt`
- `summary`
- `understanding`
- `recentChanges[]`
- `validation[]`
- `blockers[]`
- `nextAction`
- `acknowledgedMessageIds[]`
- `resolvedMessageIds[]`
- `remainingInboxCount`
- `managerInputRequired`

#### `WorkerRuntimeDescriptor`

- `workerId`
- `createdAt`
- `updatedAt`
- `runtime`
- `resume`
- `workspaceDir`
- `branch`
- `baseRef`
- `launchPrompt`
- `command[]`
- `pid`
- `status`
- `note`

### How it stores data

- Stores the full worker read model as one blob.
- Rebuilds markdown, packet, dashboard, and artifact refs on read.
- Persists launch/runtime descriptor canonically, including clone-local execution details.

### Richness

- **Richness:** Very high
- **Why:** semantically rich workflow state, but too much of it is canonicalized as one opaque blob.

### Observations

- Good: worker state is one of the richest coordination models in the repo.
- Weak: messages, checkpoints, and launch descriptors are not first-class rows.
- Weak: non-ticket relationships are mostly invisible to indexing.
- Weak: clone-local fields like `launch.workspaceDir`, `command[]`, and `pid` leak into canonical state.
- Bug: async mutators call sync mutators that already persist, then persist again via `upsertCanonicalWorker()`, causing duplicate writes and version inflation.
- Weak: ticket reverse-link and journal sync are best-effort side effects, often swallowed on failure.

---

## 3.8 `pi-critique`

### Canonical storage

- **Entity kind:** `critique`
- **Tables used:** `entities`
- **Links table:** unused
- **Events table:** unused
- **Runtime attachments:** unused
- **Canonical envelope:** `attributes = { record }`, where `record` is the full `CritiqueReadResult`
- **Tags:** `focusAreas`
- **Status:** `state.status`

### Stored fields

#### `CritiqueState`

- identity and lifecycle:
  - `critiqueId`
  - `title`
  - `status`
  - `createdAt`
  - `updatedAt`
- target and framing:
  - `target { kind, ref, locator }`
  - `focusAreas[]`
  - `reviewQuestion`
  - `scopeRefs[]`
  - `nonGoals[]`
  - `contextRefs { roadmapItemIds[], initiativeIds[], researchIds[], specChangeIds[], ticketIds[] }`
- rollups:
  - `packetSummary`
  - `currentVerdict`
  - `openFindingIds[]`
  - `followupTicketIds[]`
  - `freshContextRequired`
  - `lastRunId`
  - `lastLaunchAt`
  - `launchCount`

#### `CritiqueRunRecord[]`

- `id`
- `critiqueId`
- `createdAt`
- `kind`
- `summary`
- `verdict`
- `freshContext`
- `focusAreas[]`
- `findingIds[]`
- `followupTicketIds[]`

#### `CritiqueFindingRecord[]`

- `id`
- `critiqueId`
- `runId`
- `createdAt`
- `updatedAt`
- `kind`
- `severity`
- `confidence`
- `title`
- `summary`
- `evidence[]`
- `scopeRefs[]`
- `recommendedAction`
- `status`
- `linkedTicketId`
- `resolutionNotes`

#### `CritiqueLaunchDescriptor`

- `critiqueId`
- `createdAt`
- `packetRef`
- `target`
- `focusAreas[]`
- `reviewQuestion`
- `freshContextRequired`
- `runtime`
- `instructions[]`

### How it stores data

- Stores the full critique aggregate as one blob.
- Packets and critique markdown are stored as opaque rendered strings.
- Context joins are resolved by looking up other entities by embedded refs.

### Richness

- **Richness:** High
- **Why:** detailed durable review content, but weak structural graph semantics.

### Observations

- Good: findings are strongly structured and durable.
- Good: critique target and focus area modeling are solid.
- Weak: follow-up ticket linkage is duplicated at finding-level and state-level.
- Weak: no canonical links or events.
- Weak: launch descriptor stores adapter-local instructions rather than pure durable facts.

---

## 3.9 `pi-ralph`

### Canonical storage

- **Entity kind:** `ralph_run`
- **Tables used:** `entities`
- **Links table:** unused
- **Events table:** unused
- **Runtime attachments:** unused
- **Canonical envelope:** `attributes = { record }`, where `record` is the full `RalphReadResult`
- **Tags:** `[phase, ...planIds]`
- **Status:** `state.status`

### Stored fields

#### `RalphRunState`

- identity and lifecycle:
  - `runId`
  - `title`
  - `status`
  - `phase`
  - `waitingFor`
  - `createdAt`
  - `updatedAt`
- framing:
  - `objective`
  - `summary`
  - `packetSummary`
- cross-layer refs:
  - `linkedRefs { roadmapItemIds[], initiativeIds[], researchIds[], specChangeIds[], ticketIds[], critiqueIds[], docIds[], planIds[] }`
- policy:
  - `policySnapshot { mode, maxIterations, maxRuntimeMinutes, tokenBudget, verifierRequired, critiqueRequired, stopWhenVerified, manualApprovalRequired, allowOperatorPause, notes[] }`
- top-level review/orchestration state:
  - `verifierSummary`
  - `critiqueLinks[]`
  - `latestDecision`
- iteration bookkeeping:
  - `lastIterationNumber`
  - `currentIterationId`
  - `lastLaunchAt`
  - `launchCount`
  - `stopReason`

#### `RalphIterationRecord[]`

- `id`
- `runId`
- `iteration`
- `status`
- `startedAt`
- `completedAt`
- `focus`
- `summary`
- `workerSummary`
- `verifier`
- `critiqueLinks[]`
- `decision`
- `notes[]`

#### `RalphVerifierSummary`

- `sourceKind`
- `sourceRef`
- `verdict`
- `summary`
- `required`
- `blocker`
- `checkedAt`
- `evidence[]`

#### `RalphCritiqueLink[]`

- `critiqueId`
- `kind`
- `verdict`
- `required`
- `blocking`
- `reviewedAt`
- `findingIds[]`
- `summary`

#### `RalphContinuationDecision`

- `kind`
- `reason`
- `summary`
- `decidedAt`
- `decidedBy`
- `blockingRefs[]`

#### `RalphLaunchDescriptor`

- `runId`
- `iterationId`
- `iteration`
- `createdAt`
- `runtime`
- `packetRef`
- `launchRef`
- `resume`
- `instructions[]`

### How it stores data

- Stores the full run aggregate as one blob.
- Packets and run markdown are stored as opaque rendered strings.
- Iterations are embedded history records rather than first-class rows.

### Richness

- **Richness:** High
- **Why:** excellent orchestration bookkeeping, but not yet a clean reusable adapter contract.

### Observations

- Good: strong policy, verifier, critique, and decision structure.
- Weak: critique relationships are duplicated in multiple places (`linkedRefs`, top-level `critiqueLinks`, per-iteration `critiqueLinks`).
- Weak: verifier state is duplicated at run and iteration levels.
- Weak: launch descriptor stores adapter-local instructions and runtime mode in canonical state.
- Weak: no links/events despite being an orchestration layer.

---

## 3.10 `pi-docs`

### Canonical storage

- **Entity kind:** `documentation`
- **Tables used:** `entities`
- **Links table:** unused
- **Events table:** unused
- **Runtime attachments:** unused
- **Canonical envelope:** `attributes = { record }`, where `record` is the full `DocumentationReadResult`
- **Tags:** `[docType, ...guideTopics]`
- **Status:** `state.status`

### Stored fields

#### `DocumentationState`

- identity and lifecycle:
  - `docId`
  - `title`
  - `status`
  - `docType`
  - `sectionGroup`
  - `createdAt`
  - `updatedAt`
  - `summary`
- audience and scope:
  - `audience[]`
  - `scopePaths[]`
  - `contextRefs { roadmapItemIds[], initiativeIds[], researchIds[], specChangeIds[], ticketIds[], critiqueIds[] }`
- provenance:
  - `sourceTarget { kind, ref }`
  - `updateReason`
- navigation/output:
  - `guideTopics[]`
  - `linkedOutputPaths[]`
  - `lastRevisionId`

#### `DocumentationRevisionRecord[]`

- `id`
- `docId`
- `createdAt`
- `reason`
- `summary`
- `sourceTarget`
- `packetHash`
- `changedSections[]`
- `linkedContextRefs`

### How it stores data

- Stores full documentation read result, including packet, document body, revisions, dashboard.
- Rebuilds a canonical read result again from state + revisions on read.
- Main content body is still one opaque markdown string.

### Richness

- **Richness:** Medium-High
- **Why:** good metadata model around a still mostly markdown-centric body.

### Observations

- Good: revisions are modeled explicitly.
- Weak: revisions are not created for metadata-only changes.
- Weak: `changedSections[]` is based on current headings, not structural diff.
- Weak: source targets cannot directly be `research` or another doc.
- Weak: all provenance remains embedded rather than linked canonically.

---

## 4. Cross-cutting reality: how rich is the system today?

## 4.1 Richest packages by domain expressiveness

1. `pi-specs`
2. `pi-ticketing`
3. `pi-workers`
4. `pi-research`
5. `pi-critique`
6. `pi-ralph`
7. `pi-plans`
8. `pi-docs`
9. `pi-initiatives`
10. `pi-constitution`

That ranking is about domain richness, not architectural cleanliness.

## 4.2 Best packages by adapter-friendliness

1. `pi-plans` — stores typed state and derives markdown
2. `pi-specs` — strongly typed core contract
3. `pi-research` — strong typed evidence model
4. `pi-constitution` — simple, legible singleton state
5. `pi-docs` — structured envelope around markdown
6. `pi-initiatives` — decent structure but sync-heavy
7. `pi-critique` — good detail, but fully blobbed aggregate
8. `pi-ralph` — rich but duplicated and adapter-local in places
9. `pi-workers` — richest workflow model, worst portability leakage
10. `pi-ticketing` — extremely useful locally, least normalized for adapters

## 4.3 The deep structural truth

Today Pi Loom has:

- a **strong entity plane**
- a **weak edge plane**
- a **weak event plane**
- a **leaky runtime plane**

Said differently:

- the theory of the system wants a shared knowledge-and-work graph
- the implementation is currently a family of typed document blobs
- the substrate already contains the right primitives to close the gap

That is why this is the final frontier.

---

## 5. Bugs, correctness risks, and integrity issues visible now

## 5.1 Immediate correctness bugs

1. **Worker async APIs double-persist**
   - Sync worker mutators already call `persist()`.
   - Async wrappers then call `upsertCanonicalWorker(...)` again.
   - Result: duplicate writes, version inflation, extra race surface.

2. **Initiative ticket membership sync is not awaited**
   - `linkTicket()` / `unlinkTicket()` fire ticket back-sync without `await`.
   - Initiative state can commit even if reciprocal ticket linkage fails.

3. **Plan unlink leaves stale ticket external refs**
   - Linking a plan to a ticket adds `plan:<id>` to ticket `external-refs`.
   - Unlinking does not remove it.
   - Ticket payload can lie about plan membership.

4. **Event sequencing is race-prone**
   - Event sequence is computed as `existing.length + 1` in process code.
   - Under concurrency, collision or sequence duplication is possible.

## 5.2 Data integrity risks

1. **Embedded relationship arrays are the real graph**
   - If reciprocal sync misses once, graph truth diverges.

2. **Derived fields are persisted as if canonical**
   - examples: constitution completeness, constitution aggregate linked IDs, research `artifactIds`, critique/open finding rollups, worker packets/dashboard, docs packets/dashboard.

3. **Rendered artifacts are stored alongside source state**
   - That widens schema churn and stale-data surface.

4. **Clone-local runtime state leaks into canonical entities**
   - especially workers, and to a lesser extent critique/Ralph launch descriptors.

5. **Attachments are stored inline in ticket metadata**
   - row bloat, poor portability, no real artifact substrate yet.

## 5.3 Modeling issues that will hurt adapters and Postgres later

1. Cross-entity links are not first-class.
2. Timelines are not first-class.
3. Many child records are embedded arrays instead of child entities or append-only event streams.
4. Tags are inconsistent and not used as a principled query surface.
5. Ref formats are inconsistent across packages.

---

## 6. The one-shot improvement direction

This is the direction I would drive hard.

## 6.1 Principle 1: `entities` stays, but becomes the root envelope only

Keep `entities` as the top-level catalog of domain objects.

Each entity row should continue to answer:

- what kind of thing is this?
- what is its stable ID?
- what is its status?
- what is its owning repository / space?
- what are its query tags?
- what is the canonical payload root?

But `attributes_json` should stop being the dumping ground for:

- rendered markdown
- dashboards
- packets
- clone-local runtime details
- redundant rollups that are cheaply derivable

## 6.2 Principle 2: the `links` table becomes the real cross-layer graph

Every cross-layer relationship that matters should emit a canonical link row.

Examples:

- constitution roadmap item -> initiative / research / spec change
- initiative -> roadmap item / research / spec change / ticket / capability
- research -> initiative / spec change / ticket / artifact / hypothesis
- spec change -> capability / requirement / task / ticket / initiative / research
- plan -> source target / linked tickets / referenced critique / referenced docs
- ticket -> dependency / parent / initiative / research / spec change / capability / plan / worker / critique / docs
- worker -> ticket / plan / research / spec / critique / Ralph run / manager target
- critique -> target / ticket follow-up / context refs / finding refs
- Ralph run -> plan / critique / verifier source / ticket / doc / spec
- docs -> source target / referenced artifacts / outputs

The link kinds in `pi-storage` are not yet enough for everything, but they are already 80% of the way there. Expand them deliberately and make them canonical.

## 6.3 Principle 3: the `events` table becomes the timeline of truth

Use events for lifecycle changes, not just a few isolated domains.

At minimum:

- create / update / status change
- link / unlink
- decision recorded
- projection ensured
- launch prepared / started / finished
- approval decided
- consolidation decided
- critique run recorded
- finding added / accepted / ticketified
- Ralph iteration started / reviewed / decided

The event stream should be what lets another harness adapter tail the system in real time.

## 6.4 Principle 4: runtime-local state must leave canonical entities

Canonical state should not contain:

- absolute workspace paths
- command arrays for one local adapter
- PIDs
- clone-local launch prompts
- descriptor-only runtime instructions

Those belong in:

- `runtime_attachments`
- or a clearly local runtime store
- or ephemeral adapter state

Canonical entities should describe portable intent and durable outcomes.

## 6.5 Principle 5: child records need selective normalization

Not every nested array should become a top-level table immediately.

But some absolutely should.

Highest-value candidates:

1. ticket dependencies / parentage / links
2. worker messages
3. worker checkpoints
4. critique findings
5. Ralph iterations
6. spec task-to-ticket projections
7. research artifacts

Those are the structures most likely to matter to adapters, analytics, fleet coordination, and cross-machine replay.

## 6.6 Principle 6: ref semantics must become uniform

Every cross-package reference should converge on stable canonical refs.

Avoid:

- path-shaped refs where canonical IDs exist
- ad hoc `plan:<id>` strings only on one side
- mixing archived refs with display IDs with relative paths

The graph must be traversable without package-specific folklore.

---

## 7. Phased plan status

The original phased plan below has now been executed for the current internal-only cutover.

- Phase 0 — completed
- Phase 1 — completed
- Phase 2 — completed for the implemented package write paths and shared projection helpers
- Phase 3 — completed for workers, critique, Ralph, docs, and the selected aggregate snapshots that previously stored full read-result blobs
- Phase 4 — completed for research artifacts, critique findings, Ralph iterations, and worker checkpoints
- Phase 5 — completed through the stabilized storage contract, projected artifact conventions, verification suite, and this repository-level contract documentation

What remains after this milestone is not another pending phase of the same plan; it is future broadening work over the now-coherent contract.

## 7.1 Original phase framing

## Phase 0 — Correctness hardening

Fix now:

1. worker double-persist bug
2. initiative unawaited ticket sync
3. plan unlink stale external-ref cleanup
4. event sequencing race
5. any package storing absolute runtime paths in canonical payloads

## Phase 1 — Canonical link projection

For every package:

1. keep existing payloads temporarily as source of truth
2. project all meaningful relationships into `links`
3. add reconciliation checks so payload arrays and links cannot drift silently
4. expose graph queries over `links`

This is the fastest way to unlock cross-package intelligence without rewriting every domain first.

## Phase 2 — Canonical event projection

For every package:

1. emit lifecycle events
2. emit link/unlink events
3. emit decision/review/orchestration events
4. define event payload schemas by domain

This is what turns Pi Loom from durable storage into a live multi-agent coordination substrate.

## Phase 3 — Strip derived and local data from canonical blobs

Remove from canonical entities:

- dashboards
- packets
- rendered markdown when a typed source model already exists
- clone-local launch details
- redundant rollups

Regenerate them on read, or materialize them into explicit export surfaces when needed.

## Phase 4 — Normalize the highest-value subrecords

Promote to first-class canonical records or child entities:

- worker messages/checkpoints
- critique findings
- Ralph iterations
- research artifacts
- ticket attachments/checkpoints/journal entries where warranted
- spec tasks / task-ticket projection rows

## Phase 5 — Make adapters first-class citizens

Design the adapter contract around:

- entities
- links
- events
- portable runtime attachments

Then any harness can:

- read the graph
- tail the event stream
- post critique runs
- attach research
- update plans
- drive worker fleets

And once the canonical plane moves from SQLite to Postgres, the whole system becomes a real shared coordination fabric.

---

## 8. Concrete package enrichment targets

## Constitution

- make roadmap-item links first-class
- make decisions first-class or event-schemad, not just opaque payloads
- stop persisting purely derived completeness/link rollups

## Research

- store artifact body content canonically or as canonical artifact entities
- project research relationships into links
- emit events for research updates and artifact creation

## Initiatives

- await all reciprocal sync
- replace path-shaped refs with canonical refs
- project milestone/spec/ticket/roadmap relationships into links
- consider first-class milestone rows

## Specs

- make tasks / requirements / capability relationships queryable
- represent spec->ticket projection as canonical edges plus projection state
- make active capabilities globally queryable without waiting for archive
- stop lossy capability archival

## Plans

- make linked tickets and source target canonical edges
- strengthen context refs replace/remove semantics
- enrich tags or stop pretending tags are a discovery surface
- keep plan markdown fully derived

## Tickets

- move deps/parent/links into canonical edges
- move audit timeline into canonical events
- stop storing large inline attachments in entity metadata
- distinguish canonical ticket truth from markdown-legacy formatting concerns

## Workers

- split portable worker state from local launch state
- project worker relationships into links, not only ticket side effects
- normalize messages/checkpoints or event them
- stop storing full read model canonically

## Critique

- make critique target/context/follow-up relations canonical links
- make findings first-class enough for graph and analytics work
- keep launch descriptors portable and minimal

## Ralph

- make iterations first-class
- normalize verifier and critique link records
- move launch instructions out of canonical payload
- make run/iteration/review decisions visible as events

## Docs

- broaden source-target semantics
- record metadata-only revisions too
- link docs canonically to their sources and outputs
- keep markdown body but add more structured section metadata if adapters need it

---

## 9. The biggest surprise

The biggest surprise is that Pi Loom is much closer to the real thing than it appears.

The storage substrate already contains the exact primitives needed for the endgame:

- shared entity catalog
- graph edges
- event stream
- runtime attachment boundary

The packages above it are already rich enough to make the system interesting.

What is missing is not imagination.
It is not even domain modeling depth.

What is missing is the cutover from:

- package-local blob truth

to:

- shared graph truth
- shared timeline truth
- portable runtime truth

Once that happens, the theory snaps into place.

Then the data plane is not just where state is stored.
It becomes the medium through which all harnesses collaborate:

- research pooled across agents
- critiques accumulated across runs
- plans driving ticket graphs
- specs projecting execution contracts
- workers reporting progress into a shared substrate
- Ralph coordinating bounded execution over the same graph
- docs updating the accepted understanding afterward

SQLite gets us the model.
Postgres gets us scale.
Adapters get us the swarm.

---

## 10. Bottom line

Pi Loom's current data model is strong enough to support the next leap, but only if we are honest about what it is today.

Today it is mostly a family of rich typed documents stored in one generic entity table.

Tomorrow it should be:

- a canonical entity graph
- with durable event timelines
- with portable runtime boundaries
- and domain payloads rich enough that every harness adapter can participate without bespoke package folklore

That is the path to the real system.

---

## 11. Adapter-facing contract after completion

For adapter authors, the accepted contract is now:

### 11.1 Entities

- Each package still owns a canonical typed snapshot in `entities`.
- Snapshots should contain portable domain truth, not clone-local execution details or redundant read-model projections.
- Selected child records now appear as `artifact` entities with deterministic `display_id` values, subtype tags, owner metadata, and owner links.

### 11.2 Links

- Cross-package relationships are queryable through `links`.
- Artifact child entities link back to their owning aggregate through `belongs_to` plus any extra package-specific references.
- `metadata_json.projectionOwner` identifies which projection concern owns a managed edge.

### 11.3 Events

- Entity create/update/status transitions emit canonical lifecycle events.
- Link projection emits `linked` / `unlinked` events.
- Package mutation boundaries emit structured `updated` or `decision_recorded` payloads with a stable `change` discriminator.
- Per-entity event `sequence` is unique and ordered.

### 11.4 Runtime attachments

- Clone-local worker launch/process state lives in `runtime_attachments`, not canonical entities.
- Runtime attachments are keyed by worktree and locator and may be deleted independently of canonical domain state.

### 11.5 First-wave canonical child artifacts

Implemented child artifact families:

- research artifacts
- critique findings
- Ralph iterations
- worker checkpoints

These are now first-class canonical records rather than only nested aggregate arrays.

### 11.6 Practical adapter model

Another harness can now:

- list entities by kind
- traverse graph relationships through links
- tail package lifecycle and mutation events
- inspect current clone-local worker runtime attachments when local execution matters
- query high-value child records directly through artifact entities

That is the current accepted adapter substrate.
