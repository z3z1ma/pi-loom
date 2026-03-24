import { resolve } from "node:path";
import {
  hasProjectedArtifactAttributes,
  type ProjectedArtifactEntityAttributes,
  projectedArtifactAttributes,
} from "#storage/artifacts.js";
import { createEntityId, createLinkId, createRandomLoomId } from "#storage/ids.js";
import type { ProjectedEntityLinkInput } from "#storage/links.js";
import { filterAndSortListEntries } from "#storage/list-search.js";
import { getLoomCatalogPaths } from "#storage/locations.js";
import { readRuntimeScopeFromEnv } from "#storage/runtime-scope.js";
import { openScopedWorkspaceStorageSync } from "#storage/workspace.js";
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
  RalphIterationRuntimeRecord,
  RalphIterationStatus,
  RalphLaunchDescriptor,
  RalphLinkedRefs,
  RalphListFilter,
  RalphNextLaunchState,
  RalphPacketContext,
  RalphPolicyMode,
  RalphPolicySnapshot,
  RalphPostIterationState,
  RalphReadResult,
  RalphRunPhase,
  RalphRunScope,
  RalphRunState,
  RalphRunStatus,
  RalphRunSummary,
  RalphRuntimeArtifactStatus,
  RalphRuntimeEvent,
  RalphSchedulerState,
  RalphSteeringEntry,
  RalphStopRequest,
  RalphVerifierSourceKind,
  RalphVerifierSummary,
  RalphVerifierVerdict,
  RalphWaitingFor,
  UpdateRalphRunInput,
  UpsertRalphIterationRuntimeInput,
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
  RALPH_RUNTIME_ARTIFACT_STATUSES,
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
  deriveRalphRunId,
  getRalphArtifactPaths,
  getRalphRunDir,
  normalizeRalphRunId,
  normalizeRalphRunRef,
} from "./paths.js";
import { renderRalphMarkdown } from "./render.js";

const ENTITY_KIND = "ralph_run" as const;
const RALPH_LINK_PROJECTION_OWNER = "ralph-store";
const RALPH_EVENT_ACTOR = "ralph-store";
const RALPH_ITERATION_PROJECTION_OWNER = "ralph-iterations";
const RALPH_ITERATION_ARTIFACT_TYPE = "ralph-iteration";
const RALPH_RUNTIME_PROJECTION_OWNER = "ralph-runtime";
const TICKET_ONLY_PLAN_KEY = "ticket-only";
const RALPH_RUNTIME_ARTIFACT_TYPE = "ralph-runtime";

interface RalphEntityAttributes {
  state: RalphRunState;
}

function hasStructuredRalphAttributes(attributes: unknown): attributes is RalphEntityAttributes {
  return Boolean(attributes && typeof attributes === "object" && "state" in attributes);
}

interface RalphIterationArtifactPayload extends Record<string, unknown> {
  iteration: RalphIterationRecord;
}

interface RalphRuntimeArtifactPayload extends Record<string, unknown> {
  runtime: RalphIterationRuntimeRecord;
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

function isRalphRuntimeArtifactAttributes(
  attributes: Record<string, unknown>,
): attributes is ProjectedArtifactEntityAttributes<RalphRuntimeArtifactPayload> {
  return (
    hasProjectedArtifactAttributes(attributes) &&
    attributes.projectionOwner === RALPH_RUNTIME_PROJECTION_OWNER &&
    attributes.artifactType === RALPH_RUNTIME_ARTIFACT_TYPE
  );
}

interface StoredRalphEntityRow {
  id: string;
  space_id: string;
  display_id: string | null;
  version: number;
  created_at: string;
  attributes_json: string;
}

function openRalphCatalogSync(cwd: string) {
  return openScopedWorkspaceStorageSync(cwd, readRuntimeScopeFromEnv());
}

interface RalphArtifactRow {
  id: string;
  display_id: string | null;
  version: number;
  created_at: string;
  attributes_json: string;
}

interface RalphReadCacheEntry {
  updatedAt: string;
  result: RalphReadResult;
}

const ralphReadResultCache = new Map<string, RalphReadCacheEntry>();

function ralphReadCacheKey(cwd: string, runId: string): string {
  return `${resolve(cwd)}::${runId}`;
}

function listOwnedArtifactRowsSync(
  cwd: string,
  owner: { entityId: string; spaceId: string },
  projectionOwner: string,
  artifactType: string,
): RalphArtifactRow[] {
  const { storage } = openRalphCatalogSync(cwd);
  const rows = storage.db
    .prepare(
      `
        SELECT e.id, e.display_id, e.version, e.created_at, e.attributes_json
        FROM links l
        JOIN entities e ON e.id = l.from_entity_id
        WHERE l.kind = ?
          AND l.to_entity_id = ?
          AND e.space_id = ?
          AND e.kind = ?
      `,
    )
    .all("belongs_to", owner.entityId, owner.spaceId, "artifact") as RalphArtifactRow[];

  return rows.filter((row) => {
    const attributes = parseStoredJson<Record<string, unknown>>(row.attributes_json, {});
    return (
      hasProjectedArtifactAttributes(attributes) &&
      attributes.projectionOwner === projectionOwner &&
      attributes.artifactType === artifactType &&
      attributes.owner.entityId === owner.entityId
    );
  });
}

function parseStoredJson<T>(value: string, fallback: T): T {
  if (!value.trim()) {
    return fallback;
  }
  return JSON.parse(value) as T;
}

function resolveOwningRepositoryId(
  storage: ReturnType<typeof openRalphCatalogSync>["storage"],
  repositoryId: string | null | undefined,
): string | null {
  if (!repositoryId) {
    return null;
  }
  const row = storage.db.prepare("SELECT id FROM repositories WHERE id = ? LIMIT 1").get(repositoryId) as
    | { id: string }
    | undefined;
  return row?.id ?? null;
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
      "SELECT id, space_id, display_id, version, created_at, attributes_json FROM entities WHERE space_id = ? AND kind = ? AND display_id = ? LIMIT 1",
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
    record.dashboard.latestBoundedIteration?.summary ?? "",
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
        { value: record.dashboard.latestBoundedIteration?.summary, weight: 5 },
        { value: ralphSearchText(record).join(" "), weight: 3 },
      ],
    })),
    { text: filter.text, sort: filter.sort },
  );
}

