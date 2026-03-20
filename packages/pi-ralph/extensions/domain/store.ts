import { resolve } from "node:path";
import {
  hasProjectedArtifactAttributes,
  type ProjectedArtifactEntityAttributes,
  projectedArtifactAttributes,
} from "@pi-loom/pi-storage/storage/artifacts.js";
import { createEntityId, createEventId, createLinkId } from "@pi-loom/pi-storage/storage/ids.js";
import type { ProjectedEntityLinkInput } from "@pi-loom/pi-storage/storage/links.js";
import { syncProjectedEntityLinks } from "@pi-loom/pi-storage/storage/links.js";
import { filterAndSortListEntries } from "@pi-loom/pi-storage/storage/list-search.js";
import { getLoomCatalogPaths } from "@pi-loom/pi-storage/storage/locations.js";
import { resolveWorkspaceIdentity } from "@pi-loom/pi-storage/storage/repository.js";
import { openWorkspaceStorageSync } from "@pi-loom/pi-storage/storage/workspace.js";
import { buildRalphDashboard, summarizeRalphRun } from "./dashboard.js";
import { renderBulletList, renderSection } from "./frontmatter.js";
import type {
  AppendRalphIterationInput,
  CreateRalphRunInput,
  DecideRalphRunInput,
  LinkRalphCritiqueInput,
  PrepareRalphLaunchInput,
  RalphContinuationDecision,
  RalphCritiqueLink,
  RalphCritiqueLinkKind,
  RalphCritiqueVerdict,
  RalphIterationRecord,
  RalphIterationStatus,
  RalphLaunchDescriptor,
  RalphLinkedRefs,
  RalphListFilter,
  RalphPolicyMode,
  RalphPolicySnapshot,
  RalphNextLaunchState,
  RalphReadResult,
  RalphRunPhase,
  RalphRunState,
  RalphRunStatus,
  RalphVerifierSourceKind,
  RalphVerifierSummary,
  RalphVerifierVerdict,
  RalphWaitingFor,
  UpdateRalphRunInput,
} from "./models.js";
import {
  RALPH_CRITIQUE_LINK_KINDS,
  RALPH_CRITIQUE_VERDICTS,
  RALPH_DECISION_KINDS,
  RALPH_DECISION_REASONS,
  RALPH_ITERATION_STATUSES,
  RALPH_POLICY_MODES,
  RALPH_RUN_PHASES,
  RALPH_RUN_STATUSES,
  RALPH_VERIFIER_SOURCE_KINDS,
  RALPH_VERIFIER_VERDICTS,
  RALPH_WAITING_FOR,
} from "./models.js";
import {
  currentTimestamp,
  latestById,
  nextSequenceId,
  normalizeOptionalString,
  normalizeStringList,
  summarizeText,
} from "./normalize.js";
import {
  getRalphArtifactPaths,
  getRalphRunDir,
  normalizeRalphRunId,
  normalizeRalphRunRef,
  slugifyRalphValue,
} from "./paths.js";
import { renderRalphMarkdown } from "./render.js";

const ENTITY_KIND = "ralph_run" as const;
const RALPH_LINK_PROJECTION_OWNER = "ralph-store";
const RALPH_EVENT_ACTOR = "ralph-store";
const RALPH_ITERATION_PROJECTION_OWNER = "ralph-iterations";
const RALPH_ITERATION_ARTIFACT_TYPE = "ralph-iteration";

interface RalphEntityAttributes {
  state: RalphRunState;
}

function hasStructuredRalphAttributes(attributes: unknown): attributes is RalphEntityAttributes {
  return Boolean(attributes && typeof attributes === "object" && "state" in attributes);
}

interface RalphIterationArtifactPayload extends Record<string, unknown> {
  iteration: RalphIterationRecord;
}

function isRalphIterationArtifactAttributes(
  attributes: Record<string, unknown>,
): attributes is ProjectedArtifactEntityAttributes<RalphIterationArtifactPayload> {
  return (
    hasProjectedArtifactAttributes(attributes) &&
    attributes.projectionOwner === RALPH_ITERATION_PROJECTION_OWNER &&
    attributes.artifactType === RALPH_ITERATION_ARTIFACT_TYPE
  );
}

interface StoredRalphEntityRow {
  id: string;
  display_id: string | null;
  version: number;
  created_at: string;
  attributes_json: string;
}

function openRalphCatalogSync(cwd: string) {
  return openWorkspaceStorageSync(cwd);
}

function parseStoredJson<T>(value: string, fallback: T): T {
  if (!value.trim()) {
    return fallback;
  }
  return JSON.parse(value) as T;
}

function toRalphRunRef(runId: string): string {
  return `ralph-run:${runId}`;
}

function toRalphPacketRef(runId: string): string {
  return `ralph-run:${runId}:packet`;
}

function toRalphLaunchRef(runId: string): string {
  return `ralph-run:${runId}:launch`;
}

function findStoredRalphRow(cwd: string, runId: string): StoredRalphEntityRow | null {
  const { storage, identity } = openRalphCatalogSync(cwd);
  return (storage.db
    .prepare(
      "SELECT id, display_id, version, created_at, attributes_json FROM entities WHERE space_id = ? AND kind = ? AND display_id = ? LIMIT 1",
    )
    .get(identity.space.id, ENTITY_KIND, runId) ?? null) as StoredRalphEntityRow | null;
}

function listStoredRalphStates(cwd: string): RalphRunState[] {
  const { storage, identity } = openRalphCatalogSync(cwd);
  const rows = storage.db
    .prepare("SELECT attributes_json FROM entities WHERE space_id = ? AND kind = ? ORDER BY display_id")
    .all(identity.space.id, ENTITY_KIND) as Array<{ attributes_json: string }>;
  return rows.map((row) => {
    const attributes = parseStoredJson<RalphEntityAttributes | Record<string, unknown>>(row.attributes_json, {});
    if (!hasStructuredRalphAttributes(attributes)) {
      throw new Error("Ralph run entity is missing structured attributes");
    }
    return normalizeStoredRunState(attributes.state);
  });
}

function ralphSearchText(record: RalphReadResult): string[] {
  return [
    record.summary.id,
    record.summary.title,
    record.state.objective,
    record.state.summary,
    record.summary.objectiveSummary,
    record.summary.policyMode,
    record.state.waitingFor,
    record.dashboard.waitingFor,
    record.state.latestDecision?.summary ?? "",
    record.dashboard.latestDecision?.summary ?? "",
    record.dashboard.latestIteration?.summary ?? "",
    record.state.verifierSummary.summary,
    record.state.verifierSummary.sourceRef,
    ...record.state.policySnapshot.notes,
    ...(record.state.latestDecision?.blockingRefs ?? []),
    ...record.state.linkedRefs.roadmapItemIds,
    ...record.state.linkedRefs.initiativeIds,
    ...record.state.linkedRefs.researchIds,
    ...record.state.linkedRefs.specChangeIds,
    ...record.state.linkedRefs.ticketIds,
    ...record.state.linkedRefs.critiqueIds,
    ...record.state.linkedRefs.docIds,
    ...record.state.linkedRefs.planIds,
  ];
}

function filterAndSortRalphSummaries(records: RalphReadResult[], filter: RalphListFilter = {}) {
  const filtered = records.filter((record) => {
    const summary = record.summary;
    if (filter.status && summary.status !== filter.status) {
      return false;
    }
    if (filter.phase && summary.phase !== filter.phase) {
      return false;
    }
    if (filter.decision && summary.decision !== filter.decision) {
      return false;
    }
    if (filter.waitingFor && summary.waitingFor !== filter.waitingFor) {
      return false;
    }
    return true;
  });

  return filterAndSortListEntries(
    filtered.map((record) => ({
      item: record.summary,
      id: record.summary.id,
      createdAt: record.state.createdAt,
      updatedAt: record.summary.updatedAt,
      fields: [
        { value: record.summary.id, weight: 12 },
        { value: record.summary.title, weight: 10 },
        { value: record.summary.objectiveSummary, weight: 9 },
        { value: record.summary.policyMode, weight: 7 },
        { value: record.state.waitingFor, weight: 6 },
        { value: record.state.latestDecision?.summary, weight: 6 },
        { value: record.dashboard.latestIteration?.summary, weight: 5 },
        { value: ralphSearchText(record).join(" "), weight: 3 },
      ],
    })),
    { text: filter.text, sort: filter.sort },
  );
}

function normalizeNextLaunchState(input: Partial<RalphNextLaunchState> | null | undefined): RalphNextLaunchState {
  return {
    runtime: input?.runtime === "subprocess" || input?.runtime === "descriptor_only" ? input.runtime : null,
    resume: input?.resume === true,
    preparedAt: normalizeOptionalString(input?.preparedAt),
    instructions: normalizeStringList(input?.instructions),
  };
}

function clearPreparedLaunchState(nextLaunch: RalphNextLaunchState, instructions?: string[]): RalphNextLaunchState {
  return normalizeNextLaunchState({
    runtime: null,
    resume: false,
    preparedAt: null,
    instructions: instructions ?? nextLaunch.instructions,
  });
}

function toRalphIterationArtifactDisplayId(runId: string, iterationId: string): string {
  return `ralph-run:${runId}:iteration:${iterationId}`;
}

function buildIterationArtifactTitle(runTitle: string, iteration: RalphIterationRecord): string {
  return `${runTitle} iteration ${iteration.iteration}`;
}