function normalizeNextLaunchState(input: Partial<RalphNextLaunchState> | null | undefined): RalphNextLaunchState {
  return {
    runtime: input?.runtime === "session" || input?.runtime === "descriptor_only" ? input.runtime : null,
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

function normalizeRuntimeUsage(input: Partial<RalphIterationRuntimeRecord["usage"]> | undefined) {
  const measured = input?.measured === true;
  const inputTokens =
    typeof input?.input === "number" && Number.isFinite(input.input) && input.input > 0 ? input.input : 0;
  const outputTokens =
    typeof input?.output === "number" && Number.isFinite(input.output) && input.output > 0 ? input.output : 0;
  const cacheReadTokens =
    typeof input?.cacheRead === "number" && Number.isFinite(input.cacheRead) && input.cacheRead > 0
      ? input.cacheRead
      : 0;
  const cacheWriteTokens =
    typeof input?.cacheWrite === "number" && Number.isFinite(input.cacheWrite) && input.cacheWrite > 0
      ? input.cacheWrite
      : 0;
  const totalTokens =
    typeof input?.totalTokens === "number" && Number.isFinite(input.totalTokens) && input.totalTokens > 0
      ? input.totalTokens
      : inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;
  return {
    measured,
    input: inputTokens,
    output: outputTokens,
    cacheRead: cacheReadTokens,
    cacheWrite: cacheWriteTokens,
    totalTokens,
  };
}

function normalizeRuntimeArtifactStatus(value: string | null | undefined): RalphRuntimeArtifactStatus {
  return expectEnum("Ralph runtime artifact status", value, RALPH_RUNTIME_ARTIFACT_STATUSES, "queued");
}

function normalizeRuntimeEvent(event: RalphRuntimeEvent): RalphRuntimeEvent {
  if (event.type === "assistant_message") {
    return { ...event, text: event.text.trim(), at: event.at };
  }
  if (event.type === "tool_execution") {
    return {
      ...event,
      phase: event.phase,
      toolName: event.toolName.trim(),
      toolCallId: normalizeOptionalString(event.toolCallId),
      errorMessage: normalizeOptionalString(event.errorMessage),
      at: event.at,
    };
  }
  return { ...event, at: event.at };
}

function normalizeRuntimeEvents(events: readonly RalphRuntimeEvent[] | undefined): RalphRuntimeEvent[] {
  return (events ?? []).map((event) => normalizeRuntimeEvent(event));
}

function normalizeRuntimeScope(
  scope:
    | RalphIterationRuntimeRecord["runtimeScope"]
    | UpsertRalphIterationRuntimeInput["runtimeScope"]
    | null
    | undefined,
): RalphIterationRuntimeRecord["runtimeScope"] {
  const spaceId = normalizeOptionalString(scope?.spaceId);
  const repositoryId = normalizeOptionalString(scope?.repositoryId);
  const worktreeId = normalizeOptionalString(scope?.worktreeId);
  const worktreePath = normalizeOptionalString(scope?.worktreePath);
  if (!spaceId || !repositoryId || !worktreeId || !worktreePath) {
    return null;
  }
  return { spaceId, repositoryId, worktreeId, worktreePath };
}

function normalizeRuntimeRecord(record: RalphIterationRuntimeRecord): RalphIterationRuntimeRecord {
  const legacyRecord = record as RalphIterationRuntimeRecord & { missingCheckpoint?: boolean };
  return {
    id: record.id.trim(),
    runId: normalizeRalphRunId(record.runId),
    iterationId: record.iterationId.trim(),
    iteration: Math.max(1, Math.floor(record.iteration)),
    status: normalizeRuntimeArtifactStatus(record.status),
    runtimeScope: normalizeRuntimeScope(record.runtimeScope),
    startedAt: record.startedAt,
    updatedAt: record.updatedAt,
    completedAt: normalizeOptionalString(record.completedAt),
    command: record.command.trim(),
    args: normalizeStringList(record.args),
    exitCode: typeof record.exitCode === "number" && Number.isFinite(record.exitCode) ? record.exitCode : null,
    output: record.output,
    stderr: record.stderr,
    usage: normalizeRuntimeUsage(record.usage),
    events: normalizeRuntimeEvents(record.events),
    launch: {
      ...record.launch,
      runId: normalizeRalphRunId(record.launch.runId),
      iterationId: record.launch.iterationId.trim(),
      iteration: Math.max(1, Math.floor(record.launch.iteration)),
      ticketRef: normalizeOptionalString(record.launch.ticketRef) ?? "(unbound-ticket)",
      planRef: normalizeOptionalString(record.launch.planRef),
      instructions: normalizeStringList(record.launch.instructions),
    },
    missingTicketActivity: record.missingTicketActivity === true || legacyRecord.missingCheckpoint === true,
    jobId: normalizeOptionalString(record.jobId),
  };
}

function toRalphIterationArtifactDisplayId(runId: string, iterationId: string): string {
  return `ralph-run:${runId}:iteration:${iterationId}`;
}

function toRalphRuntimeArtifactDisplayId(runId: string, iterationId: string): string {
  return `ralph-run:${runId}:runtime:${iterationId}`;
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

function buildRuntimeArtifactTitle(runTitle: string, runtime: RalphIterationRuntimeRecord): string {
  return `${runTitle} runtime ${runtime.iteration}`;
}

function buildRuntimeArtifactSummary(runtime: RalphIterationRuntimeRecord): string {
  const scopeSummary = runtime.runtimeScope
    ? ` repository=${runtime.runtimeScope.repositoryId} worktree=${runtime.runtimeScope.worktreeId}`
    : "";
  return summarizeText(
    `${runtime.status}${scopeSummary} ${runtime.stderr} ${runtime.output}`,
    `Ralph runtime ${runtime.iteration} for ${runtime.runId}.${scopeSummary}`,
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
  storage.db
    .prepare(
      `
        INSERT INTO events (id, entity_id, kind, sequence, created_at, actor, payload_json)
        VALUES (?, ?, ?, COALESCE((SELECT MAX(sequence) + 1 FROM events WHERE entity_id = ?), 1), ?, ?, ?)
      `,
    )
    .run(createRandomLoomId("event"), entityId, kind, entityId, createdAt, RALPH_EVENT_ACTOR, JSON.stringify(payload));
}

function syncIterationArtifactsSync(
  cwd: string,
  owner: { entityId: string; displayId: string; title: string; spaceId: string; repositoryId: string | null },
  iterations: RalphIterationRecord[],
  timestamp: string,
): void {
  const { storage } = openRalphCatalogSync(cwd);
  const managed = listOwnedArtifactRowsSync(
    cwd,
    owner,
    RALPH_ITERATION_PROJECTION_OWNER,
    RALPH_ITERATION_ARTIFACT_TYPE,
  );
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

function syncRuntimeArtifactsSync(
  cwd: string,
  owner: { entityId: string; displayId: string; title: string; spaceId: string; repositoryId: string | null },
  runtimeArtifacts: RalphIterationRuntimeRecord[],
  timestamp: string,
): void {
  const { storage } = openRalphCatalogSync(cwd);
  const managed = listOwnedArtifactRowsSync(cwd, owner, RALPH_RUNTIME_PROJECTION_OWNER, RALPH_RUNTIME_ARTIFACT_TYPE);
  const existingByDisplayId = new Map(managed.map((row) => [row.display_id ?? row.id, row]));
  const desiredDisplayIds = new Set<string>();

  for (const runtimeArtifact of runtimeArtifacts) {
    const displayId = toRalphRuntimeArtifactDisplayId(owner.displayId, runtimeArtifact.iterationId);
    desiredDisplayIds.add(displayId);
    const existing = existingByDisplayId.get(displayId);
    const artifactId =
      existing?.id ??
      createEntityId("artifact", owner.spaceId, displayId, `${RALPH_RUNTIME_ARTIFACT_TYPE}:${displayId}`);
    upsertEntitySync(cwd, {
      id: artifactId,
      kind: "artifact",
      spaceId: owner.spaceId,
      owningRepositoryId: owner.repositoryId,
      displayId,
      title: buildRuntimeArtifactTitle(owner.title, runtimeArtifact),
      summary: buildRuntimeArtifactSummary(runtimeArtifact),
      status: runtimeArtifact.status,
      version: (existing?.version ?? 0) + 1,
      tags: [RALPH_RUNTIME_ARTIFACT_TYPE, owner.displayId, runtimeArtifact.status],
      attributes: projectedArtifactAttributes(
        RALPH_RUNTIME_PROJECTION_OWNER,
        RALPH_RUNTIME_ARTIFACT_TYPE,
        { entityId: owner.entityId, kind: ENTITY_KIND, displayId: owner.displayId },
        { runtime: runtimeArtifact },
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
        JSON.stringify({ projectionOwner: `${RALPH_RUNTIME_PROJECTION_OWNER}:links` }),
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

function normalizeRunScope(
  input: Partial<RalphRunScope> | RalphRunScope | undefined,
  linkedRefs?: Partial<RalphLinkedRefs>,
): RalphRunScope {
  const inferredTicketId =
    normalizeOptionalString(input?.ticketId) ?? normalizeOptionalString(linkedRefs?.ticketIds?.[0]);
  const inferredPlanId = normalizeOptionalString(input?.planId) ?? normalizeOptionalString(linkedRefs?.planIds?.[0]);
  const inferredSpecId =
    normalizeOptionalString(input?.specChangeId) ?? normalizeOptionalString(linkedRefs?.specChangeIds?.[0]);
  const mode = input?.mode === "execute" || (input?.mode !== "plan" && inferredTicketId !== null) ? "execute" : "plan";
  return {
    mode,
    repositoryId: normalizeOptionalString(input?.repositoryId),
    specChangeId: inferredSpecId,
    planId: mode === "execute" ? inferredPlanId : inferredPlanId,
    ticketId: mode === "execute" ? inferredTicketId : null,
    roadmapItemIds: normalizeStringList(input?.roadmapItemIds ?? linkedRefs?.roadmapItemIds),
    initiativeIds: normalizeStringList(input?.initiativeIds ?? linkedRefs?.initiativeIds),
    researchIds: normalizeStringList(input?.researchIds ?? linkedRefs?.researchIds),
    critiqueIds: normalizeStringList(input?.critiqueIds ?? linkedRefs?.critiqueIds),
    docIds: normalizeStringList(input?.docIds ?? linkedRefs?.docIds),
  };
}

function linkedRefsFromScope(scope: RalphRunScope): Partial<RalphLinkedRefs> {
  return {
    roadmapItemIds: scope.roadmapItemIds,
    initiativeIds: scope.initiativeIds,
    researchIds: scope.researchIds,
    specChangeIds: scope.specChangeId ? [scope.specChangeId] : [],
    ticketIds: scope.ticketId ? [scope.ticketId] : [],
    critiqueIds: scope.critiqueIds,
    docIds: scope.docIds,
    planIds: scope.planId ? [scope.planId] : [],
  };
}

function normalizePacketContext(
  input: Partial<RalphPacketContext> | RalphPacketContext | undefined,
): RalphPacketContext {
  return {
    capturedAt: normalizeOptionalString(input?.capturedAt) ?? currentTimestamp(),
    constitutionBrief: input?.constitutionBrief?.trim() ?? "",
    specContext: normalizeOptionalString(input?.specContext),
    planContext: normalizeOptionalString(input?.planContext),
    ticketContext: normalizeOptionalString(input?.ticketContext),
    priorIterationLearnings: normalizeStringList(input?.priorIterationLearnings),
    operatorNotes: normalizeOptionalString(input?.operatorNotes),
  };
}

function normalizeSteeringQueue(entries: readonly RalphSteeringEntry[] | null | undefined): RalphSteeringEntry[] {
  if (!entries) {
    return [];
  }
  const latest = new Map<string, RalphSteeringEntry>();
  for (const entry of entries) {
    const id = entry.id.trim();
    if (!id) {
      continue;
    }
    latest.set(id, {
      id,
      text: entry.text.trim(),
      createdAt: entry.createdAt,
      source: "operator",
      consumedAt: normalizeOptionalString(entry.consumedAt),
      consumedIterationId: normalizeOptionalString(entry.consumedIterationId),
    });
  }
  return [...latest.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function normalizeStopRequest(input: RalphStopRequest | null | undefined): RalphStopRequest | null {
  if (!input) {
    return null;
  }
  return {
    requestedAt: input.requestedAt,
    requestedBy: "operator",
    summary: input.summary.trim(),
    cancelRunning: input.cancelRunning !== false,
    handledAt: normalizeOptionalString(input.handledAt),
  };
}

function normalizeSchedulerState(
  input: Partial<RalphSchedulerState> | RalphSchedulerState | undefined,
): RalphSchedulerState {
  const status =
    input?.status === "running" ||
    input?.status === "waiting" ||
    input?.status === "stopping" ||
    input?.status === "completed"
      ? input.status
      : "idle";
  return {
    status,
    updatedAt: normalizeOptionalString(input?.updatedAt),
    jobId: normalizeOptionalString(input?.jobId),
    note: normalizeOptionalString(input?.note),
  };
}

function mergeSchedulerState(
  current: RalphSchedulerState,
  input: Partial<RalphSchedulerState> | undefined,
): RalphSchedulerState {
  if (!input) {
    return current;
  }
  return normalizeSchedulerState({ ...current, ...input });
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

function assertProjectedRalphLinksResolvable(
  cwd: string,
  spaceId: string,
  desired: readonly ProjectedEntityLinkInput[],
): void {
  const { storage } = openRalphCatalogSync(cwd);
  const findTarget = storage.db.prepare(
    "SELECT id FROM entities WHERE space_id = ? AND kind = ? AND display_id = ? LIMIT 1",
  );
  const missingTargets: Array<{ kind: string; displayId: string }> = [];

  for (const link of desired) {
    const targetDisplayId = link.targetDisplayId.trim();
    if (!targetDisplayId) {
      if (link.required !== false) {
        missingTargets.push({ kind: link.targetKind, displayId: "(empty)" });
      }
      continue;
    }

    const target = findTarget.get(spaceId, link.targetKind, targetDisplayId) as { id: string } | undefined;
    if (!target && link.required !== false) {
      missingTargets.push({ kind: link.targetKind, displayId: targetDisplayId });
    }
  }

  if (missingTargets.length > 0) {
    throw new Error(
      `Ralph projected link sync cannot resolve: ${missingTargets
        .map((target) => `${target.kind}:${target.displayId}`)
        .join(", ")}`,
    );
  }
}

function syncProjectedRalphLinksSync(
  cwd: string,
  input: {
    spaceId: string;
    fromEntityId: string;
    projectionOwner: string;
    desired: readonly ProjectedEntityLinkInput[];
    timestamp: string;
  },
): void {
  const { storage } = openRalphCatalogSync(cwd);
  const findTarget = storage.db.prepare(
    "SELECT id FROM entities WHERE space_id = ? AND kind = ? AND display_id = ? LIMIT 1",
  );
  const existingManaged = (
    storage.db
      .prepare(
        "SELECT id, kind, to_entity_id, metadata_json, created_at FROM links WHERE from_entity_id = ? ORDER BY id",
      )
      .all(input.fromEntityId) as Array<{
      id: string;
      kind: string;
      to_entity_id: string;
      metadata_json: string;
      created_at: string;
    }>
  ).filter((row) => {
    const metadata = parseStoredJson<Record<string, unknown>>(row.metadata_json, {});
    return metadata.projectionOwner === input.projectionOwner;
  });
  const existingById = new Map(existingManaged.map((row) => [row.id, row]));
  const desiredById = new Map<
    string,
    { id: string; kind: string; toEntityId: string; createdAt: string; metadata: Record<string, unknown> }
  >();

  for (const link of input.desired) {
    const targetDisplayId = link.targetDisplayId.trim();
    if (!targetDisplayId) {
      continue;
    }

    const target = findTarget.get(input.spaceId, link.targetKind, targetDisplayId) as { id: string } | undefined;
    if (!target) {
      continue;
    }

    const linkId = createLinkId(link.kind, input.fromEntityId, target.id);
    const existing = existingById.get(linkId);
    desiredById.set(linkId, {
      id: linkId,
      kind: link.kind,
      toEntityId: target.id,
      createdAt: existing?.created_at ?? input.timestamp,
      metadata: { ...(link.metadata ?? {}), projectionOwner: input.projectionOwner },
    });
  }

  const appendProjectionEvent = (kind: "linked" | "unlinked", payload: Record<string, unknown>) => {
    storage.db
      .prepare(
        `
          INSERT INTO events (id, entity_id, kind, sequence, created_at, actor, payload_json)
          VALUES (?, ?, ?, COALESCE((SELECT MAX(sequence) + 1 FROM events WHERE entity_id = ?), 1), ?, ?, ?)
        `,
      )
      .run(
        createRandomLoomId("event"),
        input.fromEntityId,
        kind,
        input.fromEntityId,
        input.timestamp,
        input.projectionOwner,
        JSON.stringify(payload),
      );
  };

  for (const record of desiredById.values()) {
    const existing = existingById.get(record.id);
    storage.db
      .prepare(
        `
          INSERT INTO links (id, kind, from_entity_id, to_entity_id, metadata_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            kind = excluded.kind,
            from_entity_id = excluded.from_entity_id,
            to_entity_id = excluded.to_entity_id,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        record.id,
        record.kind,
        input.fromEntityId,
        record.toEntityId,
        JSON.stringify(record.metadata),
        record.createdAt,
        input.timestamp,
      );
    if (!existing) {
      appendProjectionEvent("linked", {
        change: "projected_link_added",
        projectionOwner: input.projectionOwner,
        linkId: record.id,
        linkKind: record.kind,
        toEntityId: record.toEntityId,
      });
    }
  }

  for (const existing of existingManaged) {
    if (desiredById.has(existing.id)) {
      continue;
    }
    storage.db.prepare("DELETE FROM links WHERE id = ?").run(existing.id);
    appendProjectionEvent("unlinked", {
      change: "projected_link_removed",
      projectionOwner: input.projectionOwner,
      linkId: existing.id,
      linkKind: existing.kind,
      toEntityId: existing.to_entity_id,
    });
  }
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
    iterationId: normalizeOptionalString(input?.iterationId),
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
    scope: normalizeRunScope(record.scope),
    packetContext: normalizePacketContext(record.packetContext),
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
  return ["reviewing", "accepted", "rejected", "failed", "cancelled"].includes(status) ? currentTimestamp() : null;
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
    scope: iteration.scope,
    packetContext: iteration.packetContext,
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
    scope: normalizeRunScope((state as RalphRunState & { scope?: RalphRunScope }).scope, state.linkedRefs),
    activeTicketId: normalizeOptionalString(
      (state as RalphRunState & { activeTicketId?: string | null }).activeTicketId,
    ),
    executionEnv:
     (state as RalphRunState & { executionEnv?: Record<string, string> | null }).executionEnv ?? null,
    packetContext: normalizePacketContext(
      (state as RalphRunState & { packetContext?: RalphPacketContext }).packetContext,
    ),
    steeringQueue: normalizeSteeringQueue(
      (state as RalphRunState & { steeringQueue?: RalphSteeringEntry[] }).steeringQueue,
    ),
    stopRequest: normalizeStopRequest((state as RalphRunState & { stopRequest?: RalphStopRequest | null }).stopRequest),
    scheduler: normalizeSchedulerState((state as RalphRunState & { scheduler?: RalphSchedulerState }).scheduler),
    policySnapshot: normalizePolicySnapshot(state.policySnapshot),
    verifierSummary: normalizeVerifierSummary(state.verifierSummary),
    critiqueLinks: normalizeCritiqueLinks(state.critiqueLinks),
    latestDecision: normalizeDecision(state.latestDecision),
    latestDecisionIterationId: normalizeOptionalString(
      (state as RalphRunState & { latestDecisionIterationId?: string | null }).latestDecisionIterationId ??
        (state.postIteration?.decision ? state.postIteration.iterationId : null),
    ),
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
          scope: normalizeRunScope(
            (state.postIteration as RalphPostIterationState & { scope?: RalphRunScope }).scope,
            state.linkedRefs,
          ),
          packetContext: normalizePacketContext(
            (state.postIteration as RalphPostIterationState & { packetContext?: RalphPacketContext }).packetContext,
          ),
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
      (state as RalphRunState & { nextIterationId?: string | null; currentIterationId?: string | null })
        .nextIterationId ?? (state as RalphRunState & { currentIterationId?: string | null }).currentIterationId,
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

function verifierMatchesLatestIteration(state: RalphRunState, verifier: RalphVerifierSummary): boolean {
  const latestIterationId = state.postIteration?.iterationId ?? null;
  return latestIterationId === null || verifier.iterationId === latestIterationId;
}

function isLatestIterationWritable(
  state: RalphRunState,
  iterations: readonly RalphIterationRecord[],
  iterationId: string,
): boolean {
  if (["completed", "halted", "failed", "archived"].includes(state.status)) {
    return false;
  }
  const activeIteration = iterations.find((iteration) => iteration.id === iterationId) ?? null;
  if (activeIteration && !isPostIterationStatus(activeIteration.status)) {
    return true;
  }
  const matchesPreparedIteration = state.nextIterationId === iterationId;
  const matchesLatestIteration =
    state.postIteration?.iterationId === iterationId &&
    state.nextIterationId === null &&
    state.nextLaunch.runtime === null;
  return matchesPreparedIteration || matchesLatestIteration;
}

function createPacketSummary(state: RalphRunState): string {
  const scopeLabel = `looping plan ${state.scope.planId ?? "(none)"}${state.scope.specChangeId ? ` under spec ${state.scope.specChangeId}` : ""}${state.activeTicketId ? ` on ticket ${state.activeTicketId}` : ""}`;
  return summarizeText(
    `${state.title}. ${scopeLabel}. ${state.objective}`,
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
        }>(this.cwd, "constitution", "constitution");
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
    runtimeArtifacts: RalphIterationRuntimeRecord[],
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
          `- ticket activity summary: ${latestIteration.workerSummary || "(none)"}`,
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
          `- ticket activity summary: ${state.postIteration.workerSummary || "(none)"}`,
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
    const latestRuntime = runtimeArtifacts.at(-1) ?? null;
    const runtimeLines = latestRuntime
      ? [
          `- id: ${latestRuntime.id}`,
          `- iteration: ${latestRuntime.iteration}`,
          `- status: ${latestRuntime.status}`,
          `- repository: ${latestRuntime.runtimeScope?.repositoryId ?? "(none)"}`,
          `- worktree: ${latestRuntime.runtimeScope?.worktreeId ?? "(none)"}`,
          `- job: ${latestRuntime.jobId ?? "(none)"}`,
          `- started at: ${latestRuntime.startedAt}`,
          `- completed at: ${latestRuntime.completedAt ?? "(not completed)"}`,
          `- exit code: ${latestRuntime.exitCode ?? "(none)"}`,
          `- missing ticket activity: ${latestRuntime.missingTicketActivity ? "yes" : "no"}`,
          `- command: ${latestRuntime.command || "(none)"}`,
          `- events: ${latestRuntime.events.length}`,
        ].join("\n")
      : "(none yet)";

    return `${[
      `# Ralph Packet: ${state.title}`,
      renderSection(
        "Run State",
        [
          `- run id: ${state.runId}`,
          `- status: ${state.status}`,
          `- phase: ${state.phase}`,
          `- waiting for: ${state.waitingFor}`,
          `- stop reason: ${state.stopReason ?? "(none)"}`,
          `- last iteration number: ${state.lastIterationNumber}`,
        ].join("\n"),
      ),
      renderSection(
        "Authoritative Scope",
        [
          `- mode: ${state.scope.mode}`,
          `- governing spec: ${state.scope.specChangeId ?? "(none)"}`,
          `- governing plan: ${state.scope.planId ?? "(none)"}`,
          `- active ticket: ${state.activeTicketId ?? state.scope.ticketId ?? "(none)"}`,
          `- roadmap items: ${state.scope.roadmapItemIds.join(", ") || "(none)"}`,
          `- initiatives: ${state.scope.initiativeIds.join(", ") || "(none)"}`,
          `- research: ${state.scope.researchIds.join(", ") || "(none)"}`,
          `- critiques: ${state.scope.critiqueIds.join(", ") || "(none)"}`,
          `- docs: ${state.scope.docIds.join(", ") || "(none)"}`,
        ].join("\n"),
      ),
      renderSection("Objective", state.objective || "(none)"),
      renderSection("Summary", state.summary || "(none)"),
      renderSection("Constitution Brief", state.packetContext.constitutionBrief || "(none)"),
      renderSection("Spec Context", state.packetContext.specContext || "(none)"),
      renderSection("Plan Context", state.packetContext.planContext ?? "(none)"),
      renderSection("Ticket Context", state.packetContext.ticketContext ?? "(none)"),
      renderSection(
        "Prior Iteration Learnings",
        renderBulletList(
          state.packetContext.priorIterationLearnings.length > 0
            ? state.packetContext.priorIterationLearnings
            : ["(none)"],
        ),
      ),
      renderSection("Operator Notes", state.packetContext.operatorNotes ?? "(none)"),
      renderSection(
        "Steering Queue",
        renderBulletList(
          state.steeringQueue.filter((entry) => entry.consumedAt === null).map((entry) => entry.text).length > 0
            ? state.steeringQueue.filter((entry) => entry.consumedAt === null).map((entry) => entry.text)
            : ["(none)"],
        ),
      ),
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
      renderSection(
        "Loop Control",
        [
          `- scheduler: ${state.scheduler.status}`,
          `- scheduler job: ${state.scheduler.jobId ?? "(none)"}`,
          `- scheduler note: ${state.scheduler.note ?? "(none)"}`,
          `- stop request: ${state.stopRequest ? `${state.stopRequest.summary} @ ${state.stopRequest.requestedAt}` : "(none)"}`,
        ].join("\n"),
      ),
      renderSection("Latest Bounded Iteration", postIterationLines),
      renderSection("Next Launch State", nextLaunchLines),
      renderSection("Latest Runtime Artifact", runtimeLines),
      renderSection("Latest Iteration Ledger Entry", latestIterationLines),
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
          "- Execute only the authoritative active scope described above.",
          "- Treat the spec, plan, and ticket context in this packet as the canonical source for this iteration.",
          "- Leave durable evidence in the bound ticket ledger so Ralph can reconcile the latest bounded iteration after exit.",
          "- Do not report completion unless the current ticket or planning scope is actually complete and the policy gates permit stopping.",
        ].join("\n"),
      ),
    ].join("\n\n")}\n`;
  }

  private buildPacket(
    state: RalphRunState,
    iterations: RalphIterationRecord[],
    runtimeArtifacts: RalphIterationRuntimeRecord[],
  ): string {
    return this.renderPacket(state, iterations, runtimeArtifacts, this.resolvePacketContext(state));
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
    return listOwnedArtifactRowsSync(
      this.cwd,
      { entityId: row.id, spaceId: row.space_id },
      RALPH_ITERATION_PROJECTION_OWNER,
      RALPH_ITERATION_ARTIFACT_TYPE,
    )
      .map((artifact) => parseStoredJson<Record<string, unknown>>(artifact.attributes_json, {}))
      .filter(
        (attributes): attributes is ProjectedArtifactEntityAttributes<RalphIterationArtifactPayload> =>
          isRalphIterationArtifactAttributes(attributes) && attributes.owner.entityId === row.id,
      )
      .map((attributes) => normalizeIteration((attributes.payload as RalphIterationArtifactPayload).iteration))
      .sort((left, right) => left.iteration - right.iteration);
  }

  private readRuntimeArtifactHistory(runId: string): RalphIterationRuntimeRecord[] {
    const row = findStoredRalphRow(this.cwd, runId);
    if (!row) {
      return [];
    }
    return listOwnedArtifactRowsSync(
      this.cwd,
      { entityId: row.id, spaceId: row.space_id },
      RALPH_RUNTIME_PROJECTION_OWNER,
      RALPH_RUNTIME_ARTIFACT_TYPE,
    )
      .map((artifact) => parseStoredJson<Record<string, unknown>>(artifact.attributes_json, {}))
      .filter(
        (attributes): attributes is ProjectedArtifactEntityAttributes<RalphRuntimeArtifactPayload> =>
          isRalphRuntimeArtifactAttributes(attributes) && attributes.owner.entityId === row.id,
      )
      .map((attributes) => normalizeRuntimeRecord((attributes.payload as RalphRuntimeArtifactPayload).runtime))
      .sort((left, right) => left.iteration - right.iteration || left.updatedAt.localeCompare(right.updatedAt));
  }

  private readRuntimeArtifacts(runId: string): RalphIterationRuntimeRecord[] {
    return latestById(this.readRuntimeArtifactHistory(runId)).sort(
      (left, right) => left.iteration - right.iteration || left.updatedAt.localeCompare(right.updatedAt),
    );
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
      runtime: state.nextLaunch.runtime ?? (state.nextLaunch.preparedAt ? "session" : "descriptor_only"),
      ticketRef: state.scope.ticketId ?? state.activeTicketId ?? "(unbound-ticket)",
      planRef: state.scope.planId,
      packetRef: toRalphPacketRef(state.runId),
      launchRef: toRalphLaunchRef(state.runId),
      resume: state.nextLaunch.resume,
      instructions:
        state.nextLaunch.instructions.length > 0
          ? state.nextLaunch.instructions
          : [
              `Read ${toRalphPacketRef(state.runId)} before acting.`,
              `Update the bound ticket ledger durably for ${nextIteration.id}; Ralph will reconcile the latest bounded iteration after exit.`,
              "Execute exactly one bounded iteration and leave the truthful next-step state in the ticket before exiting.",
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
      ticketRef: state.scope.ticketId ?? state.activeTicketId ?? "(unbound-ticket)",
      planRef: state.scope.planId,
      packetRef: toRalphPacketRef(state.runId),
      launchRef: toRalphLaunchRef(state.runId),
      resume: state.nextLaunch.resume,
      instructions: [
        "Prepare one fresh Ralph iteration at a time.",
        `Read the canonical packet through ralph_read mode=packet ticketRef=${state.scope.ticketId ?? state.activeTicketId ?? "(unbound-ticket)"}${state.scope.planId ? ` planRef=${state.scope.planId}` : ""}.`,
        `Update the bound ticket ledger durably for ${iteration?.id ?? "iter-001"}; Ralph will reconcile the latest bounded iteration after exit.`,
      ],
    };
  }

  private cacheReadResult(record: RalphReadResult): RalphReadResult {
    ralphReadResultCache.set(ralphReadCacheKey(this.cwd, record.state.runId), {
      updatedAt: record.state.updatedAt,
      result: record,
    });
    return record;
  }

  private buildReadResult(
    state: RalphRunState,
    launchOverride?: RalphLaunchDescriptor | null,
    iterationsOverride?: RalphIterationRecord[],
    runtimeArtifactsOverride?: RalphIterationRuntimeRecord[],
  ): RalphReadResult {
    const artifacts = getRalphArtifactPaths(this.cwd, state.runId);
    const iterations = iterationsOverride ?? this.readIterations(state.runId);
    const runtimeArtifacts = runtimeArtifactsOverride ?? this.readRuntimeArtifacts(state.runId);
    const postIteration = toPostIterationState(
      [...iterations].reverse().find((iteration) => isPostIterationStatus(iteration.status)) ?? null,
    );
    const normalizedState: RalphRunState = {
      ...state,
      postIteration,
      lastIterationNumber: iterations.at(-1)?.iteration ?? state.lastIterationNumber,
      packetSummary: createPacketSummary(state),
    };
    const summary = this.summarizeRun(normalizedState, artifacts.dir);
    const packet = this.buildPacket(normalizedState, iterations, runtimeArtifacts);
    const run = renderRalphMarkdown(normalizedState, iterations, runtimeArtifacts);
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
      runtimeArtifacts,
    );

    return {
      state: normalizedState,
      summary,
      packet,
      run,
      iterations,
      runtimeArtifacts,
      launch,
      dashboard,
      artifacts,
    };
  }

  private writeArtifacts(
    state: RalphRunState,
    launchOverride?: RalphLaunchDescriptor | null,
    iterationsOverride?: RalphIterationRecord[],
    runtimeArtifactsOverride?: RalphIterationRuntimeRecord[],
  ): RalphReadResult {
    const record = this.buildReadResult(state, launchOverride, iterationsOverride, runtimeArtifactsOverride);
    const { storage, identity } = openRalphCatalogSync(this.cwd);
    const desiredProjectedLinks = buildProjectedRalphLinks(record.state);
    assertProjectedRalphLinksResolvable(this.cwd, identity.space.id, desiredProjectedLinks);
    const owningRepositoryId = resolveOwningRepositoryId(
      storage,
      record.state.scope.repositoryId ?? identity.repository?.id ?? null,
    );
    const existing = findStoredRalphRow(this.cwd, record.summary.id);
    const entityId =
      existing?.id ??
      createEntityId(ENTITY_KIND, identity.space.id, record.summary.id, `${ENTITY_KIND}:${record.summary.id}`);
    upsertEntitySync(this.cwd, {
      id: entityId,
      kind: ENTITY_KIND,
      spaceId: identity.space.id,
      owningRepositoryId,
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
        repositoryId: owningRepositoryId,
      },
      record.iterations,
      record.state.updatedAt,
    );
    syncRuntimeArtifactsSync(
      this.cwd,
      {
        entityId,
        displayId: record.summary.id,
        title: record.summary.title,
        spaceId: identity.space.id,
        repositoryId: owningRepositoryId,
      },
      record.runtimeArtifacts,
      record.state.updatedAt,
    );
    // Roadmap refs point at embedded constitution items, so phase 1 projects only canonical entity relationships.
    syncProjectedRalphLinksSync(this.cwd, {
      spaceId: identity.space.id,
      fromEntityId: entityId,
      projectionOwner: RALPH_LINK_PROJECTION_OWNER,
      desired: desiredProjectedLinks,
      timestamp: record.state.updatedAt,
    });
    return this.cacheReadResult(record);
  }

  private createDefaultState(input: CreateRalphRunInput, runId: string, timestamp: string): RalphRunState {
    const title = input.title.trim();
    if (!title) {
      throw new Error("Ralph run title is required");
    }
    const scope = normalizeRunScope(input.scope, input.linkedRefs);
    const linkedRefs = mergeLinkedRefs(normalizeLinkedRefs(input.linkedRefs), linkedRefsFromScope(scope));
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
      linkedRefs,
      scope,
      activeTicketId: normalizeOptionalString(input.activeTicketId) ?? scope.ticketId,
      executionEnv: input.executionEnv ?? null,
      packetContext: normalizePacketContext(input.packetContext),
      steeringQueue: normalizeSteeringQueue(input.steeringQueue),
      stopRequest: normalizeStopRequest(input.stopRequest),
      scheduler: normalizeSchedulerState(input.scheduler),
      policySnapshot: normalizePolicySnapshot(input.policySnapshot),
      verifierSummary: normalizeVerifierSummary(input.verifierSummary),
      critiqueLinks: normalizeCritiqueLinks(input.critiqueLinks),
      latestDecision: normalizeDecision(input.latestDecision),
      latestDecisionIterationId: null,
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
    const verifierIsFresh = verifierMatchesLatestIteration(state, state.verifierSummary);
    const verifierSatisfied =
      !state.policySnapshot.verifierRequired || (state.verifierSummary.verdict === "pass" && verifierIsFresh);
    const verifierBlocking = state.policySnapshot.verifierRequired && state.verifierSummary.blocker && verifierIsFresh;
    const blockingRefs = normalizeStringList([...(input.blockingRefs ?? []), ...blockingCritiques]);
    const latestStatus = state.postIteration?.status ?? null;

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
    if (input.queueTimeoutExceeded) {
      return {
        kind: "halt",
        reason: "queue_wait_timeout_exceeded",
        summary:
          input.summary?.trim() || "The Ralph run exceeded its configured wait for the session-runtime launch queue.",
        decidedAt: currentTimestamp(),
        decidedBy: "policy",
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
    if (verifierBlocking) {
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
    if (latestStatus === "rejected") {
      return {
        kind: "pause",
        reason: "manual_review_required",
        summary:
          input.summary?.trim() ||
          "The latest bounded iteration rejected the current Ralph scope and requires explicit revision planning before continuing.",
        decidedAt: currentTimestamp(),
        decidedBy: "policy",
        blockingRefs,
      };
    }

    if (
      latestStatus === "accepted" &&
      input.workerRequestedCompletion &&
      state.policySnapshot.stopWhenVerified &&
      verifierSatisfied
    ) {
      return {
        kind: "complete",
        reason: "goal_reached",
        summary:
          input.summary?.trim() ||
          `Ticket ${state.scope.ticketId ?? "(none)"} reached a verified stopping point under plan ${state.scope.planId ?? "(none)"}.`,
        decidedAt: currentTimestamp(),
        decidedBy,
        blockingRefs,
      };
    }

    if (latestStatus === "accepted") {
      return {
        kind: "continue",
        reason: input.workerRequestedCompletion ? "worker_requested_completion" : "unknown",
        summary:
          input.summary?.trim() ||
          (input.workerRequestedCompletion
            ? `The worker reported a truthful stopping point for ticket ${state.scope.ticketId ?? "(none)"}, but the Ralph run still needs another explicit iteration-level decision before stopping.`
            : `The bounded iteration finished for ticket ${state.scope.ticketId ?? "(none)"}. The Ralph run remains eligible for another iteration.`),
        decidedAt: currentTimestamp(),
        decidedBy,
        blockingRefs,
      };
    }

    if (input.workerRequestedCompletion) {
      return {
        kind: "continue",
        reason: "worker_requested_completion",
        summary:
          input.summary?.trim() ||
          (state.policySnapshot.stopWhenVerified && verifierSatisfied
            ? `The worker reported completion for ticket ${state.scope.ticketId ?? "(none)"}, but the run still needs an explicit completion decision.`
            : "The worker reported completion, but the managed loop still requires another explicit loop-level decision before stopping."),
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
      latestDecisionIterationId: state.postIteration?.iterationId ?? state.latestDecisionIterationId,
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
      runtime: "session",
      ticketRef: state.scope.ticketId ?? state.activeTicketId ?? "(unbound-ticket)",
      planRef: state.scope.planId,
      packetRef: toRalphPacketRef(state.runId),
      launchRef: toRalphLaunchRef(state.runId),
      resume: input.resume === true,
      instructions:
        state.nextLaunch.instructions.length > 0
          ? state.nextLaunch.instructions
          : [
              `Read the canonical packet through ralph_read mode=packet ticketRef=${state.scope.ticketId ?? state.activeTicketId ?? "(unbound-ticket)"}${state.scope.planId ? ` planRef=${state.scope.planId}` : ""}.`,
              `Update the bound ticket ledger durably for ${iteration.id}; Ralph will reconcile the latest bounded iteration after exit.`,
              "Execute exactly one bounded iteration and leave the truthful next-step state in the ticket before exiting.",
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
    const state = this.readState(runDir);
    const cached = ralphReadResultCache.get(ralphReadCacheKey(this.cwd, state.runId));
    if (cached && cached.updatedAt === state.updatedAt) {
      return cached.result;
    }
    return this.cacheReadResult(this.buildReadResult(state));
  }

  readRunSummary(ref: string): RalphRunSummary {
    this.initLedger();
    const runDir = this.resolveRunDirectory(ref);
    return this.summarizeRun(this.readState(runDir), runDir);
  }

  createRun(input: CreateRalphRunInput): RalphReadResult {
    this.initLedger();
    const timestamp = currentTimestamp();
    const scope = normalizeRunScope(input.scope, input.linkedRefs);
    if (!scope.ticketId) {
      throw new Error("Ralph runs require a ticket ref.");
    }
    const runId = deriveRalphRunId(scope.planId ?? TICKET_ONLY_PLAN_KEY, scope.ticketId);
    if (findStoredRalphRow(this.cwd, runId)) {
      throw new Error(`Ralph run already exists for ${scope.planId}/${scope.ticketId}: ${runId}`);
    }
    const state = this.createDefaultState({ ...input, scope }, runId, timestamp);
    return this.writeArtifacts(state, this.defaultLaunchDescriptor(state, null));
  }

  updateRun(ref: string, input: UpdateRalphRunInput): RalphReadResult {
    const current = this.readRun(ref);
    const waitingFor = input.waitingFor ? normalizeWaitingFor(input.waitingFor) : current.state.waitingFor;
    const scope = input.scope ? normalizeRunScope(input.scope, current.state.linkedRefs) : current.state.scope;
    const linkedRefs = mergeLinkedRefs(
      input.linkedRefs ? mergeLinkedRefs(current.state.linkedRefs, input.linkedRefs) : current.state.linkedRefs,
      linkedRefsFromScope(scope),
    );
    const nextState: RalphRunState = {
      ...current.state,
      title: input.title?.trim() || current.state.title,
      objective: input.objective?.trim() ?? current.state.objective,
      summary:
        input.summary !== undefined
          ? summarizeText(input.summary, current.state.summary || `Ralph run ${current.state.runId}`)
          : current.state.summary,
      linkedRefs,
      scope,
      activeTicketId:
        input.activeTicketId !== undefined
          ? normalizeOptionalString(input.activeTicketId)
          : (normalizeOptionalString(scope.ticketId) ?? current.state.activeTicketId),
      executionEnv: input.executionEnv !== undefined ? input.executionEnv : current.state.executionEnv,
      packetContext: input.packetContext ? normalizePacketContext(input.packetContext) : current.state.packetContext,
      steeringQueue: input.steeringQueue ? normalizeSteeringQueue(input.steeringQueue) : current.state.steeringQueue,
      stopRequest:
        input.stopRequest !== undefined ? normalizeStopRequest(input.stopRequest) : current.state.stopRequest,
      scheduler: mergeSchedulerState(current.state.scheduler, input.scheduler),
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
      stopReason:
        input.stopReason !== undefined
          ? (normalizeOptionalString(input.stopReason) as RalphContinuationDecision["reason"] | null)
          : current.state.stopReason,
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
    if (input.requireActiveIteration === true && !isLatestIterationWritable(current.state, latestIterations, id)) {
      throw new Error(
        `Ralph run ${current.state.runId} cannot update iteration ${id} because it is not the active or latest writable iteration.`,
      );
    }
    const iterationNumber = existing?.iteration ?? current.state.lastIterationNumber + 1;
    const status = normalizeIterationStatus(
      input.status ?? existing?.status ?? (existing ? existing.status : "pending"),
    );
    const verifier = normalizeVerifierSummary({
      ...(existing?.verifier ?? {}),
      ...input.verifier,
      iterationId: input.verifier ? id : (existing?.verifier.iterationId ?? null),
      checkedAt: input.verifier ? (input.verifier.checkedAt ?? now) : (existing?.verifier.checkedAt ?? null),
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
      scope: input.scope
        ? normalizeRunScope(input.scope, current.state.linkedRefs)
        : (existing?.scope ?? current.state.scope),
      packetContext: input.packetContext
        ? normalizePacketContext(input.packetContext)
        : (existing?.packetContext ?? current.state.packetContext),
      verifier,
      critiqueLinks,
      decision,
      notes: normalizeStringList([...(existing?.notes ?? []), ...(input.notes ?? [])]),
    };
    const nextIterations = latestById([...history, record]).sort((left, right) => left.iteration - right.iteration);

    const reviewWaitingFor = status === "reviewing" ? waitingForFromReviewSignals(verifier, critiqueLinks) : "none";
    const remainsPrepared = ["pending", "running"].includes(status);
    const latestDecision =
      input.decision !== undefined
        ? decision
        : (existing?.decision ?? (isPostIterationStatus(status) ? null : current.state.latestDecision));
    const latestDecisionIterationId =
      input.decision !== undefined
        ? id
        : existing?.decision
          ? id
          : isPostIterationStatus(status)
            ? null
            : current.state.latestDecisionIterationId;
    const stateTransition: Pick<RalphRunState, "status" | "phase" | "waitingFor" | "stopReason"> =
      input.decision !== undefined && input.status === undefined
        ? {
            status: current.state.status,
            phase: current.state.phase,
            waitingFor: current.state.waitingFor,
            stopReason: current.state.stopReason,
          }
        : {
            status:
              status === "failed"
                ? "failed"
                : status === "reviewing" && reviewWaitingFor !== "none"
                  ? "waiting_for_review"
                  : "active",
            phase: status === "reviewing" ? "reviewing" : status === "accepted" ? "deciding" : "executing",
            waitingFor: reviewWaitingFor,
            stopReason: ["failed", "cancelled"].includes(status) ? "runtime_failure" : current.state.stopReason,
          };

    const nextState: RalphRunState = {
      ...current.state,
      status: stateTransition.status,
      phase: stateTransition.phase,
      waitingFor: stateTransition.waitingFor,
      verifierSummary: verifier,
      critiqueLinks: mergeCritiqueLinks(current.state.critiqueLinks, critiqueLinks),
      latestDecision,
      latestDecisionIterationId,
      lastIterationNumber: Math.max(current.state.lastIterationNumber, iterationNumber),
      nextIterationId: remainsPrepared ? id : null,
      nextLaunch: remainsPrepared ? current.state.nextLaunch : clearPreparedLaunchState(current.state.nextLaunch),
      updatedAt: now,
      stopReason: stateTransition.stopReason,
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

  upsertIterationRuntime(ref: string, input: UpsertRalphIterationRuntimeInput): RalphReadResult {
    const current = this.readRun(ref);
    const history = this.readRuntimeArtifactHistory(current.state.runId);
    const existing = history.find((artifact) => artifact.iterationId === input.iterationId.trim()) ?? null;
    const linkedIteration = current.iterations.find((iteration) => iteration.id === input.iterationId.trim()) ?? null;
    const now = currentTimestamp();
    const launch = input.launch ??
      existing?.launch ?? {
        runId: current.state.runId,
        iterationId: input.iterationId.trim(),
        iteration:
          input.iteration ?? linkedIteration?.iteration ?? existing?.iteration ?? current.state.lastIterationNumber + 1,
        createdAt: existing?.launch.createdAt ?? current.state.nextLaunch.preparedAt ?? now,
        runtime: "session" as const,
        ticketRef: current.state.scope.ticketId ?? current.state.activeTicketId ?? "(unbound-ticket)",
        planRef: current.state.scope.planId,
        packetRef: toRalphPacketRef(current.state.runId),
        launchRef: toRalphLaunchRef(current.state.runId),
        resume: current.state.nextLaunch.resume,
        instructions: current.state.nextLaunch.instructions,
      };

    const record = normalizeRuntimeRecord({
      id: existing?.id ?? input.iterationId.trim(),
      runId: current.state.runId,
      iterationId: input.iterationId.trim(),
      iteration: input.iteration ?? linkedIteration?.iteration ?? existing?.iteration ?? launch.iteration,
      status: input.status ?? existing?.status ?? "queued",
      runtimeScope: input.runtimeScope ?? existing?.runtimeScope ?? null,
      startedAt: input.startedAt ?? existing?.startedAt ?? now,
      updatedAt: now,
      completedAt: input.completedAt ?? existing?.completedAt ?? null,
      command: input.command ?? existing?.command ?? "",
      args: input.args ?? existing?.args ?? [],
      exitCode: input.exitCode ?? existing?.exitCode ?? null,
      output: input.output ?? existing?.output ?? "",
      stderr: input.stderr ?? existing?.stderr ?? "",
      usage: normalizeRuntimeUsage({
        ...existing?.usage,
        ...input.usage,
      }),
      events: [...(existing?.events ?? []), ...(input.events ?? [])],
      launch,
      missingTicketActivity: input.missingTicketActivity ?? existing?.missingTicketActivity ?? false,
      jobId: input.jobId ?? existing?.jobId ?? null,
    });

    const nextRuntimeArtifacts = latestById([...history, record]).sort(
      (left, right) => left.iteration - right.iteration || left.updatedAt.localeCompare(right.updatedAt),
    );
    const result = this.writeArtifacts(current.state, undefined, current.iterations, nextRuntimeArtifacts);
    this.appendRunEvent(
      result.state.runId,
      "updated",
      {
        change: "runtime_artifact_updated",
        iterationId: record.iterationId,
        status: record.status,
        repositoryId: record.runtimeScope?.repositoryId ?? null,
        worktreeId: record.runtimeScope?.worktreeId ?? null,
        exitCode: record.exitCode,
        missingTicketActivity: record.missingTicketActivity,
        jobId: record.jobId,
      },
      now,
    );
    return result;
  }

  setVerifier(ref: string, input: Partial<RalphVerifierSummary>): RalphReadResult {
    const current = this.readRun(ref);
    const nextVerifierSummary = mergeVerifierSummary(current.state.verifierSummary, {
      ...input,
      checkedAt: input.checkedAt ?? currentTimestamp(),
    });
    const verifierSummary = verifierMatchesLatestIteration(current.state, nextVerifierSummary)
      ? nextVerifierSummary
      : current.state.verifierSummary;
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

  queueSteering(ref: string, text: string): RalphReadResult {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error("Ralph steering text is required.");
    }
    const current = this.readRun(ref);
    const entry: RalphSteeringEntry = {
      id: nextSequenceId(
        "steer",
        current.state.steeringQueue.map((steering) => steering.id),
      ),
      text: trimmed,
      createdAt: currentTimestamp(),
      source: "operator",
      consumedAt: null,
      consumedIterationId: null,
    };
    return this.updateRun(ref, {
      steeringQueue: [...current.state.steeringQueue, entry],
      scheduler: {
        status: current.state.scheduler.status === "completed" ? "idle" : current.state.scheduler.status,
        updatedAt: currentTimestamp(),
        note: "Operator steering queued for the next Ralph iteration.",
      },
    });
  }

  consumeQueuedSteering(ref: string, iterationId: string): RalphReadResult {
    const current = this.readRun(ref);
    const consumedAt = currentTimestamp();
    return this.updateRun(ref, {
      steeringQueue: current.state.steeringQueue.map((entry) =>
        entry.consumedAt ? entry : { ...entry, consumedAt, consumedIterationId: iterationId },
      ),
      scheduler: { updatedAt: consumedAt },
    });
  }

  requestStop(ref: string, summary?: string, cancelRunning = true): RalphReadResult {
    const current = this.readRun(ref);
    return this.updateRun(ref, {
      stopRequest: {
        requestedAt: currentTimestamp(),
        requestedBy: "operator",
        summary: summary?.trim() || "Operator requested the Ralph loop to stop.",
        cancelRunning,
        handledAt: null,
      },
      scheduler: {
        status: cancelRunning ? "stopping" : current.state.scheduler.status,
        updatedAt: currentTimestamp(),
        note: summary?.trim() || "Operator requested the Ralph loop to stop.",
      },
    });
  }

  acknowledgeStopRequest(ref: string): RalphReadResult {
    const current = this.readRun(ref);
    if (!current.state.stopRequest) {
      return current;
    }
    return this.updateRun(ref, {
      stopRequest: { ...current.state.stopRequest, handledAt: currentTimestamp() },
      scheduler: { updatedAt: currentTimestamp() },
    });
  }

  setScheduler(ref: string, scheduler: Partial<RalphSchedulerState>): RalphReadResult {
    return this.updateRun(ref, { scheduler });
  }

  prepareLaunch(ref: string, input: PrepareRalphLaunchInput = {}): RalphReadResult {
    const current = this.readRun(ref);
    if (
      ["completed", "halted", "failed", "archived"].includes(current.state.status) &&
      input.allowTerminalRerun !== true
    ) {
      throw new Error(`Ralph run ${current.state.runId} cannot launch from status ${current.state.status}.`);
    }
    if (current.state.waitingFor !== "none") {
      throw new Error(
        `Ralph run ${current.state.runId} is waiting for ${current.state.waitingFor} and cannot launch until that gate is cleared.`,
      );
    }
    if (current.state.postIteration && input.allowTerminalRerun !== true) {
      const hasFreshContinueDecision =
        current.state.latestDecision?.kind === "continue" &&
        current.state.latestDecisionIterationId === current.state.postIteration.iterationId;
      if (!hasFreshContinueDecision) {
        throw new Error(
          `Ralph run ${current.state.runId} requires a fresh continuation decision for iteration ${current.state.postIteration.iterationId} before launching again.`,
        );
      }
    }

    let latest = this.latestIterationById(current.iterations, current.state.nextIterationId);
    if (!latest || isPostIterationStatus(latest.status) || input.requireFresh === true) {
      const prepared = this.appendIteration(ref, {
        id:
          input.requireFresh === true
            ? nextSequenceId(
                "iter",
                current.iterations.map((iteration) => iteration.id),
              )
            : undefined,
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
        runtime: "session",
        resume: input.resume === true,
        preparedAt: currentTimestamp(),
        instructions:
          input.instructions !== undefined
            ? normalizeStringList(input.instructions)
            : current.state.nextLaunch.instructions,
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
    const archivedAt = currentTimestamp();
    return this.writeArtifacts({
      ...current.state,
      status: "archived",
      phase: "halted",
      waitingFor: "none",
      steeringQueue: [],
      stopRequest: null,
      scheduler: {
        status: "completed",
        updatedAt: archivedAt,
        jobId: null,
        note: "Ralph run archived.",
      },
      nextIterationId: null,
      nextLaunch: clearPreparedLaunchState(current.state.nextLaunch, []),
      updatedAt: archivedAt,
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

  async readRunSummaryAsync(ref: string): Promise<RalphRunSummary> {
    return this.readRunSummary(ref);
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

  async upsertIterationRuntimeAsync(ref: string, input: UpsertRalphIterationRuntimeInput): Promise<RalphReadResult> {
    return this.upsertIterationRuntime(ref, input);
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

  async queueSteeringAsync(ref: string, text: string): Promise<RalphReadResult> {
    return this.queueSteering(ref, text);
  }

  async consumeQueuedSteeringAsync(ref: string, iterationId: string): Promise<RalphReadResult> {
    return this.consumeQueuedSteering(ref, iterationId);
  }

  async requestStopAsync(ref: string, summary?: string, cancelRunning = true): Promise<RalphReadResult> {
    return this.requestStop(ref, summary, cancelRunning);
  }

  async acknowledgeStopRequestAsync(ref: string): Promise<RalphReadResult> {
    return this.acknowledgeStopRequest(ref);
  }

  async setSchedulerAsync(ref: string, scheduler: Partial<RalphSchedulerState>): Promise<RalphReadResult> {
    return this.setScheduler(ref, scheduler);
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