function buildIterationArtifactSummary(iteration: RalphIterationRecord): string {
  return summarizeText(
    `${iteration.summary} ${iteration.workerSummary}`,
    `Ralph iteration ${iteration.iteration} for ${iteration.runId}.`,
  );
}

function upsertEntitySync(
  cwd: string,
  record: {
    id: string;
    kind: string;
    spaceId: string;
    owningRepositoryId: string | null;
    displayId: string | null;
    title: string;
    summary: string;
    status: string;
    version: number;
    tags: string[];
    attributes: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  },
): void {
  const { storage } = openRalphCatalogSync(cwd);
  storage.db
    .prepare(`
      INSERT INTO entities (id, kind, space_id, owning_repository_id, display_id, title, summary, status, version, tags_json, attributes_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind,
        space_id = excluded.space_id,
        owning_repository_id = excluded.owning_repository_id,
        display_id = excluded.display_id,
        title = excluded.title,
        summary = excluded.summary,
        status = excluded.status,
        version = excluded.version,
        tags_json = excluded.tags_json,
        attributes_json = excluded.attributes_json,
        updated_at = excluded.updated_at
    `)
    .run(
      record.id,
      record.kind,
      record.spaceId,
      record.owningRepositoryId,
      record.displayId,
      record.title,
      record.summary,
      record.status,
      record.version,
      JSON.stringify(record.tags),
      JSON.stringify(record.attributes),
      record.createdAt,
      record.updatedAt,
    );
}

function appendEntityEventSync(
  cwd: string,
  entityId: string,
  kind: "updated" | "decision_recorded",
  payload: Record<string, unknown>,
  createdAt: string,
): void {
  const { storage } = openRalphCatalogSync(cwd);
  const row = storage.db
    .prepare("SELECT COALESCE(MAX(sequence), 0) AS sequence FROM events WHERE entity_id = ?")
    .get(entityId) as { sequence?: number } | undefined;
  const sequence = Number(row?.sequence ?? 0) + 1;
  storage.db
    .prepare(
      "INSERT INTO events (id, entity_id, kind, sequence, created_at, actor, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      createEventId(entityId, sequence),
      entityId,
      kind,
      sequence,
      createdAt,
      RALPH_EVENT_ACTOR,
      JSON.stringify(payload),
    );
}

function syncIterationArtifactsSync(
  cwd: string,
  owner: { entityId: string; displayId: string; title: string; spaceId: string; repositoryId: string | null },
  iterations: RalphIterationRecord[],
  timestamp: string,
): void {
  const { storage } = openRalphCatalogSync(cwd);
  const existingRows = storage.db
    .prepare(
      "SELECT id, display_id, version, created_at, attributes_json FROM entities WHERE space_id = ? AND kind = ?",
    )
    .all(owner.spaceId, "artifact") as Array<{
    id: string;
    display_id: string | null;
    version: number;
    created_at: string;
    attributes_json: string;
  }>;
  const managed = existingRows.filter((row) => {
    const attributes = parseStoredJson<Record<string, unknown>>(row.attributes_json, {});
    return (
      hasProjectedArtifactAttributes(attributes) &&
      attributes.projectionOwner === RALPH_ITERATION_PROJECTION_OWNER &&
      attributes.artifactType === RALPH_ITERATION_ARTIFACT_TYPE &&
      attributes.owner.entityId === owner.entityId
    );
  });
  const existingByDisplayId = new Map(managed.map((row) => [row.display_id ?? row.id, row]));
  const desiredDisplayIds = new Set<string>();

  for (const iteration of iterations) {
    const displayId = toRalphIterationArtifactDisplayId(owner.displayId, iteration.id);
    desiredDisplayIds.add(displayId);
    const existing = existingByDisplayId.get(displayId);
    const artifactId =
      existing?.id ??
      createEntityId("artifact", owner.spaceId, displayId, `${RALPH_ITERATION_ARTIFACT_TYPE}:${displayId}`);
    upsertEntitySync(cwd, {
      id: artifactId,
      kind: "artifact",
      spaceId: owner.spaceId,
      owningRepositoryId: owner.repositoryId,
      displayId,
      title: buildIterationArtifactTitle(owner.title, iteration),
      summary: buildIterationArtifactSummary(iteration),
      status: iteration.status,
      version: (existing?.version ?? 0) + 1,
      tags: [RALPH_ITERATION_ARTIFACT_TYPE, owner.displayId, iteration.status],
      attributes: projectedArtifactAttributes(
        RALPH_ITERATION_PROJECTION_OWNER,
        RALPH_ITERATION_ARTIFACT_TYPE,
        { entityId: owner.entityId, kind: ENTITY_KIND, displayId: owner.displayId },
        { iteration },
      ),
      createdAt: existing?.created_at ?? timestamp,
      updatedAt: timestamp,
    });
    storage.db
      .prepare(
        `
          INSERT INTO links (id, kind, from_entity_id, to_entity_id, metadata_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
        `,
      )
      .run(
        createLinkId("belongs_to", artifactId, owner.entityId),
        "belongs_to",
        artifactId,
        owner.entityId,
        JSON.stringify({ projectionOwner: `${RALPH_ITERATION_PROJECTION_OWNER}:links` }),
        existing?.created_at ?? timestamp,
        timestamp,
      );
  }

  for (const row of managed) {
    const displayId = row.display_id ?? row.id;
    if (desiredDisplayIds.has(displayId)) {
      continue;
    }
    storage.db.prepare("DELETE FROM entities WHERE id = ?").run(row.id);
  }
}

function readStructuredEntityAttributesSync<T>(cwd: string, kind: string, displayId: string): T | null {
  const { storage, identity } = openRalphCatalogSync(cwd);
  const row = storage.db
    .prepare("SELECT attributes_json FROM entities WHERE space_id = ? AND kind = ? AND display_id = ? LIMIT 1")
    .get(identity.space.id, kind, displayId) as { attributes_json: string } | undefined;
  return row ? parseStoredJson<T>(row.attributes_json, {} as T) : null;
}

function _parseJsonlText<T>(content: string): T[] {
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function _frontmatterString(
  frontmatter: Readonly<Record<string, string | null | string[]>> | undefined,
  key: string,
): string {
  const value = frontmatter?.[key];
  return typeof value === "string" ? value : "";
}

function _frontmatterStringList(
  frontmatter: Readonly<Record<string, string | null | string[]>> | undefined,
  key: string,
): string[] {
  const value = frontmatter?.[key];
  if (Array.isArray(value)) {
    return normalizeStringList(value);
  }
  return value ? normalizeStringList([value]) : [];
}

function expectEnum<T extends string>(
  label: string,
  value: string | null | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if ((allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  throw new Error(`Invalid ${label}: ${value}`);
}

function normalizeRunStatus(value: string | null | undefined): RalphRunStatus {
  return expectEnum("Ralph run status", value, RALPH_RUN_STATUSES, "planned");
}

function normalizeRunPhase(value: string | null | undefined): RalphRunPhase {
  return expectEnum("Ralph run phase", value, RALPH_RUN_PHASES, "preparing");
}

function normalizeWaitingFor(value: string | null | undefined): RalphWaitingFor {
  return expectEnum("Ralph waiting state", value, RALPH_WAITING_FOR, "none");
}

function normalizeVerifierSourceKind(value: string | null | undefined): RalphVerifierSourceKind {
  return expectEnum("Ralph verifier source kind", value, RALPH_VERIFIER_SOURCE_KINDS, "manual");
}

function normalizeVerifierVerdict(value: string | null | undefined): RalphVerifierVerdict {
  return expectEnum("Ralph verifier verdict", value, RALPH_VERIFIER_VERDICTS, "not_run");
}

function normalizeCritiqueVerdict(value: string | null | undefined): RalphCritiqueVerdict | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return expectEnum("Ralph critique verdict", value, RALPH_CRITIQUE_VERDICTS, "concerns");
}

function normalizePolicyMode(value: string | null | undefined): RalphPolicyMode {
  return expectEnum("Ralph policy mode", value, RALPH_POLICY_MODES, "balanced");
}

function normalizeIterationStatus(value: string | null | undefined): RalphIterationStatus {
  return expectEnum("Ralph iteration status", value, RALPH_ITERATION_STATUSES, "pending");
}

function normalizeLinkedRefs(input: Partial<RalphLinkedRefs> | undefined): RalphLinkedRefs {
  return {
    roadmapItemIds: normalizeStringList(input?.roadmapItemIds),
    initiativeIds: normalizeStringList(input?.initiativeIds),
    researchIds: normalizeStringList(input?.researchIds),
    specChangeIds: normalizeStringList(input?.specChangeIds),
    ticketIds: normalizeStringList(input?.ticketIds),
    critiqueIds: normalizeStringList(input?.critiqueIds),
    docIds: normalizeStringList(input?.docIds),
    planIds: normalizeStringList(input?.planIds),
  };
}

function mergeLinkedRefs(current: RalphLinkedRefs, next: Partial<RalphLinkedRefs> | undefined): RalphLinkedRefs {
  if (!next) {
    return current;
  }
  return normalizeLinkedRefs({
    roadmapItemIds: [...current.roadmapItemIds, ...(next.roadmapItemIds ?? [])],
    initiativeIds: [...current.initiativeIds, ...(next.initiativeIds ?? [])],
    researchIds: [...current.researchIds, ...(next.researchIds ?? [])],
    specChangeIds: [...current.specChangeIds, ...(next.specChangeIds ?? [])],
    ticketIds: [...current.ticketIds, ...(next.ticketIds ?? [])],
    critiqueIds: [...current.critiqueIds, ...(next.critiqueIds ?? [])],
    docIds: [...current.docIds, ...(next.docIds ?? [])],
    planIds: [...current.planIds, ...(next.planIds ?? [])],
  });
}

function buildProjectedRalphLinks(state: RalphRunState): ProjectedEntityLinkInput[] {
  return [
    ...state.linkedRefs.initiativeIds.map(
      (targetDisplayId): ProjectedEntityLinkInput => ({
        kind: "references",
        targetKind: "initiative",
        targetDisplayId,
      }),
    ),
    ...state.linkedRefs.researchIds.map(
      (targetDisplayId): ProjectedEntityLinkInput => ({
        kind: "references",
        targetKind: "research",
        targetDisplayId,
      }),
    ),
    ...state.linkedRefs.specChangeIds.map(
      (targetDisplayId): ProjectedEntityLinkInput => ({
        kind: "references",
        targetKind: "spec_change",
        targetDisplayId,
      }),
    ),
    ...state.linkedRefs.ticketIds.map(
      (targetDisplayId): ProjectedEntityLinkInput => ({
        kind: "references",
        targetKind: "ticket",
        targetDisplayId,
      }),
    ),
    ...state.linkedRefs.docIds.map(
      (targetDisplayId): ProjectedEntityLinkInput => ({
        kind: "references",
        targetKind: "documentation",
        targetDisplayId,
      }),
    ),
    ...state.linkedRefs.planIds.map(
      (targetDisplayId): ProjectedEntityLinkInput => ({
        kind: "references",
        targetKind: "plan",
        targetDisplayId,
      }),
    ),
    ...state.linkedRefs.critiqueIds.map(
      (targetDisplayId): ProjectedEntityLinkInput => ({
        kind: "critiques",
        targetKind: "critique",
        targetDisplayId,
      }),
    ),
  ];
}

function normalizePolicySnapshot(input: Partial<RalphPolicySnapshot> | undefined): RalphPolicySnapshot {
  return {
    mode: normalizePolicyMode(input?.mode),
    maxIterations:
      typeof input?.maxIterations === "number" && Number.isFinite(input.maxIterations) && input.maxIterations > 0
        ? Math.floor(input.maxIterations)
        : null,
    maxRuntimeMinutes:
      typeof input?.maxRuntimeMinutes === "number" &&
      Number.isFinite(input.maxRuntimeMinutes) &&
      input.maxRuntimeMinutes > 0
        ? Math.floor(input.maxRuntimeMinutes)
        : null,
    tokenBudget:
      typeof input?.tokenBudget === "number" && Number.isFinite(input.tokenBudget) && input.tokenBudget > 0
        ? Math.floor(input.tokenBudget)
        : null,
    verifierRequired: input?.verifierRequired !== false,
    critiqueRequired: input?.critiqueRequired === true,
    stopWhenVerified: input?.stopWhenVerified !== false,
    manualApprovalRequired: input?.manualApprovalRequired === true,
    allowOperatorPause: input?.allowOperatorPause !== false,
    notes: normalizeStringList(input?.notes),
  };
}

function mergePolicySnapshot(
  current: RalphPolicySnapshot,
  input: Partial<RalphPolicySnapshot> | undefined,
): RalphPolicySnapshot {
  if (!input) {
    return current;
  }
  return normalizePolicySnapshot({
    ...current,
    ...input,
    notes: input.notes ? [...current.notes, ...input.notes] : current.notes,
  });
}

function normalizeVerifierSummary(input: Partial<RalphVerifierSummary> | undefined): RalphVerifierSummary {
  const verdict = normalizeVerifierVerdict(input?.verdict);
  return {
    sourceKind: normalizeVerifierSourceKind(input?.sourceKind),
    sourceRef: input?.sourceRef?.trim() || "manual",
    verdict,
    summary: input?.summary?.trim() ?? "",
    required: input?.required !== false,
    blocker: input?.blocker === true || verdict === "fail",
    checkedAt: normalizeOptionalString(input?.checkedAt),
    evidence: normalizeStringList(input?.evidence),
  };
}

function mergeVerifierSummary(
  current: RalphVerifierSummary,
  input: Partial<RalphVerifierSummary> | undefined,
): RalphVerifierSummary {
  if (!input) {
    return current;
  }
  return normalizeVerifierSummary({
    ...current,
    ...input,
    evidence: input.evidence ? [...current.evidence, ...input.evidence] : current.evidence,
  });
}

function normalizeCritiqueLink(input: RalphCritiqueLink): RalphCritiqueLink {
  const critiqueId = input.critiqueId.trim();
  if (!critiqueId) {
    throw new Error("Ralph critique link requires a critiqueId");
  }
  const kind = expectEnum(
    "Ralph critique link kind",
    input.kind,
    RALPH_CRITIQUE_LINK_KINDS,
    "context",
  ) as RalphCritiqueLinkKind;
  const verdict = normalizeCritiqueVerdict(input.verdict);
  return {
    critiqueId,
    kind,
    verdict,
    required: input.required === true,
    blocking: input.blocking === true || verdict === "blocked" || verdict === "needs_revision",
    reviewedAt: normalizeOptionalString(input.reviewedAt),
    findingIds: normalizeStringList(input.findingIds),
    summary: input.summary.trim(),
  };
}

function normalizeCritiqueLinks(links: readonly RalphCritiqueLink[] | undefined): RalphCritiqueLink[] {
  const deduped = new Map<string, RalphCritiqueLink>();
  for (const link of links ?? []) {
    const normalized = normalizeCritiqueLink(link);
    deduped.set(`${normalized.critiqueId}:${normalized.kind}`, normalized);
  }
  return [...deduped.values()].sort((left, right) =>
    `${left.critiqueId}:${left.kind}`.localeCompare(`${right.critiqueId}:${right.kind}`),
  );
}

function mergeCritiqueLinks(current: RalphCritiqueLink[], next: RalphCritiqueLink[] | undefined): RalphCritiqueLink[] {
  return normalizeCritiqueLinks([...(current ?? []), ...(next ?? [])]);
}

function normalizeDecision(input: RalphContinuationDecision | null | undefined): RalphContinuationDecision | null {
  if (!input) {
    return null;
  }
  return {
    kind: expectEnum("Ralph decision kind", input.kind, RALPH_DECISION_KINDS, "continue"),
    reason: expectEnum("Ralph decision reason", input.reason, RALPH_DECISION_REASONS, "unknown"),
    summary: input.summary.trim(),
    decidedAt: normalizeOptionalString(input.decidedAt) ?? currentTimestamp(),
    decidedBy: input.decidedBy,
    blockingRefs: normalizeStringList(input.blockingRefs),
  };
}

function normalizeIteration(record: RalphIterationRecord): RalphIterationRecord {
  return {
    id: record.id.trim(),
    runId: normalizeRalphRunId(record.runId),
    iteration: Math.max(1, Math.floor(record.iteration)),
    status: normalizeIterationStatus(record.status),
    startedAt: record.startedAt,
    completedAt: normalizeOptionalString(record.completedAt),
    focus: record.focus.trim(),
    summary: record.summary.trim(),
    workerSummary: record.workerSummary.trim(),
    verifier: normalizeVerifierSummary(record.verifier),
    critiqueLinks: normalizeCritiqueLinks(record.critiqueLinks),
    decision: normalizeDecision(record.decision),
    notes: normalizeStringList(record.notes),
  };
}

function completedAtForStatus(status: RalphIterationStatus, explicit: string | null | undefined): string | null {
  const normalized = normalizeOptionalString(explicit);
  if (normalized) {
    return normalized;
  }
  return ["reviewing", "accepted", "rejected", "failed", "cancelled"].includes(status)
    ? currentTimestamp()
    : null;
}

function isPostIterationStatus(status: RalphIterationStatus): boolean {
  return !["pending", "running"].includes(status);
}

function toPostIterationState(iteration: RalphIterationRecord | null) {
  if (!iteration || !isPostIterationStatus(iteration.status)) {
    return null;
  }
  return {
    iterationId: iteration.id,
    iteration: iteration.iteration,
    status: iteration.status,
    startedAt: iteration.startedAt,
    completedAt: iteration.completedAt,
    focus: iteration.focus,
    summary: iteration.summary,
    workerSummary: iteration.workerSummary,
    verifier: iteration.verifier,
    critiqueLinks: iteration.critiqueLinks,
    decision: iteration.decision,
    notes: iteration.notes,
  };
}

function normalizeStoredRunState(state: RalphRunState): RalphRunState {
  const normalized: RalphRunState = {
    runId: normalizeRalphRunId(state.runId),
    title: state.title.trim(),
    status: normalizeRunStatus(state.status),
    phase: normalizeRunPhase(state.phase),
    waitingFor: normalizeWaitingFor(state.waitingFor),
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    objective: state.objective?.trim() ?? "",
    summary: state.summary?.trim() ?? "",
    linkedRefs: normalizeLinkedRefs(state.linkedRefs),
    policySnapshot: normalizePolicySnapshot(state.policySnapshot),
    verifierSummary: normalizeVerifierSummary(state.verifierSummary),
    critiqueLinks: normalizeCritiqueLinks(state.critiqueLinks),
    latestDecision: normalizeDecision(state.latestDecision),
    postIteration: state.postIteration
      ? {
          ...state.postIteration,
          iterationId: state.postIteration.iterationId.trim(),
          iteration: Math.max(1, Math.floor(state.postIteration.iteration)),
          status: normalizeIterationStatus(state.postIteration.status),
          startedAt: state.postIteration.startedAt,
          completedAt: normalizeOptionalString(state.postIteration.completedAt),
          focus: state.postIteration.focus.trim(),
          summary: state.postIteration.summary.trim(),
          workerSummary: state.postIteration.workerSummary.trim(),
          verifier: normalizeVerifierSummary(state.postIteration.verifier),
          critiqueLinks: normalizeCritiqueLinks(state.postIteration.critiqueLinks),
          decision: normalizeDecision(state.postIteration.decision),
          notes: normalizeStringList(state.postIteration.notes),
        }
      : null,
    lastIterationNumber:
      typeof state.lastIterationNumber === "number" && Number.isFinite(state.lastIterationNumber)
        ? Math.max(0, Math.floor(state.lastIterationNumber))
        : 0,
    nextIterationId: normalizeOptionalString(
      (state as RalphRunState & { nextIterationId?: string | null; currentIterationId?: string | null }).nextIterationId ??
        (state as RalphRunState & { currentIterationId?: string | null }).currentIterationId,
    ),
    nextLaunch: normalizeNextLaunchState(
      (state as RalphRunState & { preparedLaunch?: RalphNextLaunchState; lastLaunchAt?: string | null }).nextLaunch ?? {
        ...(state as RalphRunState & { preparedLaunch?: RalphNextLaunchState }).preparedLaunch,
        preparedAt: (state as RalphRunState & { lastLaunchAt?: string | null }).lastLaunchAt,
      },
    ),
    stopReason: normalizeOptionalString(state.stopReason) as RalphContinuationDecision["reason"] | null,
    packetSummary: state.packetSummary?.trim() ?? "",
  };
  return { ...normalized, packetSummary: createPacketSummary(normalized) };
}

function waitingForFromCritiques(links: RalphCritiqueLink[]): RalphWaitingFor {
  if (links.some((link) => link.required && link.verdict === null)) {
    return "critique";
  }
  if (links.some((link) => link.blocking)) {
    return "operator";
  }
  return "none";
}

function waitingForFromReviewSignals(verifier: RalphVerifierSummary, links: RalphCritiqueLink[]): RalphWaitingFor {
  if (verifier.blocker) {
    return "operator";
  }
  return waitingForFromCritiques(links);
}

function createPacketSummary(state: RalphRunState): string {
  const refs = [
    ...state.linkedRefs.planIds,
    ...state.linkedRefs.ticketIds,
    ...state.linkedRefs.critiqueIds,
    ...state.linkedRefs.specChangeIds,
  ];
  return summarizeText(
    `${state.title}. ${state.objective} ${refs.length > 0 ? `Linked refs: ${refs.join(", ")}.` : ""}`,
    `Ralph orchestration run for ${state.title}.`,
  );
}

function renderListSection(title: string, values: string[]): string {
  return renderSection(title, renderBulletList(values));
}

interface ResolvedPacketContext {
  roadmap: string[];
  initiatives: string[];
  research: string[];
  specs: string[];
  plans: string[];
  tickets: string[];
  critiques: string[];
  docs: string[];
}

export class RalphStore {
  readonly cwd: string;

  constructor(cwd: string) {
    this.cwd = resolve(cwd);
  }

  initLedger(): { initialized: true; root: string } {
    return { initialized: true, root: getLoomCatalogPaths().catalogPath };
  }

  private runDirectories(): string[] {
    return listStoredRalphStates(this.cwd).map((state) => getRalphRunDir(this.cwd, state.runId));
  }

  private nextRunId(seed: string): string {
    const baseId = slugifyRalphValue(seed);
    const existing = new Set(this.runDirectories().map((directory) => normalizeRalphRunRef(directory)));
    if (!existing.has(baseId)) {
      return baseId;
    }
    let attempt = 2;
    while (existing.has(`${baseId}-${attempt}`)) {
      attempt += 1;
    }
    return `${baseId}-${attempt}`;
  }

  private resolveRunDirectory(ref: string): string {
    const runId = normalizeRalphRunRef(ref);
    const runDir = getRalphRunDir(this.cwd, runId);
    if (!findStoredRalphRow(this.cwd, runId)) {
      throw new Error(`Unknown Ralph run: ${ref}`);
    }
    return runDir;
  }

  private summarizeRun(state: RalphRunState, runDir: string) {
    return summarizeRalphRun(state, runDir);
  }

  private appendRunEvent(
    runId: string,
    kind: "updated" | "decision_recorded",
    payload: Record<string, unknown>,
    createdAt: string,
  ): void {
    const row = findStoredRalphRow(this.cwd, runId);
    if (!row) {
      return;
    }
    appendEntityEventSync(this.cwd, row.id, kind, payload, createdAt);
  }

  private buildContextSummary(refs: string[], resolver: (ref: string) => string): string[] {
    return refs.map((ref) => {
      try {
        return resolver(ref);
      } catch {
        return `${ref} (unresolved)`;
      }
    });
  }

  private resolvePacketContext(state: RalphRunState): ResolvedPacketContext {
    return {
      roadmap: this.buildContextSummary(state.linkedRefs.roadmapItemIds, (ref) => {
        const constitution = readStructuredEntityAttributesSync<{
          state: { roadmapItems: Array<{ id: string; status: string; title: string }> };
        }>(this.cwd, "constitution", resolveWorkspaceIdentity(this.cwd).repository.slug);
        const item = constitution?.state.roadmapItems.find((entry) => entry.id === ref);
        if (!item) throw new Error(`Unknown roadmap item: ${ref}`);
        return `${item.id} [${item.status}] ${item.title}`;
      }),
      initiatives: this.buildContextSummary(state.linkedRefs.initiativeIds, (ref) => {
        const initiative = readStructuredEntityAttributesSync<{
          state: { initiativeId: string; status: string; title: string };
        }>(this.cwd, "initiative", ref);
        if (!initiative) throw new Error(`Unknown initiative: ${ref}`);
        return `${initiative.state.initiativeId} [${initiative.state.status}] ${initiative.state.title}`;
      }),
      research: this.buildContextSummary(state.linkedRefs.researchIds, (ref) => {
        const research = readStructuredEntityAttributesSync<{
          state: { researchId: string; status: string; title: string };
        }>(this.cwd, "research", ref);
        if (!research) throw new Error(`Unknown research: ${ref}`);
        return `${research.state.researchId} [${research.state.status}] ${research.state.title}`;
      }),
      specs: this.buildContextSummary(state.linkedRefs.specChangeIds, (ref) => {
        const spec = readStructuredEntityAttributesSync<{
          record: { summary: { id: string; status: string }; state: { title: string } };
        }>(this.cwd, "spec_change", ref);
        if (!spec) throw new Error(`Unknown spec: ${ref}`);
        return `${spec.record.summary.id} [${spec.record.summary.status}] ${spec.record.state.title}`;
      }),
      plans: this.buildContextSummary(state.linkedRefs.planIds, (ref) => {
        const plan = readStructuredEntityAttributesSync<{ state: { planId: string; status: string; title: string } }>(
          this.cwd,
          "plan",
          ref,
        );
        if (!plan) throw new Error(`Unknown plan: ${ref}`);
        return `${plan.state.planId} [${plan.state.status}] ${plan.state.title}`;
      }),
      tickets: this.buildContextSummary(state.linkedRefs.ticketIds, (ref) => {
        const ticket = readStructuredEntityAttributesSync<{
          record: { summary: { id: string; status: string; title: string } };
        }>(this.cwd, "ticket", ref);
        if (!ticket) throw new Error(`Unknown ticket: ${ref}`);
        return `${ticket.record.summary.id} [${ticket.record.summary.status}] ${ticket.record.summary.title}`;
      }),
      critiques: this.buildContextSummary(state.linkedRefs.critiqueIds, (ref) => {
        const critique = readStructuredEntityAttributesSync<{
          record: { summary: { id: string; status: string; verdict: string }; state: { title: string } };
        }>(this.cwd, "critique", ref);
        if (!critique) throw new Error(`Unknown critique: ${ref}`);
        return `${critique.record.summary.id} [${critique.record.summary.status}/${critique.record.summary.verdict}] ${critique.record.state.title}`;
      }),
      docs: this.buildContextSummary(state.linkedRefs.docIds, (ref) => {
        const doc = readStructuredEntityAttributesSync<{
          record: { summary: { id: string; status: string; docType: string }; state: { title: string } };
        }>(this.cwd, "documentation", ref);
        if (!doc) throw new Error(`Unknown document: ${ref}`);
        return `${doc.record.summary.id} [${doc.record.summary.status}/${doc.record.summary.docType}] ${doc.record.state.title}`;
      }),
    };
  }

  private renderPacket(
    state: RalphRunState,
    iterations: RalphIterationRecord[],
    context: ResolvedPacketContext,
  ): string {
    const latestIteration = iterations.at(-1) ?? null;
    const latestIterationLines = latestIteration
      ? [
          `- id: ${latestIteration.id}`,
          `- iteration: ${latestIteration.iteration}`,
          `- status: ${latestIteration.status}`,
          `- focus: ${latestIteration.focus || "(none)"}`,
          `- summary: ${latestIteration.summary || "(none)"}`,
          `- worker summary: ${latestIteration.workerSummary || "(none)"}`,
          `- verifier: ${latestIteration.verifier.verdict}`,
        ].join("\n")
      : "(none)";
    const postIterationLines = state.postIteration
      ? [
          `- id: ${state.postIteration.iterationId}`,
          `- iteration: ${state.postIteration.iteration}`,
          `- status: ${state.postIteration.status}`,
          `- completed at: ${state.postIteration.completedAt ?? "(not completed)"}`,
          `- focus: ${state.postIteration.focus || "(none)"}`,
          `- summary: ${state.postIteration.summary || "(none)"}`,
          `- worker summary: ${state.postIteration.workerSummary || "(none)"}`,
          `- verifier: ${state.postIteration.verifier.verdict}`,
          `- critiques: ${state.postIteration.critiqueLinks.map((link) => link.critiqueId).join(", ") || "(none)"}`,
          `- decision: ${state.postIteration.decision?.kind ?? "(none)"}`,
        ].join("\n")
      : "(none yet)";
    const nextLaunchLines = [
      `- next iteration id: ${state.nextIterationId ?? "(none prepared)"}`,
      `- prepared at: ${state.nextLaunch.preparedAt ?? "(not prepared)"}`,
      `- mode: ${state.nextLaunch.resume ? "resume" : "fresh launch"}`,
      `- runtime: ${state.nextLaunch.runtime ?? "descriptor_only"}`,
      `- instructions: ${state.nextLaunch.instructions.join(" | ") || "(none)"}`,
    ].join("\n");

    return `${[
      `# Ralph Packet: ${state.title}`,
      renderSection(
        "Run State",
        [
          `- run id: ${state.runId}`,
          `- status: ${state.status}`,
          `- phase: ${state.phase}`,
          `- waiting for: ${state.waitingFor}`,
          `- last iteration number: ${state.lastIterationNumber}`,
          `- stop reason: ${state.stopReason ?? "(none)"}`,
        ].join("\n"),
      ),
      renderSection("Objective", state.objective || "(none)"),
      renderSection("Summary", state.summary || "(none)"),
      renderSection(
        "Policy Snapshot",
        [
          `- mode: ${state.policySnapshot.mode}`,
          `- max iterations: ${state.policySnapshot.maxIterations ?? "(none)"}`,
          `- max runtime minutes: ${state.policySnapshot.maxRuntimeMinutes ?? "(none)"}`,
          `- token budget: ${state.policySnapshot.tokenBudget ?? "(none)"}`,
          `- verifier required: ${state.policySnapshot.verifierRequired ? "yes" : "no"}`,
          `- critique required: ${state.policySnapshot.critiqueRequired ? "yes" : "no"}`,
          `- stop when verified: ${state.policySnapshot.stopWhenVerified ? "yes" : "no"}`,
          `- manual approval required: ${state.policySnapshot.manualApprovalRequired ? "yes" : "no"}`,
          `- allow operator pause: ${state.policySnapshot.allowOperatorPause ? "yes" : "no"}`,
          `- notes: ${state.policySnapshot.notes.join(", ") || "(none)"}`,
        ].join("\n"),
      ),
      renderSection(
        "Verifier Summary",
        [
          `- source: ${state.verifierSummary.sourceKind}:${state.verifierSummary.sourceRef}`,
          `- verdict: ${state.verifierSummary.verdict}`,
          `- blocker: ${state.verifierSummary.blocker ? "yes" : "no"}`,
          `- checked at: ${state.verifierSummary.checkedAt ?? "(not checked)"}`,
          `- summary: ${state.verifierSummary.summary || "(none)"}`,
          `- evidence: ${state.verifierSummary.evidence.join(", ") || "(none)"}`,
        ].join("\n"),
      ),
      renderSection(
        "Critique Links",
        state.critiqueLinks.length > 0
          ? state.critiqueLinks
              .map(
                (link) =>
                  `- ${link.critiqueId} [${link.kind}/${link.verdict ?? "none"}] blocking=${link.blocking ? "yes" : "no"} findings=${link.findingIds.join(", ") || "(none)"}`,
              )
              .join("\n")
          : "(none)",
      ),
      renderSection(
        "Latest Decision",
        state.latestDecision
          ? [
              `- kind: ${state.latestDecision.kind}`,
              `- reason: ${state.latestDecision.reason}`,
              `- decided by: ${state.latestDecision.decidedBy}`,
              `- decided at: ${state.latestDecision.decidedAt}`,
              `- summary: ${state.latestDecision.summary || "(none)"}`,
              `- blocking refs: ${state.latestDecision.blockingRefs.join(", ") || "(none)"}`,
            ].join("\n")
          : "(none)",
      ),
      renderSection("Post-Iteration Checkpoint", postIterationLines),
      renderSection("Next Launch State", nextLaunchLines),
      renderSection("Latest Iteration", latestIterationLines),
      renderListSection("Linked Plans", context.plans),
      renderListSection("Linked Tickets", context.tickets),
      renderListSection("Linked Critiques", context.critiques),
      renderListSection("Linked Specs", context.specs),
      renderListSection("Linked Research", context.research),
      renderListSection("Linked Initiatives", context.initiatives),
      renderListSection("Linked Roadmap Items", context.roadmap),
      renderListSection("Linked Docs", context.docs),
      renderSection(
        "Execution Guidance",
        [
          "- Perform one bounded iteration only.",
          "- Read the linked durable artifacts instead of relying on prior chat state.",
          "- Persist verifier evidence, critique references, and the continuation decision back into the Ralph run so the next caller can inspect the post-iteration state after exit.",
          "- Do not report completion unless the policy gates actually permit completion.",
        ].join("\n"),
      ),
    ].join("\n\n")}\n`;
  }

  private buildPacket(state: RalphRunState, iterations: RalphIterationRecord[]): string {
    return this.renderPacket(state, iterations, this.resolvePacketContext(state));
  }

  private readState(runDir: string): RalphRunState {
    const runId = normalizeRalphRunRef(runDir);
    const row = findStoredRalphRow(this.cwd, runId);
    if (!row) {
      throw new Error(`Unknown Ralph run: ${runId}`);
    }
    const attributes = parseStoredJson<RalphEntityAttributes | Record<string, unknown>>(row.attributes_json, {});
    if (!hasStructuredRalphAttributes(attributes)) {
      throw new Error(`Ralph run entity ${runId} is missing structured attributes`);
    }
    return normalizeStoredRunState(attributes.state);
  }

  private readIterationHistory(runId: string): RalphIterationRecord[] {
    const row = findStoredRalphRow(this.cwd, runId);
    if (!row) {
      return [];
    }
    const { storage, identity } = openRalphCatalogSync(this.cwd);
    const rows = storage.db
      .prepare("SELECT attributes_json FROM entities WHERE space_id = ? AND kind = ?")
      .all(identity.space.id, "artifact") as Array<{ attributes_json: string }>;
    return rows
      .map((artifact) => parseStoredJson<Record<string, unknown>>(artifact.attributes_json, {}))
      .filter(
        (attributes): attributes is ProjectedArtifactEntityAttributes<RalphIterationArtifactPayload> =>
          isRalphIterationArtifactAttributes(attributes) && attributes.owner.entityId === row.id,
      )
      .map((attributes) => normalizeIteration((attributes.payload as RalphIterationArtifactPayload).iteration))
      .sort((left, right) => left.iteration - right.iteration);
  }

  private readIterations(runId: string): RalphIterationRecord[] {
    return latestById(this.readIterationHistory(runId)).sort((left, right) => left.iteration - right.iteration);
  }

  private readLaunch(state: RalphRunState, iterations: RalphIterationRecord[]): RalphLaunchDescriptor | null {
    const nextIteration = this.latestIterationById(iterations, state.nextIterationId);
    if (!nextIteration) {
      return null;
    }
    return {
      runId: state.runId,
      iterationId: nextIteration.id,
      iteration: nextIteration.iteration,
      createdAt: state.nextLaunch.preparedAt ?? currentTimestamp(),
      runtime: state.nextLaunch.runtime ?? (state.nextLaunch.preparedAt ? "subprocess" : "descriptor_only"),
      packetRef: toRalphPacketRef(state.runId),
      launchRef: toRalphLaunchRef(state.runId),
      resume: state.nextLaunch.resume,
      instructions:
        state.nextLaunch.instructions.length > 0
          ? state.nextLaunch.instructions
          : [
              `Read ${toRalphPacketRef(state.runId)} before acting.`,
              `Persist iteration updates for ${nextIteration.id} through the Ralph tools with ref=${toRalphRunRef(state.runId)}.`,
              "Execute exactly one bounded iteration and record an explicit policy decision before exiting.",
            ],
    };
  }

  private defaultLaunchDescriptor(state: RalphRunState, iteration: RalphIterationRecord | null): RalphLaunchDescriptor {
    return {
      runId: state.runId,
      iterationId: iteration?.id ?? "iter-001",
      iteration: iteration?.iteration ?? Math.max(1, state.lastIterationNumber || 1),
      createdAt: currentTimestamp(),
      runtime: "descriptor_only",
      packetRef: toRalphPacketRef(state.runId),
      launchRef: toRalphLaunchRef(state.runId),
      resume: state.nextLaunch.resume,
      instructions: [
        "Prepare one fresh Ralph iteration at a time.",
        `Use ${toRalphPacketRef(state.runId)} as the canonical packet for the next iteration.`,
        `Persist iteration updates for ${iteration?.id ?? "iter-001"} through Ralph tools with ref=${toRalphRunRef(state.runId)}.`,
      ],
    };
  }

  private writeArtifacts(
    state: RalphRunState,
    launchOverride?: RalphLaunchDescriptor | null,
    iterationsOverride?: RalphIterationRecord[],
  ): RalphReadResult {
    const artifacts = getRalphArtifactPaths(this.cwd, state.runId);
    const iterations = iterationsOverride ?? this.readIterations(state.runId);
    const postIteration = toPostIterationState([...iterations].reverse().find((iteration) => isPostIterationStatus(iteration.status)) ?? null);
    const normalizedState: RalphRunState = {
      ...state,
      postIteration,
      lastIterationNumber: iterations.at(-1)?.iteration ?? state.lastIterationNumber,
      packetSummary: createPacketSummary(state),
    };
    const summary = this.summarizeRun(normalizedState, artifacts.dir);
    const packet = this.buildPacket(normalizedState, iterations);
    const run = renderRalphMarkdown(normalizedState, iterations);
    const launch =
      launchOverride ??
      this.readLaunch(normalizedState, iterations) ??
      this.defaultLaunchDescriptor(normalizedState, iterations.at(-1) ?? null);
    const dashboard = buildRalphDashboard(
      normalizedState,
      summary,
      iterations,
      artifacts,
      RALPH_ITERATION_STATUSES,
      RALPH_VERIFIER_VERDICTS,
    );

    const record: RalphReadResult = {
      state: normalizedState,
      summary,
      packet,
      run,
      iterations,
      launch,
      dashboard,
      artifacts,
    };
    const { storage, identity } = openRalphCatalogSync(this.cwd);
    const existing = findStoredRalphRow(this.cwd, record.summary.id);
    const entityId =
      existing?.id ??
      createEntityId(ENTITY_KIND, identity.space.id, record.summary.id, `${ENTITY_KIND}:${record.summary.id}`);
    upsertEntitySync(this.cwd, {
      id: entityId,
      kind: ENTITY_KIND,
      spaceId: identity.space.id,
      owningRepositoryId: identity.repository.id,
      displayId: record.summary.id,
      title: record.summary.title,
      summary: record.state.summary,
      status: record.summary.status,
      version: (existing?.version ?? 0) + 1,
      tags: [record.summary.phase, ...(record.state.linkedRefs.planIds ?? [])],
      attributes: { state: record.state },
      createdAt: existing?.created_at ?? record.state.createdAt,
      updatedAt: record.state.updatedAt,
    });
    syncIterationArtifactsSync(
      this.cwd,
      {
        entityId,
        displayId: record.summary.id,
        title: record.summary.title,
        spaceId: identity.space.id,
        repositoryId: identity.repository.id,
      },
      iterations,
      record.state.updatedAt,
    );
    void syncProjectedEntityLinks({
      storage,
      spaceId: identity.space.id,
      fromEntityId: entityId,
      projectionOwner: RALPH_LINK_PROJECTION_OWNER,
      // Roadmap refs point at embedded constitution items, so phase 1 projects only canonical entity relationships.
      desired: buildProjectedRalphLinks(record.state),
      timestamp: record.state.updatedAt,
    }).catch(() => undefined);
    return record;
  }

  private createDefaultState(input: CreateRalphRunInput, runId: string, timestamp: string): RalphRunState {
    const title = input.title.trim();
    if (!title) {
      throw new Error("Ralph run title is required");
    }
    return {
      runId,
      title,
      status: "planned",
      phase: "preparing",
      waitingFor: "none",
      createdAt: timestamp,
      updatedAt: timestamp,
      objective: input.objective?.trim() ?? "",
      summary: summarizeText(input.summary ?? input.objective, `Ralph orchestration run for ${title}.`),
      linkedRefs: normalizeLinkedRefs(input.linkedRefs),
      policySnapshot: normalizePolicySnapshot(input.policySnapshot),
      verifierSummary: normalizeVerifierSummary(input.verifierSummary),
      critiqueLinks: normalizeCritiqueLinks(input.critiqueLinks),
      latestDecision: normalizeDecision(input.latestDecision),
      postIteration: null,
      lastIterationNumber: 0,
      nextIterationId: null,
      nextLaunch: normalizeNextLaunchState({ instructions: input.launchInstructions }),
      stopReason: null,
      packetSummary: "",
    };
  }

  private latestIterationById(iterations: RalphIterationRecord[], id: string | null): RalphIterationRecord | null {
    if (!id) {
      return null;
    }
    return iterations.find((iteration) => iteration.id === id) ?? null;
  }

  private buildDecision(state: RalphRunState, input: DecideRalphRunInput): RalphContinuationDecision {
    const decidedBy =
      input.decidedBy ??
      (input.operatorRequestedStop
        ? "operator"
        : input.runtimeUnavailable || input.runtimeFailure
          ? "runtime"
          : "policy");
    const blockingCritiques = state.critiqueLinks.filter((link) => link.blocking).map((link) => link.critiqueId);
    const hasRequiredCritique = state.critiqueLinks.some((link) => link.required);
    const critiquePending = state.critiqueLinks.some((link) => link.required && link.verdict === null);
    const verifierSatisfied = !state.policySnapshot.verifierRequired || state.verifierSummary.verdict === "pass";
    const blockingRefs = normalizeStringList([...(input.blockingRefs ?? []), ...blockingCritiques]);

    if (input.operatorRequestedStop) {
      return {
        kind: "halt",
        reason: "operator_requested",
        summary: input.summary?.trim() || "Operator requested the Ralph run to stop.",
        decidedAt: currentTimestamp(),
        decidedBy,
        blockingRefs,
      };
    }
    if (input.runtimeUnavailable) {
      return {
        kind: "halt",
        reason: "runtime_unavailable",
        summary: input.summary?.trim() || "Runtime support was unavailable for the next Ralph iteration.",
        decidedAt: currentTimestamp(),
        decidedBy,
        blockingRefs,
      };
    }
    if (input.runtimeFailure) {
      return {
        kind: "halt",
        reason: "runtime_failure",
        summary: input.summary?.trim() || "Runtime execution failed and halted the Ralph run.",
        decidedAt: currentTimestamp(),
        decidedBy,
        blockingRefs,
      };
    }
    if (input.timeoutExceeded) {
      return {
        kind: "halt",
        reason: "timeout_exceeded",
        summary: input.summary?.trim() || "The Ralph run exceeded its configured runtime limit.",
        decidedAt: currentTimestamp(),
        decidedBy: "policy",
        blockingRefs,
      };
    }
    if (input.budgetExceeded) {
      return {
        kind: "halt",
        reason: "budget_exceeded",
        summary: input.summary?.trim() || "The Ralph run exceeded its configured token budget.",
        decidedAt: currentTimestamp(),
        decidedBy: "policy",
        blockingRefs,
      };
    }
    if (
      state.policySnapshot.maxIterations !== null &&
      state.lastIterationNumber >= state.policySnapshot.maxIterations
    ) {
      return {
        kind: "halt",
        reason: "iteration_limit_reached",
        summary: input.summary?.trim() || "The Ralph run reached its configured iteration limit.",
        decidedAt: currentTimestamp(),
        decidedBy: "policy",
        blockingRefs,
      };
    }
    if (state.policySnapshot.critiqueRequired && (!hasRequiredCritique || critiquePending)) {
      return {
        kind: "pause",
        reason: "manual_review_required",
        summary: input.summary?.trim() || "The run is waiting for required critique input before continuing.",
        decidedAt: currentTimestamp(),
        decidedBy: "policy",
        blockingRefs,
      };
    }
    if (blockingCritiques.length > 0) {
      return {
        kind: "pause",
        reason: "critique_blocked",
        summary:
          input.summary?.trim() || "Blocking critique findings require review or revision before the run can continue.",
        decidedAt: currentTimestamp(),
        decidedBy: state.policySnapshot.critiqueRequired ? "critique" : "policy",
        blockingRefs,
      };
    }
    if (state.policySnapshot.verifierRequired && (state.verifierSummary.blocker || !verifierSatisfied)) {
      return {
        kind: "pause",
        reason: "verifier_blocked",
        summary: input.summary?.trim() || "Verifier evidence is blocking further Ralph progress.",
        decidedAt: currentTimestamp(),
        decidedBy: "verifier",
        blockingRefs: normalizeStringList([
          ...blockingRefs,
          `${state.verifierSummary.sourceKind}:${state.verifierSummary.sourceRef}`,
        ]),
      };
    }
    if (state.policySnapshot.manualApprovalRequired) {
      return {
        kind: "pause",
        reason: "manual_review_required",
        summary: input.summary?.trim() || "Manual approval is required before the Ralph run may continue or complete.",
        decidedAt: currentTimestamp(),
        decidedBy: "policy",
        blockingRefs,
      };
    }
    if (input.workerRequestedCompletion) {
      if (state.policySnapshot.stopWhenVerified) {
        return {
          kind: "complete",
          reason: "goal_reached",
          summary:
            input.summary?.trim() || "The worker reported completion and the policy gates permit stopping the run.",
          decidedAt: currentTimestamp(),
          decidedBy,
          blockingRefs,
        };
      }
      return {
        kind: "continue",
        reason: "worker_requested_completion",
        summary:
          input.summary?.trim() ||
          "The worker reported completion, but the policy requires another explicit step before stopping.",
        decidedAt: currentTimestamp(),
        decidedBy: "policy",
        blockingRefs,
      };
    }
    return {
      kind: "continue",
      reason: "unknown",
      summary: input.summary?.trim() || "The run remains eligible for another bounded iteration.",
      decidedAt: currentTimestamp(),
      decidedBy: "policy",
      blockingRefs,
    };
  }

  private applyDecision(state: RalphRunState, decision: RalphContinuationDecision): RalphRunState {
    const next: RalphRunState = {
      ...state,
      latestDecision: decision,
      nextIterationId: null,
      nextLaunch: clearPreparedLaunchState(state.nextLaunch),
      updatedAt: currentTimestamp(),
    };

    switch (decision.kind) {
      case "continue": {
        next.status = "active";
        next.phase = "deciding";
        next.waitingFor = "none";
        next.stopReason = null;
        return next;
      }
      case "pause": {
        const nextWaitingFor =
          decision.reason === "critique_blocked"
            ? "operator"
            : decision.reason === "verifier_blocked"
              ? "operator"
              : state.policySnapshot.manualApprovalRequired
                ? "operator"
                : "critique";
        next.status = nextWaitingFor === "operator" ? "paused" : "waiting_for_review";
        next.phase = "reviewing";
        next.waitingFor = nextWaitingFor;
        next.stopReason = decision.reason;
        return next;
      }
      case "complete": {
        next.status = "completed";
        next.phase = "completed";
        next.waitingFor = "none";
        next.stopReason = decision.reason;
        next.nextLaunch = clearPreparedLaunchState(state.nextLaunch, []);
        return next;
      }
      case "halt": {
        next.status = decision.reason === "runtime_failure" ? "failed" : "halted";
        next.phase = "halted";
        next.waitingFor = "none";
        next.stopReason = decision.reason;
        next.nextLaunch = clearPreparedLaunchState(state.nextLaunch, []);
        return next;
      }
      case "escalate": {
        next.status = "paused";
        next.phase = "reviewing";
        next.waitingFor = "operator";
        next.stopReason = decision.reason;
        return next;
      }
    }
  }

  private createLaunchDescriptor(
    state: RalphRunState,
    iteration: RalphIterationRecord,
    input: PrepareRalphLaunchInput,
  ): RalphLaunchDescriptor {
    return {
      runId: state.runId,
      iterationId: iteration.id,
      iteration: iteration.iteration,
      createdAt: state.nextLaunch.preparedAt ?? currentTimestamp(),
      runtime: "subprocess",
      packetRef: toRalphPacketRef(state.runId),
      launchRef: toRalphLaunchRef(state.runId),
      resume: input.resume === true,
      instructions:
        state.nextLaunch.instructions.length > 0
          ? state.nextLaunch.instructions
          : [
              `Read ${toRalphPacketRef(state.runId)} before acting.`,
              `Persist iteration updates for ${iteration.id} through the Ralph tools with ref=${toRalphRunRef(state.runId)}.`,
              "Execute exactly one bounded iteration and record an explicit policy decision before exiting.",
            ],
    };
  }

  listRuns(filter: RalphListFilter = {}) {
    this.initLedger();
    return filterAndSortRalphSummaries(
      listStoredRalphStates(this.cwd).map((state) => this.readRun(state.runId)),
      filter,
    );
  }

  readRun(ref: string): RalphReadResult {
    this.initLedger();
    const runDir = this.resolveRunDirectory(ref);
    return this.writeArtifacts(this.readState(runDir));
  }

  createRun(input: CreateRalphRunInput): RalphReadResult {
    this.initLedger();
    const timestamp = currentTimestamp();
    const requestedRunId = normalizeOptionalString(input.runId);
    const runId = requestedRunId ? normalizeRalphRunId(requestedRunId) : this.nextRunId(input.title);
    if (requestedRunId && findStoredRalphRow(this.cwd, runId)) {
      throw new Error(`Ralph run already exists: ${runId}`);
    }
    const state = this.createDefaultState(input, runId, timestamp);
    return this.writeArtifacts(state, this.defaultLaunchDescriptor(state, null));
  }

  updateRun(ref: string, input: UpdateRalphRunInput): RalphReadResult {
    const current = this.readRun(ref);
    const waitingFor = input.waitingFor ? normalizeWaitingFor(input.waitingFor) : current.state.waitingFor;
    const nextState: RalphRunState = {
      ...current.state,
      title: input.title?.trim() || current.state.title,
      objective: input.objective?.trim() ?? current.state.objective,
      summary:
        input.summary !== undefined
          ? summarizeText(input.summary, current.state.summary || `Ralph run ${current.state.runId}`)
          : current.state.summary,
      linkedRefs: mergeLinkedRefs(current.state.linkedRefs, input.linkedRefs),
      policySnapshot: mergePolicySnapshot(current.state.policySnapshot, input.policySnapshot),
      verifierSummary: mergeVerifierSummary(current.state.verifierSummary, input.verifierSummary),
      critiqueLinks: input.critiqueLinks
        ? mergeCritiqueLinks(current.state.critiqueLinks, input.critiqueLinks)
        : current.state.critiqueLinks,
      latestDecision:
        input.latestDecision !== undefined ? normalizeDecision(input.latestDecision) : current.state.latestDecision,
      waitingFor,
      status: input.status ? normalizeRunStatus(input.status) : current.state.status,
      phase: input.phase ? normalizeRunPhase(input.phase) : current.state.phase,
      updatedAt: currentTimestamp(),
    };
    return this.writeArtifacts(nextState);
  }

  appendIteration(ref: string, input: AppendRalphIterationInput): RalphReadResult {
    const current = this.readRun(ref);
    const history = this.readIterationHistory(current.state.runId);
    const latestIterations = this.readIterations(current.state.runId);
    const existing = input.id
      ? (latestIterations.find((iteration) => iteration.id === input.id) ?? null)
      : this.latestIterationById(latestIterations, current.state.nextIterationId);
    const now = currentTimestamp();
    const id =
      input.id?.trim() ||
      existing?.id ||
      nextSequenceId(
        "iter",
        history.map((entry) => entry.id),
      );
    const iterationNumber = existing?.iteration ?? current.state.lastIterationNumber + 1;
    const status = normalizeIterationStatus(
      input.status ?? existing?.status ?? (existing ? existing.status : "pending"),
    );
    const verifier = normalizeVerifierSummary({
      ...current.state.verifierSummary,
      ...existing?.verifier,
      ...input.verifier,
    });
    const critiqueLinks = mergeCritiqueLinks(existing?.critiqueLinks ?? [], input.critiqueLinks);
    const decision = input.decision !== undefined ? normalizeDecision(input.decision) : (existing?.decision ?? null);
    const record: RalphIterationRecord = {
      id,
      runId: current.state.runId,
      iteration: iterationNumber,
      status,
      startedAt: input.startedAt ?? existing?.startedAt ?? now,
      completedAt: completedAtForStatus(status, input.completedAt ?? existing?.completedAt),
      focus: input.focus?.trim() ?? existing?.focus ?? current.state.objective,
      summary: input.summary?.trim() ?? existing?.summary ?? "",
      workerSummary: input.workerSummary?.trim() ?? existing?.workerSummary ?? "",
      verifier,
      critiqueLinks,
      decision,
      notes: normalizeStringList([...(existing?.notes ?? []), ...(input.notes ?? [])]),
    };
    const nextIterations = latestById([...history, record]).sort((left, right) => left.iteration - right.iteration);

    const reviewWaitingFor = status === "reviewing" ? waitingForFromReviewSignals(verifier, critiqueLinks) : "none";
    const remainsPrepared = ["pending", "running"].includes(status);

    const nextState: RalphRunState = {
      ...current.state,
      status:
        status === "failed"
          ? "failed"
          : status === "reviewing" && reviewWaitingFor !== "none"
            ? "waiting_for_review"
            : "active",
      phase: status === "reviewing" ? "reviewing" : status === "accepted" ? "deciding" : "executing",
      waitingFor: reviewWaitingFor,
      verifierSummary: verifier,
      critiqueLinks: mergeCritiqueLinks(current.state.critiqueLinks, critiqueLinks),
      latestDecision: decision ?? current.state.latestDecision,
      lastIterationNumber: Math.max(current.state.lastIterationNumber, iterationNumber),
      nextIterationId: remainsPrepared ? id : null,
      nextLaunch: remainsPrepared ? current.state.nextLaunch : clearPreparedLaunchState(current.state.nextLaunch),
      updatedAt: now,
      stopReason: ["failed", "cancelled"].includes(status) ? "runtime_failure" : current.state.stopReason,
    };
    const result = this.writeArtifacts(nextState, undefined, nextIterations);
    this.appendRunEvent(
      result.state.runId,
      "updated",
      {
        change: existing ? "iteration_updated" : "iteration_appended",
        iterationId: record.id,
        iteration: record.iteration,
        status: record.status,
        waitingFor: result.state.waitingFor,
        reviewState: result.state.phase,
      },
      now,
    );
    if (input.verifier) {
      this.appendRunEvent(
        result.state.runId,
        "updated",
        {
          change: "verifier_updated",
          iterationId: record.id,
          verdict: verifier.verdict,
          blocker: verifier.blocker,
          sourceKind: verifier.sourceKind,
          sourceRef: verifier.sourceRef,
        },
        now,
      );
    }
    if (input.critiqueLinks && input.critiqueLinks.length > 0) {
      this.appendRunEvent(
        result.state.runId,
        "updated",
        {
          change: "critique_links_updated",
          iterationId: record.id,
          critiqueIds: critiqueLinks.map((link) => link.critiqueId),
          waitingFor: result.state.waitingFor,
        },
        now,
      );
    }
    if (decision) {
      this.appendRunEvent(
        result.state.runId,
        "decision_recorded",
        {
          change: "iteration_decision_recorded",
          iterationId: record.id,
          decision,
        },
        now,
      );
    }
    return result;
  }

  setVerifier(ref: string, input: Partial<RalphVerifierSummary>): RalphReadResult {
    const current = this.readRun(ref);
    const verifierSummary = mergeVerifierSummary(current.state.verifierSummary, {
      ...input,
      checkedAt: input.checkedAt ?? currentTimestamp(),
    });
    const waitingFor = waitingForFromReviewSignals(verifierSummary, current.state.critiqueLinks);
    const status = verifierSummary.blocker ? "waiting_for_review" : current.state.status;
    const phase = verifierSummary.blocker ? "reviewing" : current.state.phase;
    const result = this.writeArtifacts({
      ...current.state,
      verifierSummary,
      waitingFor,
      status,
      phase,
      updatedAt: currentTimestamp(),
    });
    this.appendRunEvent(
      result.state.runId,
      "updated",
      {
        change: "verifier_updated",
        verdict: verifierSummary.verdict,
        blocker: verifierSummary.blocker,
        sourceKind: verifierSummary.sourceKind,
        sourceRef: verifierSummary.sourceRef,
        waitingFor: result.state.waitingFor,
      },
      result.state.updatedAt,
    );
    return result;
  }

  linkCritique(ref: string, input: LinkRalphCritiqueInput): RalphReadResult {
    const current = this.readRun(ref);
    const link = normalizeCritiqueLink({
      critiqueId: input.critiqueId,
      kind: input.kind ?? "context",
      verdict: input.verdict ?? null,
      required: input.required === true,
      blocking: input.blocking === true,
      reviewedAt: input.reviewedAt ?? currentTimestamp(),
      findingIds: input.findingIds ?? [],
      summary: input.summary?.trim() ?? "",
    });
    const critiqueLinks = mergeCritiqueLinks(current.state.critiqueLinks, [link]);
    const waitingFor = waitingForFromReviewSignals(current.state.verifierSummary, critiqueLinks);
    const result = this.writeArtifacts({
      ...current.state,
      linkedRefs: mergeLinkedRefs(current.state.linkedRefs, { critiqueIds: [link.critiqueId] }),
      critiqueLinks,
      waitingFor,
      status: waitingFor === "none" ? current.state.status : "waiting_for_review",
      phase: waitingFor === "none" ? current.state.phase : "reviewing",
      updatedAt: currentTimestamp(),
    });
    this.appendRunEvent(
      result.state.runId,
      "updated",
      {
        change: "critique_linked",
        critiqueId: link.critiqueId,
        kind: link.kind,
        verdict: link.verdict,
        blocking: link.blocking,
        required: link.required,
        waitingFor: result.state.waitingFor,
      },
      result.state.updatedAt,
    );
    return result;
  }

  decideRun(ref: string, input: DecideRalphRunInput): RalphReadResult {
    const current = this.readRun(ref);
    const decision = this.buildDecision(current.state, input);
    const result = this.writeArtifacts(this.applyDecision(current.state, decision));
    this.appendRunEvent(
      result.state.runId,
      "decision_recorded",
      {
        change: "run_decision_recorded",
        decision,
        status: result.state.status,
        phase: result.state.phase,
        waitingFor: result.state.waitingFor,
      },
      decision.decidedAt,
    );
    return result;
  }

  prepareLaunch(ref: string, input: PrepareRalphLaunchInput = {}): RalphReadResult {
    const current = this.readRun(ref);
    if (["completed", "halted", "failed", "archived"].includes(current.state.status)) {
      throw new Error(`Ralph run ${current.state.runId} cannot launch from status ${current.state.status}.`);
    }
    if (current.state.waitingFor !== "none") {
      throw new Error(
        `Ralph run ${current.state.runId} is waiting for ${current.state.waitingFor} and cannot launch until that gate is cleared.`,
      );
    }

    let latest = this.latestIterationById(current.iterations, current.state.nextIterationId);
    if (!latest || isPostIterationStatus(latest.status)) {
      const prepared = this.appendIteration(ref, {
        status: "pending",
        focus: input.focus ?? current.state.objective,
        summary: input.resume
          ? "Prepared the next Ralph resume iteration."
          : "Prepared the next Ralph launch iteration.",
      });
      latest = prepared.iterations.at(-1) ?? null;
    }
    if (!latest) {
      throw new Error(`Unable to prepare a Ralph iteration for ${current.state.runId}`);
    }

    const nextState: RalphRunState = {
      ...this.readRun(ref).state,
      status: "active",
      phase: "executing",
      waitingFor: "none",
      nextIterationId: latest.id,
      nextLaunch: normalizeNextLaunchState({
        runtime: "subprocess",
        resume: input.resume === true,
        preparedAt: currentTimestamp(),
        instructions:
          input.instructions !== undefined ? normalizeStringList(input.instructions) : current.state.nextLaunch.instructions,
      }),
      updatedAt: currentTimestamp(),
      stopReason: null,
    };
    const launch = this.createLaunchDescriptor(nextState, latest, input);
    const result = this.writeArtifacts(nextState, launch);
    this.appendRunEvent(
      result.state.runId,
      "updated",
      {
        change: input.resume ? "launch_resumed" : "launch_prepared",
        iterationId: latest.id,
        iteration: latest.iteration,
        resume: launch.resume,
        runtime: launch.runtime,
        preparedAt: launch.createdAt,
      },
      launch.createdAt,
    );
    return result;
  }

  resumeRun(ref: string, input: Omit<PrepareRalphLaunchInput, "resume"> = {}): RalphReadResult {
    return this.prepareLaunch(ref, { ...input, resume: true });
  }

  cancelLaunch(
    ref: string,
    previousState: RalphRunState,
    preparedIterationId: string,
    summary?: string,
  ): RalphReadResult {
    const current = this.readRun(ref);
    const iteration = this.latestIterationById(current.iterations, preparedIterationId);
    const nextIterations =
      iteration && iteration.status === "pending"
        ? latestById([
            ...current.iterations,
            {
              ...iteration,
              status: "cancelled" as const,
              completedAt: currentTimestamp(),
              summary: summary?.trim() || "Interactive Ralph launch was cancelled before a worker session started.",
              workerSummary: "No worker session was created.",
              notes: normalizeStringList([...(iteration.notes ?? []), "Launch cancelled before session start."]),
            },
          ]).sort((left, right) => left.iteration - right.iteration)
        : current.iterations;

    const nextState: RalphRunState = {
      ...previousState,
      lastIterationNumber: Math.max(
        previousState.lastIterationNumber,
        iteration?.iteration ?? previousState.lastIterationNumber,
      ),
      nextIterationId: previousState.nextIterationId,
      nextLaunch: previousState.nextLaunch,
      updatedAt: currentTimestamp(),
    };
    return this.writeArtifacts(nextState, undefined, nextIterations);
  }

  archiveRun(ref: string): RalphReadResult {
    const current = this.readRun(ref);
    return this.writeArtifacts({
      ...current.state,
      status: "archived",
      phase: "halted",
      waitingFor: "none",
      nextIterationId: null,
      nextLaunch: clearPreparedLaunchState(current.state.nextLaunch, []),
      updatedAt: currentTimestamp(),
    });
  }

  async initLedgerAsync(): Promise<{ initialized: true; root: string }> {
    return this.initLedger();
  }

  async listRunsAsync(filter: RalphListFilter = {}): Promise<ReturnType<RalphStore["listRuns"]>> {
    return this.listRuns(filter);
  }

  async readRunAsync(ref: string): Promise<RalphReadResult> {
    return this.readRun(ref);
  }

  async createRunAsync(input: CreateRalphRunInput): Promise<RalphReadResult> {
    return this.createRun(input);
  }

  async updateRunAsync(ref: string, input: UpdateRalphRunInput): Promise<RalphReadResult> {
    return this.updateRun(ref, input);
  }

  async appendIterationAsync(ref: string, input: AppendRalphIterationInput): Promise<RalphReadResult> {
    return this.appendIteration(ref, input);
  }

  async setVerifierAsync(ref: string, input: Partial<RalphVerifierSummary>): Promise<RalphReadResult> {
    return this.setVerifier(ref, input);
  }

  async linkCritiqueAsync(ref: string, input: LinkRalphCritiqueInput): Promise<RalphReadResult> {
    return this.linkCritique(ref, input);
  }

  async decideRunAsync(ref: string, input: DecideRalphRunInput): Promise<RalphReadResult> {
    return this.decideRun(ref, input);
  }

  async prepareLaunchAsync(ref: string, input: PrepareRalphLaunchInput = {}): Promise<RalphReadResult> {
    return this.prepareLaunch(ref, input);
  }

  async resumeRunAsync(ref: string, input: Omit<PrepareRalphLaunchInput, "resume"> = {}): Promise<RalphReadResult> {
    return this.resumeRun(ref, input);
  }

  async cancelLaunchAsync(
    ref: string,
    previousState: RalphRunState,
    preparedIterationId: string,
    summary?: string,
  ): Promise<RalphReadResult> {
    return this.cancelLaunch(ref, previousState, preparedIterationId, summary);
  }

  async archiveRunAsync(ref: string): Promise<RalphReadResult> {
    return this.archiveRun(ref);
  }
}

export function createRalphStore(cwd: string): RalphStore {
  return new RalphStore(cwd);
}
