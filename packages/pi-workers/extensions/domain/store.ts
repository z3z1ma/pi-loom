import { resolve } from "node:path";
import { hasProjectedArtifactAttributes, syncProjectedArtifacts } from "@pi-loom/pi-storage/storage/artifacts.js";
import type { LoomEntityRecord, LoomRuntimeAttachment } from "@pi-loom/pi-storage/storage/contract.js";
import { appendEntityEvent, upsertEntityByDisplayIdWithLifecycleEvents } from "@pi-loom/pi-storage/storage/entities.js";
import { createStableLoomId } from "@pi-loom/pi-storage/storage/ids.js";
import type { ProjectedEntityLinkInput } from "@pi-loom/pi-storage/storage/links.js";
import { syncProjectedEntityLinks } from "@pi-loom/pi-storage/storage/links.js";
import { filterAndSortListEntries } from "@pi-loom/pi-storage/storage/list-search.js";
import { getLoomCatalogPaths } from "@pi-loom/pi-storage/storage/locations.js";
import { openWorkspaceStorageSync } from "@pi-loom/pi-storage/storage/workspace.js";
import { createRalphStore } from "@pi-loom/pi-ralph/extensions/domain/store.js";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { buildWorkerDashboard } from "./dashboard.js";
import type {
  AppendWorkerCheckpointInput,
  AppendWorkerMessageInput,
  ApprovalStatus,
  CreateWorkerInput,
  DecideWorkerApprovalInput,
  ManagerOverview,
  ManagerRef,
  ManagerSchedulerDecision,
  MessageAwaiting,
  MessageDirection,
  MessageKind,
  RecordWorkerConsolidationInput,
  RequestWorkerCompletionInput,
  SetWorkerTelemetryInput,
  UpdateWorkerInput,
  WorkerApprovalDecision,
  WorkerCanonicalRecord,
  WorkerCheckpointArtifactPayload,
  WorkerCheckpointRecord,
  WorkerConsolidationOutcome,
  WorkerDashboard,
  WorkerLaunchAttachmentMetadata,
  WorkerLinkedRefs,
  WorkerListFilter,
  WorkerMessageRecord,
  WorkerReadResult,
  WorkerRuntimeDescriptor,
  WorkerState,
  WorkerStatus,
  WorkerSummary,
  WorkerSupervisionDecision,
  WorkerTelemetry,
  WorkerWorkspaceDescriptor,
} from "./models.js";
import {
  currentTimestamp,
  ensureRelativeOrLogicalRef,
  normalizeApprovalStatus,
  normalizeConsolidationOutcome,
  normalizeManagerRef,
  normalizeMessageAwaiting,
  normalizeMessageDirection,
  normalizeMessageKind,
  normalizeMessageStatus,
  normalizeOptionalString,
  normalizeRuntimeKind,
  normalizeStringList,
  normalizeTelemetry,
  normalizeWorkspaceDescriptor,
  summarizeText,
} from "./normalize.js";
import { getWorkerArtifactPaths, normalizeWorkerRef, slugifyWorkerValue } from "./paths.js";
import {
  renderLaunchDescriptor,
  renderWorkerDashboard,
  renderWorkerDetail,
  renderWorkerList,
  renderWorkerPacket,
} from "./render.js";
import {
  prepareWorkerLaunchDescriptor,
  retireWorkerWorkspace,
  runWorkerLaunch,
  type WorkerExecutionResult,
} from "./runtime.js";

const ENTITY_KIND = "worker" as const;
const WORKER_PROJECTION_OWNER = "worker-store" as const;
const WORKER_CHECKPOINT_PROJECTION_OWNER = "worker-store:checkpoints" as const;
const WORKER_LAUNCH_ATTACHMENT_KIND = "launch_descriptor" as const;

interface WorkerEntityAttributes extends WorkerCanonicalRecord {}

interface WorkerMutationEvent {
  payload: Record<string, unknown>;
  createdAt: string;
}

function hasStructuredWorkerAttributes(attributes: unknown): attributes is WorkerEntityAttributes {
  if (!attributes || typeof attributes !== "object") {
    return false;
  }
  const candidate = attributes as Record<string, unknown>;
  return Array.isArray(candidate.messages) && Boolean(candidate.state && typeof candidate.state === "object");
}

function normalizeWorkerMessageRecord(record: WorkerMessageRecord): WorkerMessageRecord {
  return {
    ...record,
    workerId: record.workerId,
    createdAt: record.createdAt,
    direction: normalizeMessageDirection(record.direction),
    awaiting: normalizeMessageAwaiting(record.awaiting),
    kind: normalizeMessageKind(record.kind),
    status: normalizeMessageStatus(record.status),
    from: normalizeOptionalString(record.from) ?? "",
    text: normalizeOptionalString(record.text) ?? "",
    relatedRefs: normalizeStringList(record.relatedRefs),
    replyTo: normalizeOptionalString(record.replyTo),
    acknowledgedAt: normalizeOptionalString(record.acknowledgedAt),
    acknowledgedBy: normalizeOptionalString(record.acknowledgedBy),
    resolvedAt: normalizeOptionalString(record.resolvedAt),
    resolvedBy: normalizeOptionalString(record.resolvedBy),
  };
}

function normalizeStoredWorkerAttributes(attributes: WorkerEntityAttributes): WorkerEntityAttributes {
  return {
    state: normalizeWorkerState(attributes.state),
    messages: attributes.messages.map((message) =>
      normalizeWorkerMessageRecord(message as unknown as WorkerMessageRecord),
    ),
  };
}

function readStoredWorkerSnapshot(rawAttributes: unknown): WorkerEntityAttributes | null {
  if (!hasStructuredWorkerAttributes(rawAttributes)) {
    return null;
  }
  return normalizeStoredWorkerAttributes(rawAttributes);
}

interface StoredWorkerEntityRow {
  id: string;
  space_id: string;
  owning_repository_id: string | null;
  display_id: string | null;
  title: string;
  summary: string;
  status: string;
  version: number;
  tags_json: string;
  created_at: string;
  updated_at: string;
  attributes_json: string;
}

function storedWorkerRowToEntity(row: StoredWorkerEntityRow): LoomEntityRecord {
  return {
    id: row.id,
    kind: ENTITY_KIND,
    spaceId: row.space_id,
    owningRepositoryId: row.owning_repository_id,
    displayId: row.display_id,
    title: row.title,
    summary: row.summary,
    status: row.status,
    version: row.version,
    tags: parseStoredJson<string[]>(row.tags_json, []),
    attributes: parseStoredJson<Record<string, unknown>>(row.attributes_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function openWorkerCatalogSync(cwd: string) {
  return openWorkspaceStorageSync(cwd);
}

function launchAttachmentId(worktreeId: string, workerId: string): string {
  return createStableLoomId("attachment", [worktreeId, WORKER_LAUNCH_ATTACHMENT_KIND, workerId]);
}

function launchAttachmentLocator(workerId: string): string {
  return getWorkerArtifactPaths(".", workerId).launch;
}

function normalizeWorkerCheckpointRecord(checkpoint: WorkerCheckpointRecord): WorkerCheckpointRecord {
  return {
    id: checkpoint.id,
    workerId: checkpoint.workerId,
    createdAt: checkpoint.createdAt,
    summary: normalizeOptionalString(checkpoint.summary) ?? "",
    understanding: normalizeOptionalString(checkpoint.understanding) ?? "",
    recentChanges: normalizeStringList(checkpoint.recentChanges),
    validation: normalizeStringList(checkpoint.validation),
    blockers: normalizeStringList(checkpoint.blockers),
    nextAction: normalizeOptionalString(checkpoint.nextAction) ?? "Continue",
    acknowledgedMessageIds: normalizeStringList(checkpoint.acknowledgedMessageIds),
    resolvedMessageIds: normalizeStringList(checkpoint.resolvedMessageIds),
    remainingInboxCount:
      typeof checkpoint.remainingInboxCount === "number" && Number.isFinite(checkpoint.remainingInboxCount)
        ? Math.max(0, Math.floor(checkpoint.remainingInboxCount))
        : 0,
    managerInputRequired: checkpoint.managerInputRequired === true,
  };
}

function checkpointArtifactInputs(worker: WorkerReadResult) {
  return worker.checkpoints.map((checkpoint) => {
    const normalized = normalizeWorkerCheckpointRecord(checkpoint);
    const payload: WorkerCheckpointArtifactPayload = { ...normalized };
    return {
      artifactType: "worker_checkpoint",
      displayId: normalized.id,
      title: `${worker.state.title} checkpoint ${normalized.id}`,
      summary: normalized.summary,
      status: normalized.managerInputRequired
        ? "waiting_for_review"
        : normalized.blockers.length > 0
          ? "blocked"
          : "active",
      tags: [worker.state.workerId],
      payload,
    };
  });
}

function projectedCheckpointRecordsFromRows(
  rows: Array<{ attributes_json: string }>,
  ownerEntityId: string,
): WorkerCheckpointRecord[] {
  return rows
    .map((row) => parseStoredJson<Record<string, unknown>>(row.attributes_json, {}))
    .filter(hasProjectedArtifactAttributes)
    .filter(
      (attributes) =>
        attributes.projectionOwner === WORKER_CHECKPOINT_PROJECTION_OWNER &&
        attributes.owner.entityId === ownerEntityId,
    )
    .map((attributes) =>
      normalizeWorkerCheckpointRecord(attributes.payload as unknown as WorkerCheckpointArtifactPayload),
    )
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

function readProjectedCheckpointsSync(cwd: string, ownerEntityId: string): WorkerCheckpointRecord[] {
  const { storage, identity } = openWorkerCatalogSync(cwd);
  const rows = storage.db
    .prepare("SELECT attributes_json FROM entities WHERE space_id = ? AND kind = 'artifact'")
    .all(identity.space.id) as Array<{ attributes_json: string }>;
  return projectedCheckpointRecordsFromRows(rows, ownerEntityId);
}

function hasWorkerLaunchAttachmentMetadata(value: unknown): value is WorkerLaunchAttachmentMetadata {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.workerId === "string" && Boolean(candidate.launch && typeof candidate.launch === "object");
}

function normalizeWorkerLaunchDescriptor(launch: WorkerRuntimeDescriptor): WorkerRuntimeDescriptor {
  return {
    workerId: launch.workerId,
    ralphRunId: launch.ralphRunId,
    iterationId: launch.iterationId,
    iteration: launch.iteration,
    createdAt: launch.createdAt,
    updatedAt: launch.updatedAt,
    runtime: normalizeRuntimeKind(launch.runtime),
    resume: launch.resume === true,
    workspaceDir: launch.workspaceDir,
    branch: launch.branch,
    baseRef: launch.baseRef,
    packetRef: launch.packetRef,
    ralphLaunchRef: launch.ralphLaunchRef,
    instructions: normalizeStringList(launch.instructions),
    launchPrompt: launch.launchPrompt,
    command: [...launch.command],
    pid: typeof launch.pid === "number" && Number.isFinite(launch.pid) ? Math.floor(launch.pid) : null,
    status: launch.status,
    note: normalizeOptionalString(launch.note) ?? "",
  };
}

function readLaunchAttachmentSync(cwd: string, workerId: string): WorkerRuntimeDescriptor | null {
  const { storage, identity } = openWorkerCatalogSync(cwd);
  const row = (storage.db
    .prepare("SELECT metadata_json FROM runtime_attachments WHERE worktree_id = ? AND kind = ? AND locator = ? LIMIT 1")
    .get(identity.worktree.id, WORKER_LAUNCH_ATTACHMENT_KIND, launchAttachmentLocator(workerId)) ?? null) as {
    metadata_json: string;
  } | null;
  if (!row) {
    return null;
  }
  const metadata = parseStoredJson<Record<string, unknown>>(row.metadata_json, {});
  if (!hasWorkerLaunchAttachmentMetadata(metadata) || metadata.workerId !== workerId) {
    return null;
  }
  return normalizeWorkerLaunchDescriptor(metadata.launch);
}

function buildWorkerReadResult(
  cwd: string,
  ownerEntityId: string,
  attributes: WorkerEntityAttributes,
): WorkerReadResult {
  const artifacts = getWorkerArtifactPaths(cwd, attributes.state.workerId);
  const projectedCheckpoints = readProjectedCheckpointsSync(cwd, ownerEntityId);
  const launch = readLaunchAttachmentSync(cwd, attributes.state.workerId);
  const materialized: WorkerReadResult = {
    state: normalizeWorkerState(attributes.state),
    summary: buildSummary(cwd, normalizeWorkerState(attributes.state), artifacts.dir),
    worker: "",
    messages: [...attributes.messages],
    checkpoints: projectedCheckpoints,
    launch,
    dashboard: {} as WorkerDashboard,
    packet: "",
    artifacts,
  };
  syncDerivedViews(cwd, materialized);
  materialized.worker = renderWorkerMarkdown(materialized);
  return materialized;
}

function parseStoredJson<T>(value: string, fallback: T): T {
  if (!value.trim()) {
    return fallback;
  }
  return JSON.parse(value) as T;
}

function findStoredWorkerRow(cwd: string, workerId: string): StoredWorkerEntityRow | null {
  const { storage, identity } = openWorkerCatalogSync(cwd);
  return (storage.db
    .prepare(
      "SELECT id, space_id, owning_repository_id, display_id, title, summary, status, version, tags_json, created_at, updated_at, attributes_json FROM entities WHERE space_id = ? AND kind = ? AND display_id = ? LIMIT 1",
    )
    .get(identity.space.id, ENTITY_KIND, workerId) ?? null) as StoredWorkerEntityRow | null;
}

function listStoredWorkerRecords(cwd: string): WorkerReadResult[] {
  const { storage, identity } = openWorkerCatalogSync(cwd);
  const rows = storage.db
    .prepare(
      "SELECT id, space_id, owning_repository_id, display_id, title, summary, status, version, tags_json, created_at, updated_at, attributes_json FROM entities WHERE space_id = ? AND kind = ? ORDER BY display_id",
    )
    .all(identity.space.id, ENTITY_KIND) as StoredWorkerEntityRow[];
  return rows.map((row) => {
    const snapshot = readStoredWorkerSnapshot(parseStoredJson<Record<string, unknown>>(row.attributes_json, {}));
    if (!snapshot) {
      throw new Error("Worker entity is missing structured attributes");
    }
    return buildWorkerReadResult(cwd, row.id, snapshot);
  });
}

function workerSearchText(worker: WorkerReadResult): string[] {
  return [
    worker.summary.id,
    worker.summary.title,
    worker.state.objective,
    worker.state.summary,
    worker.summary.objectiveSummary,
    worker.state.latestCheckpointSummary,
    worker.summary.latestCheckpointSummary,
    worker.state.lastSchedulerSummary,
    worker.summary.lastSchedulerSummary,
    worker.state.packetSummary,
    worker.state.managerRef.ref,
    worker.state.managerRef.label ?? "",
    ...worker.state.linkedRefs.initiativeIds,
    ...worker.state.linkedRefs.researchIds,
    ...worker.state.linkedRefs.specChangeIds,
    ...worker.state.linkedRefs.ticketIds,
    ...worker.state.linkedRefs.critiqueIds,
    ...worker.state.linkedRefs.docIds,
    ...worker.state.linkedRefs.planIds,
    ...worker.state.linkedRefs.ralphRunIds,
  ];
}

function filterAndSortWorkerSummaries(records: WorkerReadResult[], filter: WorkerListFilter = {}): WorkerSummary[] {
  const filtered = records.filter((worker) => {
    if (filter.status && worker.summary.status !== filter.status) {
      return false;
    }
    if (filter.telemetryState && worker.summary.telemetryState !== filter.telemetryState) {
      return false;
    }
    if (filter.pendingApproval !== undefined && worker.summary.pendingApproval !== filter.pendingApproval) {
      return false;
    }
    return true;
  });

  return filterAndSortListEntries(
    filtered.map((worker) => ({
      item: worker.summary,
      id: worker.summary.id,
      createdAt: worker.state.createdAt,
      updatedAt: worker.summary.updatedAt,
      fields: [
        { value: worker.summary.id, weight: 12 },
        { value: worker.summary.title, weight: 10 },
        { value: worker.summary.objectiveSummary, weight: 9 },
        { value: worker.summary.latestCheckpointSummary, weight: 7 },
        { value: worker.summary.lastSchedulerSummary, weight: 6 },
        { value: workerSearchText(worker).join(" "), weight: 3 },
      ],
    })),
    { text: filter.text, sort: filter.sort },
  );
}

function nextSequenceId(existingCount: number, prefix: string): string {
  return `${prefix}-${String(existingCount + 1).padStart(4, "0")}`;
}

function isManagerOwnedInbox(message: WorkerMessageRecord): boolean {
  return message.awaiting === "worker" && message.status !== "resolved";
}

function isWorkerOwnedInbox(message: WorkerMessageRecord): boolean {
  return message.awaiting === "manager" && message.status !== "resolved";
}

function unresolvedInbox(messages: WorkerMessageRecord[]): WorkerMessageRecord[] {
  return messages.filter(isManagerOwnedInbox);
}

function pendingManagerActions(messages: WorkerMessageRecord[]): WorkerMessageRecord[] {
  return messages.filter(isWorkerOwnedInbox);
}

function acknowledgedInbox(messages: WorkerMessageRecord[]): WorkerMessageRecord[] {
  return messages.filter((message) => message.awaiting === "worker" && message.status === "acknowledged");
}

function inferMessageAwaiting(direction: MessageDirection, kind: MessageKind): MessageAwaiting {
  if (kind === "acknowledgement" || kind === "resolution") {
    return "none";
  }
  if (direction === "manager_to_worker" || direction === "broadcast") {
    return "worker";
  }
  if (
    kind === "escalation" ||
    kind === "clarification" ||
    kind === "checkpoint_notice" ||
    kind === "completion_notice" ||
    kind === "status_update"
  ) {
    return "manager";
  }
  return "none";
}

function inferMessageStatus(awaiting: MessageAwaiting): WorkerMessageRecord["status"] {
  return awaiting === "none" ? "resolved" : "pending";
}

function markMessageAcknowledged(message: WorkerMessageRecord, at: string, by: string): WorkerMessageRecord {
  return {
    ...message,
    status: message.status === "resolved" ? "resolved" : "acknowledged",
    acknowledgedAt: message.acknowledgedAt ?? at,
    acknowledgedBy: message.acknowledgedBy ?? by,
  };
}

function markMessageResolved(message: WorkerMessageRecord, at: string, by: string): WorkerMessageRecord {
  return {
    ...message,
    status: "resolved",
    awaiting: "none",
    acknowledgedAt: message.acknowledgedAt ?? at,
    acknowledgedBy: message.acknowledgedBy ?? by,
    resolvedAt: at,
    resolvedBy: by,
  };
}

function normalizeLinkedRefs(input: Partial<WorkerLinkedRefs> | undefined): WorkerLinkedRefs {
  return {
    initiativeIds: normalizeStringList(input?.initiativeIds),
    researchIds: normalizeStringList(input?.researchIds),
    specChangeIds: normalizeStringList(input?.specChangeIds),
    ticketIds: normalizeStringList(input?.ticketIds),
    critiqueIds: normalizeStringList(input?.critiqueIds),
    docIds: normalizeStringList(input?.docIds),
    planIds: normalizeStringList(input?.planIds),
    ralphRunIds: normalizeStringList(input?.ralphRunIds),
  };
}

function mergeLinkedRefs(current: WorkerLinkedRefs, next: Partial<WorkerLinkedRefs> | undefined): WorkerLinkedRefs {
  if (!next) {
    return current;
  }
  return normalizeLinkedRefs({
    initiativeIds: next.initiativeIds ?? current.initiativeIds,
    researchIds: next.researchIds ?? current.researchIds,
    specChangeIds: next.specChangeIds ?? current.specChangeIds,
    ticketIds: next.ticketIds ?? current.ticketIds,
    critiqueIds: next.critiqueIds ?? current.critiqueIds,
    docIds: next.docIds ?? current.docIds,
    planIds: next.planIds ?? current.planIds,
    ralphRunIds: next.ralphRunIds ?? current.ralphRunIds,
  });
}

function workerRalphLinkedRefs(linkedRefs: WorkerLinkedRefs) {
  return {
    initiativeIds: [...linkedRefs.initiativeIds],
    researchIds: [...linkedRefs.researchIds],
    specChangeIds: [...linkedRefs.specChangeIds],
    ticketIds: [...linkedRefs.ticketIds],
    critiqueIds: [...linkedRefs.critiqueIds],
    docIds: [...linkedRefs.docIds],
    planIds: [...linkedRefs.planIds],
  };
}

function getSingleLinkedRalphRunId(linkedRefs: WorkerLinkedRefs, workerId: string): string {
  if (linkedRefs.ralphRunIds.length !== 1) {
    throw new Error(`Worker ${workerId} must link exactly one Ralph run.`);
  }
  return linkedRefs.ralphRunIds[0] ?? "";
}

function ensureLinkedRalphRun(
  cwd: string,
  workerId: string,
  title: string,
  objective: string,
  summary: string,
  linkedRefs: WorkerLinkedRefs,
): WorkerLinkedRefs {
  if (linkedRefs.ralphRunIds.length > 1) {
    throw new Error(`Worker ${workerId} cannot link multiple Ralph runs.`);
  }

  const ralphStore = createRalphStore(cwd);
  if (linkedRefs.ralphRunIds.length === 1) {
    const runId = getSingleLinkedRalphRunId(linkedRefs, workerId);
    ralphStore.readRun(runId);
    return { ...linkedRefs, ralphRunIds: [runId] };
  }

  const run = ralphStore.createRun({
    title,
    objective,
    summary,
    linkedRefs: workerRalphLinkedRefs(linkedRefs),
  });
  return { ...linkedRefs, ralphRunIds: [run.state.runId] };
}

function syncLinkedRalphRun(cwd: string, worker: WorkerReadResult): void {
  const ralphStore = createRalphStore(cwd);
  const runId = getSingleLinkedRalphRunId(worker.state.linkedRefs, worker.state.workerId);
  ralphStore.updateRun(runId, {
    title: worker.state.title,
    objective: worker.state.objective,
    summary: worker.state.summary,
    linkedRefs: workerRalphLinkedRefs(worker.state.linkedRefs),
  });
}

function readLinkedRalphRun(cwd: string, worker: WorkerReadResult) {
  const runId = getSingleLinkedRalphRunId(worker.state.linkedRefs, worker.state.workerId);
  return createRalphStore(cwd).readRun(runId);
}

function maybeReadLinkedRalphRun(cwd: string, worker: WorkerReadResult) {
  try {
    return readLinkedRalphRun(cwd, worker);
  } catch {
    return null;
  }
}

function ralphAllowsNextIteration(cwd: string, worker: WorkerReadResult, run = readLinkedRalphRun(cwd, worker)): boolean {
  return run.state.waitingFor === "none" && !["completed", "halted", "failed", "archived"].includes(run.state.status);
}

function projectedLinksForWorker(worker: WorkerReadResult): ProjectedEntityLinkInput[] {
  const desired: ProjectedEntityLinkInput[] = [];
  const linkedRefs = worker.state.linkedRefs;

  for (const ticketId of linkedRefs.ticketIds) {
    desired.push({ kind: "implements", targetKind: "ticket", targetDisplayId: ticketId });
  }

  for (const planId of linkedRefs.planIds) {
    desired.push({ kind: "belongs_to", targetKind: "plan", targetDisplayId: planId });
  }

  // Plans organize worker execution; other linked refs stay contextual references.
  for (const initiativeId of linkedRefs.initiativeIds) {
    desired.push({ kind: "references", targetKind: "initiative", targetDisplayId: initiativeId });
  }
  for (const researchId of linkedRefs.researchIds) {
    desired.push({ kind: "references", targetKind: "research", targetDisplayId: researchId });
  }
  for (const specChangeId of linkedRefs.specChangeIds) {
    desired.push({ kind: "references", targetKind: "spec_change", targetDisplayId: specChangeId });
  }
  for (const critiqueId of linkedRefs.critiqueIds) {
    desired.push({ kind: "references", targetKind: "critique", targetDisplayId: critiqueId });
  }
  for (const docId of linkedRefs.docIds) {
    desired.push({ kind: "references", targetKind: "documentation", targetDisplayId: docId });
  }
  for (const ralphRunId of linkedRefs.ralphRunIds) {
    desired.push({ kind: "references", targetKind: "ralph_run", targetDisplayId: ralphRunId });
  }

  return desired;
}

function validateProjectedLinksSync(
  storage: ReturnType<typeof openWorkerCatalogSync>["storage"],
  spaceId: string,
  desired: ProjectedEntityLinkInput[],
  projectionOwner: string,
): void {
  const missing = normalizeStringList(
    desired.flatMap((link) => {
      const displayId = link.targetDisplayId.trim();
      if (!displayId || link.required === false) {
        return [];
      }
      const row = storage.db
        .prepare("SELECT id FROM entities WHERE space_id = ? AND kind = ? AND display_id = ? LIMIT 1")
        .get(spaceId, link.targetKind, displayId) as { id: string } | undefined;
      return row ? [] : [`${link.targetKind}:${displayId}`];
    }),
  );

  if (missing.length > 0) {
    throw new Error(`Missing projected link targets for ${projectionOwner}: ${missing.join(", ")}`);
  }
}

function defaultTelemetry(): WorkerTelemetry {
  return normalizeTelemetry({
    state: "unknown",
    summary: "",
    heartbeatAt: null,
    checkpointId: null,
    pendingMessages: 0,
    notes: [],
  });
}

function defaultApproval(): WorkerApprovalDecision {
  return {
    status: "not_requested",
    decidedAt: null,
    decidedBy: null,
    summary: "",
    rationale: [],
  };
}

function defaultConsolidation(): WorkerConsolidationOutcome {
  return normalizeConsolidationOutcome({
    status: "not_started",
    summary: "",
    validation: [],
    conflicts: [],
    followUps: [],
  });
}

function defaultWorkspaceDescriptor(workerId: string): WorkerWorkspaceDescriptor {
  return normalizeWorkspaceDescriptor({
    workspaceKey: `worker-runtime:${workerId}`,
    branch: workerId,
    baseRef: "HEAD",
  });
}

function defaultManagerRef(): ManagerRef {
  return normalizeManagerRef({ kind: "operator", ref: "operator" });
}

function isSuccessfulConsolidationStatus(status: WorkerConsolidationOutcome["status"]): boolean {
  return status === "merged" || status === "cherry_picked" || status === "patched";
}

function executionSummary(execution: WorkerExecutionResult): string {
  if (execution.error?.trim()) {
    return execution.error.trim();
  }
  if (execution.output.trim()) {
    return execution.output.trim();
  }
  return `Worker execution ${execution.status}`;
}

function completedExecutionState(worker: WorkerReadResult): {
  status: WorkerStatus;
  telemetryState: WorkerTelemetry["state"];
} {
  if (worker.state.approval.status === "approved") {
    return { status: "approved_for_consolidation", telemetryState: "waiting_for_review" };
  }
  if (worker.state.approval.status === "rejected_for_revision" || worker.state.approval.status === "escalated") {
    return { status: "blocked", telemetryState: "blocked" };
  }
  if (worker.state.completionRequest.requestedAt) {
    return { status: "completion_requested", telemetryState: "waiting_for_review" };
  }
  return { status: "ready", telemetryState: "idle" };
}

function executionSummaryFromRalph(cwd: string, worker: WorkerReadResult, summary: string, finishedAt: string): {
  status: WorkerStatus;
  telemetryState: WorkerTelemetry["state"];
  summary: string;
} {
  const run = readLinkedRalphRun(cwd, worker);
  const postIteration = run.state.postIteration;
  if (!postIteration || postIteration.iterationId !== worker.launch?.iterationId || postIteration.decision === null) {
    return {
      status: "failed",
      telemetryState: "blocked",
      summary:
        "Linked Ralph iteration exited without durable post-iteration state and explicit decision for the prepared iteration.",
    };
  }

  const durableSummary = [postIteration.summary, postIteration.workerSummary, postIteration.decision.summary]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" — ");
  const resolvedSummary = durableSummary || summary;

  if (worker.state.approval.status === "approved") {
    return { status: "approved_for_consolidation", telemetryState: "waiting_for_review", summary: resolvedSummary };
  }
  if (worker.state.approval.status === "rejected_for_revision" || worker.state.approval.status === "escalated") {
    return { status: "blocked", telemetryState: "blocked", summary: resolvedSummary };
  }

  if (postIteration.decision.kind === "complete" || run.state.status === "completed") {
    worker.state.completionRequest = {
      requestedAt: worker.state.completionRequest.requestedAt ?? finishedAt,
      scopeComplete: worker.state.completionRequest.scopeComplete,
      validationEvidence: worker.state.completionRequest.validationEvidence,
      remainingRisks: worker.state.completionRequest.remainingRisks,
      branchState: worker.state.completionRequest.branchState || worker.state.workspace.branch,
      summary: worker.state.completionRequest.summary || resolvedSummary,
      requestedBy: worker.state.completionRequest.requestedBy || worker.state.workerId,
    };
    worker.state.approval = {
      ...worker.state.approval,
      status: worker.state.approval.status === "not_requested" ? "pending" : worker.state.approval.status,
      summary:
        worker.state.approval.status === "not_requested"
          ? "Pending manager approval"
          : worker.state.approval.summary,
    };
    return { status: "completion_requested", telemetryState: "waiting_for_review", summary: resolvedSummary };
  }

  if (run.state.status === "failed" || run.state.status === "halted") {
    return { status: "failed", telemetryState: "blocked", summary: resolvedSummary };
  }
  if (run.state.waitingFor !== "none" || run.state.phase === "reviewing") {
    return { status: "waiting_for_review", telemetryState: "waiting_for_review", summary: resolvedSummary };
  }
  return completedExecutionState(worker).status === "ready"
    ? { status: "ready", telemetryState: "idle", summary: resolvedSummary }
    : { ...completedExecutionState(worker), summary: resolvedSummary };
}

function normalizeWorkerState(state: WorkerState): WorkerState {
  const normalized: WorkerState = {
    ...state,
    title: state.title ?? state.workerId,
    objective: state.objective ?? "",
    summary: state.summary ?? "",
    managerRef: normalizeManagerRef(state.managerRef ?? defaultManagerRef()),
    linkedRefs: normalizeLinkedRefs(state.linkedRefs),
    workspace: normalizeWorkspaceDescriptor(state.workspace ?? defaultWorkspaceDescriptor(state.workerId)),
    latestTelemetry: normalizeTelemetry({ ...defaultTelemetry(), ...state.latestTelemetry }),
    latestCheckpointId: state.latestCheckpointId ?? null,
    latestCheckpointSummary: state.latestCheckpointSummary ?? "",
    lastMessageAt: state.lastMessageAt ?? null,
    lastLaunchAt: state.lastLaunchAt ?? null,
    lastSchedulerAt: state.lastSchedulerAt ?? null,
    lastSchedulerSummary: state.lastSchedulerSummary ?? "",
    launchCount: state.launchCount ?? 0,
    lastRuntimeKind: state.lastRuntimeKind ?? null,
    interventionCount: state.interventionCount ?? 0,
    completionRequest: state.completionRequest ?? {
      requestedAt: null,
      scopeComplete: [],
      validationEvidence: [],
      remainingRisks: [],
      branchState: "",
      summary: "",
      requestedBy: "",
    },
    approval: state.approval ?? defaultApproval(),
    consolidation: state.consolidation ?? defaultConsolidation(),
    packetSummary: state.packetSummary ?? "",
  };
  normalized.workspace.repositoryRoot = ensureRelativeOrLogicalRef(
    normalized.workspace.repositoryRoot,
    "repository root",
  );
  normalized.workspace.workspaceKey = ensureRelativeOrLogicalRef(normalized.workspace.workspaceKey, "workspace key");
  return normalized;
}

function buildSummary(_cwd: string, state: WorkerState, workerRef: string): WorkerSummary {
  return {
    id: state.workerId,
    title: state.title,
    objectiveSummary: summarizeText(state.objective, 160),
    status: state.status,
    updatedAt: state.updatedAt,
    managerKind: state.managerRef.kind,
    ticketCount: state.linkedRefs.ticketIds.length,
    runtimeKind: state.lastRuntimeKind,
    telemetryState: state.latestTelemetry.state,
    latestCheckpointSummary: summarizeText(state.latestCheckpointSummary, 160),
    lastSchedulerSummary: summarizeText(state.lastSchedulerSummary, 160),
    acknowledgedInboxCount: 0,
    unresolvedInboxCount: state.latestTelemetry.pendingMessages,
    pendingManagerActionCount: 0,
    pendingApproval: state.approval.status === "pending",
    workerRef,
  };
}

function syncDerivedViews(cwd: string, worker: WorkerReadResult): void {
  worker.state.latestTelemetry = normalizeTelemetry({
    ...worker.state.latestTelemetry,
    pendingMessages: unresolvedInbox(worker.messages).length,
  });
  worker.packet = renderWorkerPacket(worker);
  worker.state.packetSummary = summarizeText(worker.packet, 200);
  worker.summary = {
    ...buildSummary(cwd, worker.state, worker.artifacts.dir),
    acknowledgedInboxCount: acknowledgedInbox(worker.messages).length,
    unresolvedInboxCount: unresolvedInbox(worker.messages).length,
    pendingManagerActionCount: pendingManagerActions(worker.messages).length,
  };
  worker.dashboard = buildWorkerDashboard(cwd, worker);
}

function materializeWorkerRecord(cwd: string, worker: WorkerReadResult): WorkerReadResult {
  const artifacts = getWorkerArtifactPaths(cwd, worker.state.workerId);
  const materialized: WorkerReadResult = {
    state: normalizeWorkerState(worker.state),
    summary: buildSummary(cwd, normalizeWorkerState(worker.state), artifacts.dir),
    worker: worker.worker,
    messages: [...worker.messages],
    checkpoints: [...worker.checkpoints],
    launch: worker.launch ? { ...worker.launch } : null,
    dashboard: worker.dashboard,
    packet: worker.packet,
    artifacts,
  };
  syncDerivedViews(cwd, materialized);
  materialized.worker = renderWorkerMarkdown(materialized);
  return materialized;
}

function renderWorkerMarkdown(result: WorkerReadResult): string {
  const state = result.state;
  return `---
id: ${state.workerId}
title: "${state.title.replace(/"/g, '\\"')}"
status: ${state.status}
manager: ${state.managerRef.kind}:${state.managerRef.ref}
workspace-strategy: ${state.workspace.strategy}
workspace-branch: ${state.workspace.branch}
workspace-base-ref: ${state.workspace.baseRef}
latest-telemetry: ${state.latestTelemetry.state}
updated-at: ${state.updatedAt}
linked-tickets:
${state.linkedRefs.ticketIds.map((ticketId) => `  - ${ticketId}`).join("\n") || "  - none"}
---

## Summary
${state.summary || state.objective || "No summary yet."}

## Objective
${state.objective || "No objective recorded."}

## Latest checkpoint
${state.latestCheckpointSummary || "No checkpoints yet."}

## Approval
${state.approval.status}${state.approval.summary ? ` — ${state.approval.summary}` : ""}

## Consolidation
${state.consolidation.status}${state.consolidation.summary ? ` — ${state.consolidation.summary}` : ""}
`;
}

function canonicalWorkerAttributes(worker: WorkerReadResult): WorkerEntityAttributes {
  return {
    state: normalizeWorkerState(worker.state),
    messages: worker.messages.map((message) => ({
      ...message,
      relatedRefs: normalizeStringList(message.relatedRefs),
    })),
  };
}

function launchRuntimeAttachment(
  worktreeId: string,
  workerId: string,
  launch: WorkerRuntimeDescriptor,
): LoomRuntimeAttachment {
  return {
    id: launchAttachmentId(worktreeId, workerId),
    worktreeId,
    kind: WORKER_LAUNCH_ATTACHMENT_KIND,
    locator: launchAttachmentLocator(workerId),
    processId: launch.pid,
    leaseExpiresAt: null,
    metadata: {
      workerId,
      launch: normalizeWorkerLaunchDescriptor(launch),
    } satisfies WorkerLaunchAttachmentMetadata,
    createdAt: launch.createdAt,
    updatedAt: launch.updatedAt,
  };
}

export class WorkerStore {
  readonly cwd: string;
  private persistQueue: Promise<void> = Promise.resolve();
  private readonly pendingPersists = new Map<string, Promise<void>>();
  private readonly pendingTicketRefSyncs = new Map<string, Promise<void>>();
  private readonly persistBySnapshot = new WeakMap<WorkerReadResult, Promise<void>>();
  private readonly ticketSyncBySnapshot = new WeakMap<WorkerReadResult, Promise<void>>();
  private readonly pendingSnapshots = new Map<string, WorkerReadResult>();

  constructor(cwd: string) {
    this.cwd = resolve(cwd);
  }

  initLedger(): { initialized: true; root: string } {
    return { initialized: true, root: getLoomCatalogPaths().catalogPath };
  }

  private workerIds(): string[] {
    return listStoredWorkerRecords(this.cwd).map((worker) => worker.state.workerId);
  }

  private nextWorkerId(title: string): string {
    const base = slugifyWorkerValue(title);
    const existing = new Set(this.workerIds());
    if (!existing.has(base)) {
      return base;
    }
    let index = 2;
    while (existing.has(`${base}-${index}`)) {
      index += 1;
    }
    return `${base}-${index}`;
  }

  resolveWorkerRef(ref: string): string {
    return normalizeWorkerRef(ref);
  }

  private persist(worker: WorkerReadResult, events: WorkerMutationEvent[] = []): Promise<void> {
    const materialized = materializeWorkerRecord(this.cwd, worker);
    const { storage, identity } = openWorkerCatalogSync(this.cwd);
    const existing = findStoredWorkerRow(this.cwd, materialized.summary.id);
    validateProjectedLinksSync(
      storage,
      identity.space.id,
      projectedLinksForWorker(materialized),
      WORKER_PROJECTION_OWNER,
    );
    const previousEntity = existing ? storedWorkerRowToEntity(existing) : null;
    const previousPersist = this.pendingPersists.get(materialized.state.workerId);
    const queueHead = Promise.all([
      this.persistQueue.catch(() => undefined),
      previousPersist?.catch(() => undefined),
    ]).then(() => undefined);
    const persistPromise = queueHead.then(async () => {
      const { entity } = await upsertEntityByDisplayIdWithLifecycleEvents(
        storage,
        {
          kind: ENTITY_KIND,
          spaceId: identity.space.id,
          owningRepositoryId: identity.repository.id,
          displayId: materialized.summary.id,
          title: materialized.summary.title,
          summary: materialized.state.summary || materialized.state.objective,
          status: materialized.summary.status,
          version: (existing?.version ?? 0) + 1,
          tags: [materialized.summary.telemetryState, ...(materialized.state.linkedRefs.ticketIds ?? [])],
          attributes: canonicalWorkerAttributes(materialized),
          createdAt: existing?.created_at ?? materialized.state.createdAt,
          updatedAt: materialized.state.updatedAt,
        },
        {
          actor: WORKER_PROJECTION_OWNER,
          createdPayload: { change: "worker_projected" },
          updatedPayload: { change: "worker_projected" },
        },
      );
      try {
        await syncProjectedEntityLinks({
          storage,
          spaceId: identity.space.id,
          fromEntityId: entity.id,
          projectionOwner: WORKER_PROJECTION_OWNER,
          desired: projectedLinksForWorker(materialized),
          timestamp: materialized.state.updatedAt,
        });
        await syncProjectedArtifacts({
          storage,
          spaceId: identity.space.id,
          owningRepositoryId: identity.repository.id,
          owner: {
            entityId: entity.id,
            kind: ENTITY_KIND,
            displayId: materialized.state.workerId,
          },
          projectionOwner: WORKER_CHECKPOINT_PROJECTION_OWNER,
          desired: checkpointArtifactInputs(materialized),
          timestamp: materialized.state.updatedAt,
          actor: WORKER_PROJECTION_OWNER,
        });
        if (materialized.launch) {
          await storage.upsertRuntimeAttachment(
            launchRuntimeAttachment(identity.worktree.id, materialized.state.workerId, materialized.launch),
          );
        } else {
          await storage.removeRuntimeAttachment(launchAttachmentId(identity.worktree.id, materialized.state.workerId));
        }
        for (const event of events) {
          await appendEntityEvent(
            storage,
            entity.id,
            "updated",
            WORKER_PROJECTION_OWNER,
            event.payload,
            event.createdAt,
          );
        }
      } catch (error) {
        if (previousEntity) {
          await storage.upsertEntity(previousEntity);
        } else {
          storage.db.prepare("DELETE FROM entities WHERE id = ?").run(entity.id);
        }
        throw error;
      }
    });
    this.persistQueue = persistPromise;
    this.pendingPersists.set(materialized.state.workerId, persistPromise);
    this.pendingSnapshots.set(materialized.state.workerId, materialized);
    void persistPromise
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(() => {
        if (this.pendingPersists.get(materialized.state.workerId) === persistPromise) {
          this.pendingPersists.delete(materialized.state.workerId);
        }
        if (this.pendingSnapshots.get(materialized.state.workerId) === materialized) {
          this.pendingSnapshots.delete(materialized.state.workerId);
        }
      });
    return persistPromise;
  }

  private trackDurability(
    worker: WorkerReadResult,
    persistPromise: Promise<void>,
    ticketSyncPromise: Promise<void> = Promise.resolve(),
  ): void {
    this.persistBySnapshot.set(worker, persistPromise);
    this.ticketSyncBySnapshot.set(worker, ticketSyncPromise);
  }

  private queueTicketRefSync(workerId: string, run: () => Promise<void>): Promise<void> {
    const previous = this.pendingTicketRefSyncs.get(workerId);
    const next = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(run);
    this.pendingTicketRefSyncs.set(workerId, next);
    void next
      .catch(() => undefined)
      .finally(() => {
        if (this.pendingTicketRefSyncs.get(workerId) === next) {
          this.pendingTicketRefSyncs.delete(workerId);
        }
      });
    return next;
  }

  private syncWorkerTicketRefs(workerId: string, previousTicketIds: string[], nextTicketIds: string[]): Promise<void> {
    const ticketStore = createTicketStore(this.cwd);
    const previous = new Set(previousTicketIds);
    const next = new Set(nextTicketIds);

    return this.queueTicketRefSync(workerId, async () => {
      await Promise.all(normalizeStringList(nextTicketIds).map((ticketId) => ticketStore.readTicketAsync(ticketId)));
      for (const ticketId of nextTicketIds) {
        await ticketStore.addExternalRefAsync(ticketId, `worker:${workerId}`);
      }
      for (const ticketId of [...previous].filter((ticketId) => !next.has(ticketId))) {
        try {
          await ticketStore.removeExternalRefAsync(ticketId, `worker:${workerId}`);
        } catch (error) {
          if (error instanceof Error && error.message.startsWith("Unknown ticket:")) {
            continue;
          }
          // Deleted tickets have no surviving backlink to clean up.
          throw error;
        }
      }
    });
  }

  listWorkers(filter: WorkerListFilter = {}): WorkerSummary[] {
    const workersById = new Map(
      listStoredWorkerRecords(this.cwd).map((worker) => [
        worker.state.workerId,
        materializeWorkerRecord(this.cwd, worker),
      ]),
    );
    for (const [workerId, worker] of this.pendingSnapshots) {
      workersById.set(workerId, materializeWorkerRecord(this.cwd, worker));
    }
    return filterAndSortWorkerSummaries([...workersById.values()], filter);
  }

  readWorker(ref: string): WorkerReadResult {
    const workerId = this.resolveWorkerRef(ref);
    const pending = this.pendingSnapshots.get(workerId);
    if (pending) {
      return materializeWorkerRecord(this.cwd, pending);
    }
    const row = findStoredWorkerRow(this.cwd, workerId);
    if (!row) {
      throw new Error(`Unknown worker: ${workerId}`);
    }
    const snapshot = readStoredWorkerSnapshot(parseStoredJson<Record<string, unknown>>(row.attributes_json, {}));
    if (!snapshot) {
      throw new Error(`Worker entity ${workerId} is missing structured attributes`);
    }
    return buildWorkerReadResult(this.cwd, row.id, snapshot);
  }

  managerOverview(): ManagerOverview {
    const workers = this.listWorkers();
    const unresolvedInboxWorkers = workers.filter((worker) => worker.unresolvedInboxCount > 0);
    const pendingManagerActionWorkers = workers.filter((worker) => worker.pendingManagerActionCount > 0);
    const pendingApprovalWorkers = workers.filter((worker) => worker.pendingApproval);
    const resumeCandidates = workers.filter((summary) => {
      if (summary.unresolvedInboxCount === 0) {
        return false;
      }
      const worker = this.readWorker(summary.id);
      const ralphRun = maybeReadLinkedRalphRun(this.cwd, worker);
      return ralphRun ? ralphAllowsNextIteration(this.cwd, worker, ralphRun) : false;
    });
    return {
      workers,
      unresolvedInboxWorkers,
      pendingManagerActionWorkers,
      pendingApprovalWorkers,
      resumeCandidates,
    };
  }

  superviseWorkers(refs?: string[], apply = false): Array<{ ref: string; decision: WorkerSupervisionDecision }> {
    const workerRefs =
      refs && refs.length > 0
        ? refs.map((ref) => this.resolveWorkerRef(ref))
        : this.listWorkers().map((worker) => worker.id);
    return workerRefs.map((ref) => ({ ref, decision: this.superviseWorker(ref, apply).decision }));
  }

  private async recordSchedulerObservation(ref: string, summary: string): Promise<void> {
    const worker = this.readWorker(ref);
    worker.state.lastSchedulerAt = currentTimestamp();
    worker.state.lastSchedulerSummary = summary;
    worker.state.updatedAt = currentTimestamp();
    syncDerivedViews(this.cwd, worker);
    const persistPromise = this.persist(worker);
    this.trackDurability(worker, persistPromise);
    await persistPromise;
  }

  async runManagerSchedulerPass(
    options: {
      refs?: string[];
      apply?: boolean;
      executeResumes?: boolean;
      signal?: AbortSignal;
    } = {},
  ): Promise<ManagerSchedulerDecision[]> {
    const workerRefs =
      options.refs && options.refs.length > 0
        ? options.refs.map((ref) => this.resolveWorkerRef(ref))
        : this.listWorkers().map((worker) => worker.id);

    await Promise.all(
      workerRefs.map(async (workerId) => {
        await this.pendingPersists.get(workerId);
        await this.pendingTicketRefSyncs.get(workerId);
      }),
    );

    const decisions: ManagerSchedulerDecision[] = [];

    for (const ref of workerRefs) {
      const worker = this.readWorker(ref);
      const ralphRun = maybeReadLinkedRalphRun(this.cwd, worker);
      if (!ralphRun) {
        const summary = `Worker ${worker.state.workerId} is missing a single readable linked Ralph run.`;
        await this.recordSchedulerObservation(ref, summary);
        decisions.push({ workerId: ref, action: "blocked", applied: false, summary });
        continue;
      }
      const unresolvedCount = unresolvedInbox(worker.messages).length;
      if (worker.state.status === "completion_requested" && worker.state.approval.status === "pending") {
        const summary = "Pending manager approval requires explicit review.";
        await this.recordSchedulerObservation(ref, summary);
        decisions.push({
          workerId: ref,
          action: "needs_approval",
          applied: false,
          summary,
        });
        continue;
      }

      if (worker.launch?.status === "running") {
        const summary = "Worker already has a running launch; scheduler will not start a second concurrent run.";
        await this.recordSchedulerObservation(ref, summary);
        decisions.push({
          workerId: ref,
          action: "wait",
          applied: false,
          summary,
        });
        continue;
      }

      if (["failed", "halted"].includes(ralphRun.state.status)) {
        const summary = `Linked Ralph run ${ralphRun.state.runId} is ${ralphRun.state.status} (${ralphRun.state.stopReason ?? "unknown"}).`;
        await this.recordSchedulerObservation(ref, summary);
        decisions.push({
          workerId: ref,
          action: "blocked",
          applied: false,
          summary,
        });
        continue;
      }

      if (ralphRun.state.waitingFor !== "none") {
        const summary = `Linked Ralph run ${ralphRun.state.runId} is waiting for ${ralphRun.state.waitingFor}; manager action is required before another iteration.`;
        await this.recordSchedulerObservation(ref, summary);
        decisions.push({
          workerId: ref,
          action: "wait",
          applied: false,
          summary,
        });
        continue;
      }

      if (
        unresolvedCount > 0 &&
        ralphAllowsNextIteration(this.cwd, worker, ralphRun)
      ) {
        if (options.apply === true && options.executeResumes === true) {
          const prepared = this.prepareLaunch(ref, true, "Prepared by manager scheduler.");
          await this.persistBySnapshot.get(prepared);
          const running = this.startLaunchExecution(ref);
          await this.persistBySnapshot.get(running);
          if (!running.launch) {
            decisions.push({
              workerId: ref,
              action: "blocked",
              applied: false,
              summary: "Scheduler could not start worker launch execution.",
            });
            continue;
          }
          const execution = await runWorkerLaunch(running.launch, options.signal);
          const finished = this.finishLaunchExecution(ref, execution);
          await this.persistBySnapshot.get(finished);
          const summary = `Scheduler resumed linked Ralph run ${ralphRun.state.runId} because unresolved worker inbox backlog existed (${unresolvedCount}).`;
          await this.recordSchedulerObservation(ref, summary);
          decisions.push({
            workerId: ref,
            action: "resume",
            applied: true,
            summary,
          });
        } else {
          const summary = `Worker has unresolved inbox backlog (${unresolvedCount}) and linked Ralph run ${ralphRun.state.runId} is ready for another iteration.`;
          await this.recordSchedulerObservation(ref, summary);
          decisions.push({
            workerId: ref,
            action: "resume",
            applied: false,
            summary,
          });
        }
        continue;
      }

      const supervision = this.superviseWorker(ref, options.apply === true);
      if (options.apply === true) {
        await this.persistBySnapshot.get(supervision.worker);
      }
      if (supervision.decision.action === "steer" || supervision.decision.action === "escalate") {
        const summary = supervision.decision.message ?? supervision.decision.reasoning;
        await this.recordSchedulerObservation(ref, summary);
        decisions.push({
          workerId: ref,
          action: "message",
          applied: options.apply === true,
          summary,
        });
      } else if (worker.state.status === "blocked" || worker.state.status === "failed") {
        await this.recordSchedulerObservation(ref, supervision.decision.reasoning);
        decisions.push({
          workerId: ref,
          action: "blocked",
          applied: false,
          summary: supervision.decision.reasoning,
        });
      } else {
        await this.recordSchedulerObservation(ref, supervision.decision.reasoning);
        decisions.push({
          workerId: ref,
          action: "wait",
          applied: false,
          summary: supervision.decision.reasoning,
        });
      }
    }

    return decisions;
  }

  createWorker(input: CreateWorkerInput): WorkerReadResult {
    this.initLedger();
    const workerId = input.workerId ? slugifyWorkerValue(input.workerId) : this.nextWorkerId(input.title);
    const timestamp = currentTimestamp();
    const initialLinkedRefs = normalizeLinkedRefs(input.linkedRefs);
    if (initialLinkedRefs.ticketIds.length === 0) {
      throw new Error("Workers require at least one linked ticket id");
    }
    const linkedRefs = ensureLinkedRalphRun(
      this.cwd,
      workerId,
      input.title.trim(),
      normalizeOptionalString(input.objective) ?? "",
      normalizeOptionalString(input.summary) ?? "",
      initialLinkedRefs,
    );
    const workspace = normalizeWorkspaceDescriptor({
      ...defaultWorkspaceDescriptor(workerId),
      ...(input.workspace ?? {}),
    });
    const state: WorkerState = normalizeWorkerState({
      workerId,
      title: input.title.trim(),
      objective: normalizeOptionalString(input.objective) ?? "",
      summary: normalizeOptionalString(input.summary) ?? "",
      status: "requested",
      createdAt: timestamp,
      updatedAt: timestamp,
      managerRef: normalizeManagerRef(input.managerRef ?? defaultManagerRef()),
      linkedRefs,
      workspace,
      latestTelemetry: defaultTelemetry(),
      latestCheckpointId: null,
      latestCheckpointSummary: "",
      lastMessageAt: null,
      lastLaunchAt: null,
      lastSchedulerAt: null,
      lastSchedulerSummary: "",
      launchCount: 0,
      lastRuntimeKind: null,
      interventionCount: 0,
      completionRequest: {
        requestedAt: null,
        scopeComplete: [],
        validationEvidence: [],
        remainingRisks: [],
        branchState: "",
        summary: "",
        requestedBy: "",
      },
      approval: defaultApproval(),
      consolidation: defaultConsolidation(),
      packetSummary: "",
    });
    const artifacts = getWorkerArtifactPaths(this.cwd, workerId);
    const worker: WorkerReadResult = {
      state,
      summary: buildSummary(this.cwd, state, artifacts.dir),
      worker: "",
      messages: [],
      checkpoints: [],
      launch: null,
      dashboard: {} as WorkerDashboard,
      packet: "",
      artifacts,
    };
    syncDerivedViews(this.cwd, worker);
    syncLinkedRalphRun(this.cwd, worker);
    const persistPromise = this.persist(worker);
    const ticketSyncPromise = persistPromise.then(() =>
      this.syncWorkerTicketRefs(worker.state.workerId, [], worker.state.linkedRefs.ticketIds),
    );
    this.trackDurability(worker, persistPromise, ticketSyncPromise);
    void persistPromise.catch(() => undefined);
    void ticketSyncPromise.catch(() => undefined);
    return worker;
  }

  updateWorker(ref: string, input: UpdateWorkerInput): WorkerReadResult {
    const worker = this.readWorker(ref);
    const previousTicketIds = [...worker.state.linkedRefs.ticketIds];
    if (input.title !== undefined) worker.state.title = input.title.trim();
    if (input.objective !== undefined) worker.state.objective = input.objective.trim();
    if (input.summary !== undefined) worker.state.summary = input.summary.trim();
    if (input.status !== undefined) worker.state.status = input.status;
    if (input.managerRef !== undefined)
      worker.state.managerRef = normalizeManagerRef({ ...worker.state.managerRef, ...input.managerRef });
    if (input.linkedRefs !== undefined) {
      worker.state.linkedRefs = mergeLinkedRefs(worker.state.linkedRefs, input.linkedRefs);
    }
    if (worker.state.linkedRefs.ticketIds.length === 0) {
      throw new Error("Workers require at least one linked ticket id");
    }
    worker.state.linkedRefs = ensureLinkedRalphRun(
      this.cwd,
      worker.state.workerId,
      worker.state.title,
      worker.state.objective,
      worker.state.summary,
      worker.state.linkedRefs,
    );
    if (input.workspace !== undefined) {
      worker.state.workspace = normalizeWorkspaceDescriptor({ ...worker.state.workspace, ...input.workspace });
      worker.launch = null;
    }
    worker.state.updatedAt = currentTimestamp();
    syncDerivedViews(this.cwd, worker);
    syncLinkedRalphRun(this.cwd, worker);
    const persistPromise = this.persist(worker);
    const ticketSyncPromise = persistPromise.then(() =>
      this.syncWorkerTicketRefs(worker.state.workerId, previousTicketIds, worker.state.linkedRefs.ticketIds),
    );
    this.trackDurability(worker, persistPromise, ticketSyncPromise);
    void persistPromise.catch(() => undefined);
    void ticketSyncPromise.catch(() => undefined);
    return worker;
  }

  appendMessage(ref: string, input: AppendWorkerMessageInput): WorkerReadResult {
    const worker = this.readWorker(ref);
    const createdAt = input.createdAt ?? currentTimestamp();
    const direction = normalizeMessageDirection(input.direction);
    const kind = normalizeMessageKind(input.kind);
    const awaiting =
      input.awaiting !== undefined ? normalizeMessageAwaiting(input.awaiting) : inferMessageAwaiting(direction, kind);
    const status = input.status ? normalizeMessageStatus(input.status) : inferMessageStatus(awaiting);
    const record: WorkerMessageRecord = {
      id: input.id?.trim() || `${worker.state.workerId}-${nextSequenceId(worker.messages.length, "msg")}`,
      workerId: worker.state.workerId,
      createdAt,
      direction,
      awaiting,
      kind,
      status,
      from:
        normalizeOptionalString(input.from) ??
        (direction === "manager_to_worker" || direction === "broadcast" ? "manager" : "worker"),
      text: input.text.trim(),
      relatedRefs: normalizeStringList(input.relatedRefs),
      replyTo: normalizeOptionalString(input.replyTo),
      acknowledgedAt: status === "acknowledged" || status === "resolved" ? createdAt : null,
      acknowledgedBy:
        status === "acknowledged" || status === "resolved"
          ? (normalizeOptionalString(input.from) ??
            (direction === "manager_to_worker" || direction === "broadcast" ? "manager" : "worker"))
          : null,
      resolvedAt: status === "resolved" ? createdAt : null,
      resolvedBy:
        status === "resolved"
          ? (normalizeOptionalString(input.from) ??
            (direction === "manager_to_worker" || direction === "broadcast" ? "manager" : "worker"))
          : null,
    };
    worker.messages.push(record);
    if (record.direction === "manager_to_worker") {
      worker.state.interventionCount += 1;
    }
    worker.state.lastMessageAt = createdAt;
    worker.state.latestTelemetry.pendingMessages = unresolvedInbox(worker.messages).length;
    worker.state.updatedAt = currentTimestamp();
    syncDerivedViews(this.cwd, worker);
    const persistPromise = this.persist(worker, [
      {
        createdAt,
        payload: {
          change: "message_appended",
          workerId: worker.state.workerId,
          messageId: record.id,
          direction: record.direction,
          kind: record.kind,
          status: record.status,
        },
      },
    ]);
    this.trackDurability(worker, persistPromise);
    void persistPromise.catch(() => undefined);
    return worker;
  }

  private updateMessageState(
    ref: string,
    messageId: string,
    nextState: "acknowledged" | "resolved",
    actor: string,
    note?: string,
  ): WorkerReadResult {
    const worker = this.readWorker(ref);
    const index = worker.messages.findIndex((message) => message.id === messageId);
    if (index === -1) {
      throw new Error(`Unknown worker message: ${messageId}`);
    }
    const message = worker.messages[index];
    if (message.awaiting === "none") {
      throw new Error(`Message ${messageId} does not require inbox action`);
    }
    const timestamp = currentTimestamp();
    worker.messages[index] =
      nextState === "acknowledged"
        ? markMessageAcknowledged(message, timestamp, actor)
        : markMessageResolved(message, timestamp, actor);

    const followUpKind = nextState === "acknowledged" ? "acknowledgement" : "resolution";
    worker.messages.push({
      id: `${worker.state.workerId}-${nextSequenceId(worker.messages.length, "msg")}`,
      workerId: worker.state.workerId,
      createdAt: timestamp,
      direction: message.awaiting === "worker" ? "worker_to_manager" : "manager_to_worker",
      awaiting: "none",
      kind: followUpKind,
      status: "resolved",
      from: actor,
      text: note?.trim() || `${followUpKind} for ${messageId}`,
      relatedRefs: [...message.relatedRefs],
      replyTo: messageId,
      acknowledgedAt: timestamp,
      acknowledgedBy: actor,
      resolvedAt: timestamp,
      resolvedBy: actor,
    });

    worker.state.lastMessageAt = timestamp;
    worker.state.latestTelemetry.pendingMessages = unresolvedInbox(worker.messages).length;
    worker.state.updatedAt = timestamp;
    syncDerivedViews(this.cwd, worker);
    const persistPromise = this.persist(worker, [
      {
        createdAt: timestamp,
        payload: {
          change: nextState === "acknowledged" ? "message_acknowledged" : "message_resolved",
          workerId: worker.state.workerId,
          messageId,
          actor,
          followUpMessageId: worker.messages.at(-1)?.id ?? null,
        },
      },
    ]);
    this.trackDurability(worker, persistPromise);
    void persistPromise.catch(() => undefined);
    return worker;
  }

  acknowledgeMessage(ref: string, messageId: string, actor = "worker", note?: string): WorkerReadResult {
    return this.updateMessageState(ref, messageId, "acknowledged", actor, note);
  }

  resolveMessage(ref: string, messageId: string, actor = "worker", note?: string): WorkerReadResult {
    return this.updateMessageState(ref, messageId, "resolved", actor, note);
  }

  readInbox(ref: string): {
    workerInbox: WorkerMessageRecord[];
    managerInbox: WorkerMessageRecord[];
    recentMessages: WorkerMessageRecord[];
  } {
    const worker = this.readWorker(ref);
    return {
      workerInbox: unresolvedInbox(worker.messages),
      managerInbox: pendingManagerActions(worker.messages),
      recentMessages: worker.messages.slice(-10),
    };
  }

  appendCheckpoint(ref: string, input: AppendWorkerCheckpointInput): WorkerReadResult {
    const worker = this.readWorker(ref);
    const createdAt = input.createdAt ?? currentTimestamp();
    const checkpoint: WorkerCheckpointRecord = {
      id: input.id?.trim() || `${worker.state.workerId}-${nextSequenceId(worker.checkpoints.length, "cp")}`,
      workerId: worker.state.workerId,
      createdAt,
      summary:
        normalizeOptionalString(input.summary) ?? summarizeText(input.understanding ?? worker.state.objective, 160),
      understanding: normalizeOptionalString(input.understanding) ?? worker.state.objective,
      recentChanges: normalizeStringList(input.recentChanges),
      validation: normalizeStringList(input.validation),
      blockers: normalizeStringList(input.blockers),
      nextAction: normalizeOptionalString(input.nextAction) ?? "Continue",
      acknowledgedMessageIds: normalizeStringList(input.acknowledgedMessageIds),
      resolvedMessageIds: normalizeStringList(input.resolvedMessageIds),
      remainingInboxCount:
        typeof input.remainingInboxCount === "number" &&
        Number.isFinite(input.remainingInboxCount) &&
        input.remainingInboxCount >= 0
          ? Math.floor(input.remainingInboxCount)
          : unresolvedInbox(worker.messages).length,
      managerInputRequired: input.managerInputRequired === true,
    };
    worker.checkpoints.push(checkpoint);
    worker.state.latestCheckpointId = checkpoint.id;
    worker.state.latestCheckpointSummary = checkpoint.summary;
    worker.state.latestTelemetry = normalizeTelemetry({
      ...worker.state.latestTelemetry,
      heartbeatAt: createdAt,
      checkpointId: checkpoint.id,
      state:
        checkpoint.blockers.length > 0 ? "blocked" : checkpoint.managerInputRequired ? "waiting_for_review" : "busy",
      summary: checkpoint.summary,
    });
    worker.state.status =
      checkpoint.blockers.length > 0
        ? "blocked"
        : checkpoint.managerInputRequired
          ? "waiting_for_review"
          : worker.state.status === "requested"
            ? "active"
            : worker.state.status;
    worker.state.updatedAt = currentTimestamp();
    syncDerivedViews(this.cwd, worker);
    const persistPromise = this.persist(worker, [
      {
        createdAt,
        payload: {
          change: "checkpoint_appended",
          workerId: worker.state.workerId,
          checkpointId: checkpoint.id,
          remainingInboxCount: checkpoint.remainingInboxCount,
          managerInputRequired: checkpoint.managerInputRequired,
        },
      },
    ]);
    const ticketSyncPromise = persistPromise.then(() =>
      this.queueTicketRefSync(worker.state.workerId, async () => {
        const ticketStore = createTicketStore(this.cwd);
        for (const ticketId of worker.state.linkedRefs.ticketIds) {
          await ticketStore.addJournalEntryAsync(
            ticketId,
            "checkpoint",
            `Worker ${worker.state.workerId} recorded checkpoint ${checkpoint.id}: ${checkpoint.summary}`,
            {
              workerId: worker.state.workerId,
              checkpointId: checkpoint.id,
            },
          );
        }
      }),
    );
    this.trackDurability(worker, persistPromise, ticketSyncPromise);
    void persistPromise.catch(() => undefined);
    void ticketSyncPromise.catch(() => undefined);
    return worker;
  }

  setTelemetry(ref: string, input: SetWorkerTelemetryInput): WorkerReadResult {
    const worker = this.readWorker(ref);
    worker.state.latestTelemetry = normalizeTelemetry({
      ...worker.state.latestTelemetry,
      ...input,
      heartbeatAt: input.heartbeatAt ?? currentTimestamp(),
    });
    const telemetryState = worker.state.latestTelemetry.state;
    if (telemetryState === "blocked") worker.state.status = "blocked";
    if (telemetryState === "waiting_for_review") worker.state.status = "waiting_for_review";
    if (telemetryState === "busy" && worker.state.status === "requested") worker.state.status = "active";
    if (telemetryState === "finished" && worker.state.status === "active") worker.state.status = "completion_requested";
    worker.state.updatedAt = currentTimestamp();
    syncDerivedViews(this.cwd, worker);
    const persistPromise = this.persist(worker);
    this.trackDurability(worker, persistPromise);
    void persistPromise.catch(() => undefined);
    return worker;
  }

  requestCompletion(ref: string, input: RequestWorkerCompletionInput): WorkerReadResult {
    const worker = this.readWorker(ref);
    worker.state.completionRequest = {
      requestedAt: input.requestedAt ?? currentTimestamp(),
      scopeComplete: normalizeStringList(input.scopeComplete),
      validationEvidence: normalizeStringList(input.validationEvidence),
      remainingRisks: normalizeStringList(input.remainingRisks),
      branchState: normalizeOptionalString(input.branchState) ?? worker.state.workspace.branch,
      summary: normalizeOptionalString(input.summary) ?? "Completion requested",
      requestedBy: normalizeOptionalString(input.requestedBy) ?? worker.state.workerId,
    };
    worker.state.approval = {
      ...worker.state.approval,
      status: "pending",
      decidedAt: null,
      decidedBy: null,
      summary: "Pending manager approval",
      rationale: [],
    };
    worker.state.status = "completion_requested";
    worker.state.latestTelemetry = normalizeTelemetry({
      ...worker.state.latestTelemetry,
      state: "waiting_for_review",
      summary: worker.state.completionRequest.summary,
    });
    worker.state.updatedAt = currentTimestamp();
    syncDerivedViews(this.cwd, worker);
    const persistPromise = this.persist(worker, [
      {
        createdAt: worker.state.completionRequest.requestedAt ?? worker.state.updatedAt,
        payload: {
          change: "completion_requested",
          workerId: worker.state.workerId,
          requestedBy: worker.state.completionRequest.requestedBy,
          summary: worker.state.completionRequest.summary,
        },
      },
    ]);
    const ticketSyncPromise = persistPromise.then(() =>
      this.queueTicketRefSync(worker.state.workerId, async () => {
        const ticketStore = createTicketStore(this.cwd);
        for (const ticketId of worker.state.linkedRefs.ticketIds) {
          await ticketStore.addJournalEntryAsync(
            ticketId,
            "state",
            `Worker ${worker.state.workerId} requested completion`,
            {
              workerId: worker.state.workerId,
              summary: worker.state.completionRequest.summary,
            },
          );
        }
      }),
    );
    this.trackDurability(worker, persistPromise, ticketSyncPromise);
    void persistPromise.catch(() => undefined);
    void ticketSyncPromise.catch(() => undefined);
    return worker;
  }

  decideApproval(ref: string, input: DecideWorkerApprovalInput): WorkerReadResult {
    const worker = this.readWorker(ref);
    const status = normalizeApprovalStatus(input.status) as Exclude<ApprovalStatus, "not_requested" | "pending">;
    worker.state.approval = {
      status,
      decidedAt: input.decidedAt ?? currentTimestamp(),
      decidedBy: normalizeOptionalString(input.decidedBy) ?? "manager",
      summary: normalizeOptionalString(input.summary) ?? status,
      rationale: normalizeStringList(input.rationale),
    };
    if (status === "approved") {
      worker.state.status = "approved_for_consolidation";
      worker.state.latestTelemetry = normalizeTelemetry({
        ...worker.state.latestTelemetry,
        state: "waiting_for_review",
        summary: worker.state.approval.summary,
      });
    } else if (status === "rejected_for_revision") {
      worker.state.status = "active";
      worker.state.latestTelemetry = normalizeTelemetry({
        ...worker.state.latestTelemetry,
        state: "busy",
        summary: worker.state.approval.summary,
      });
    } else {
      worker.state.status = "blocked";
      worker.state.latestTelemetry = normalizeTelemetry({
        ...worker.state.latestTelemetry,
        state: "blocked",
        summary: worker.state.approval.summary,
      });
    }
    worker.state.updatedAt = currentTimestamp();
    syncDerivedViews(this.cwd, worker);
    const persistPromise = this.persist(worker, [
      {
        createdAt: worker.state.approval.decidedAt ?? worker.state.updatedAt,
        payload: {
          change: "approval_decided",
          workerId: worker.state.workerId,
          status,
          decidedBy: worker.state.approval.decidedBy,
        },
      },
    ]);
    const ticketSyncPromise = persistPromise.then(() =>
      this.queueTicketRefSync(worker.state.workerId, async () => {
        const ticketStore = createTicketStore(this.cwd);
        for (const ticketId of worker.state.linkedRefs.ticketIds) {
          await ticketStore.addJournalEntryAsync(
            ticketId,
            "state",
            `Worker ${worker.state.workerId} approval decision: ${status}`,
            {
              workerId: worker.state.workerId,
              approval: status,
            },
          );
        }
      }),
    );
    this.trackDurability(worker, persistPromise, ticketSyncPromise);
    void persistPromise.catch(() => undefined);
    void ticketSyncPromise.catch(() => undefined);
    return worker;
  }

  recordConsolidation(ref: string, input: RecordWorkerConsolidationInput): WorkerReadResult {
    const worker = this.readWorker(ref);
    if (worker.state.status !== "approved_for_consolidation") {
      throw new Error("Consolidation requires prior approved_for_consolidation status");
    }
    worker.state.consolidation = normalizeConsolidationOutcome({
      status: input.status,
      strategy: input.strategy ?? null,
      summary: input.summary ?? "",
      validation: input.validation ?? [],
      conflicts: input.conflicts ?? [],
      followUps: input.followUps ?? [],
      decidedAt: input.decidedAt ?? currentTimestamp(),
    });

    const status = input.status;
    if (isSuccessfulConsolidationStatus(status)) {
      worker.state.status = "completed";
      worker.state.latestTelemetry = normalizeTelemetry({
        ...worker.state.latestTelemetry,
        state: "finished",
        summary: worker.state.consolidation.summary,
      });
    } else if (status === "conflicted" || status === "validation_failed") {
      worker.state.status = "blocked";
      worker.state.latestTelemetry = normalizeTelemetry({
        ...worker.state.latestTelemetry,
        state: "blocked",
        summary: worker.state.consolidation.summary,
      });
    } else {
      worker.state.status = "approved_for_consolidation";
    }
    worker.state.updatedAt = currentTimestamp();
    syncDerivedViews(this.cwd, worker);
    const persistPromise = this.persist(worker, [
      {
        createdAt: worker.state.consolidation.decidedAt ?? worker.state.updatedAt,
        payload: {
          change: "consolidation_recorded",
          workerId: worker.state.workerId,
          status,
          strategy: input.strategy ?? null,
        },
      },
    ]);
    const ticketSyncPromise = persistPromise.then(() =>
      this.queueTicketRefSync(worker.state.workerId, async () => {
        const ticketStore = createTicketStore(this.cwd);
        for (const ticketId of worker.state.linkedRefs.ticketIds) {
          await ticketStore.addJournalEntryAsync(
            ticketId,
            isSuccessfulConsolidationStatus(status) ? "verification" : "state",
            `Worker ${worker.state.workerId} consolidation outcome: ${status}`,
            { workerId: worker.state.workerId, consolidationStatus: status, strategy: input.strategy ?? null },
          );
        }
      }),
    );
    this.trackDurability(worker, persistPromise, ticketSyncPromise);
    void persistPromise.catch(() => undefined);
    void ticketSyncPromise.catch(() => undefined);
    return worker;
  }

  superviseWorker(ref: string, apply = false): { worker: WorkerReadResult; decision: WorkerSupervisionDecision } {
    const worker = this.readWorker(ref);
    const ralphRun = maybeReadLinkedRalphRun(this.cwd, worker);
    const recentCheckpoints = worker.checkpoints.slice(-3);
    const recentSummaries = recentCheckpoints.map((checkpoint) => checkpoint.summary.trim()).filter(Boolean);
    const repeatedSummary = recentSummaries.length >= 3 && new Set(recentSummaries).size === 1;
    const blockerSignature = recentCheckpoints
      .map((checkpoint) => checkpoint.blockers.join("|").trim())
      .filter(Boolean);
    const repeatedBlockers = blockerSignature.length >= 3 && new Set(blockerSignature).size === 1;
    const lastHeartbeat = worker.state.latestTelemetry.heartbeatAt
      ? new Date(worker.state.latestTelemetry.heartbeatAt).getTime()
      : 0;
    const stale = lastHeartbeat > 0 ? Date.now() - lastHeartbeat > 1000 * 60 * 15 : worker.state.status !== "requested";

    let decision: WorkerSupervisionDecision;


    if (!ralphRun) {
      decision = {
        action: "escalate",
        confidence: 0.99,
        reasoning: "Worker wrapper is missing a single readable linked Ralph run.",
        message: "Repair the worker-to-Ralph linkage before supervising or resuming this worker again.",
        evidence: worker.state.linkedRefs.ralphRunIds,
      };
    } else if (worker.state.status === "completion_requested" && worker.state.approval.status === "pending") {
      const hasEvidence = worker.state.completionRequest.validationEvidence.length > 0;
      decision = hasEvidence
        ? {
            action: "approve",
            confidence: 0.9,
            reasoning: "Worker is waiting for review and provided validation evidence.",
            message: "Completion evidence is present. Approve if the claimed scope matches expectations.",
            evidence: [...worker.state.completionRequest.validationEvidence],
          }
        : {
            action: "steer",
            confidence: 0.86,
            reasoning: "Worker requested completion without validation evidence.",
            message: "Before approval, provide concrete validation evidence and remaining-risk detail.",
            evidence: [worker.state.completionRequest.summary],
          };
    } else if (repeatedBlockers || repeatedSummary) {
      decision = {
        action: "escalate",
        confidence: 0.94,
        reasoning: "Worker has repeated the same blocker or no-progress checkpoint pattern several times.",
        message:
          "Escalating: repeated blocker/no-progress pattern detected. Reassess assignment, unblock explicitly, or retire the worker.",
        evidence: blockerSignature.length > 0 ? blockerSignature : recentSummaries,
      };
    } else if (ralphRun.state.status === "failed" || ralphRun.state.status === "halted") {
      decision = {
        action: "escalate",
        confidence: 0.97,
        reasoning: "Linked Ralph run recorded a terminal failure or halt between worker iterations.",
        message: `Linked Ralph run ${ralphRun.state.runId} is ${ralphRun.state.status}. Inspect the durable post-iteration state before resuming this worker.`,
        evidence: [ralphRun.state.stopReason ?? "unknown", ralphRun.state.summary, ralphRun.state.postIteration?.summary ?? ""]
          .map((value) => value.trim())
          .filter(Boolean),
      };
    } else if (ralphRun.state.waitingFor !== "none") {
      decision = {
        action: "steer",
        confidence: 0.92,
        reasoning: "Linked Ralph run is review-gated between iterations and cannot truthfully continue yet.",
        message: `Linked Ralph run ${ralphRun.state.runId} is waiting for ${ralphRun.state.waitingFor}. Resolve that gate before scheduling another iteration.`,
        evidence: [ralphRun.state.postIteration?.summary ?? "", ralphRun.state.latestDecision?.summary ?? ""]
          .map((value) => value.trim())
          .filter(Boolean),
      };
    } else if (worker.state.latestTelemetry.state === "busy" && !stale) {
      decision = {
        action: "continue",
        confidence: 0.88,
        reasoning: "Worker is actively progressing and does not currently need interruption.",
        message: null,
        evidence: [worker.state.latestTelemetry.summary || "recent heartbeat active"],
      };
    } else if (worker.state.latestTelemetry.state === "blocked" || stale) {
      decision = {
        action: "steer",
        confidence: 0.91,
        reasoning: stale
          ? "Worker heartbeat is stale and needs an explicit manager intervention."
          : "Worker is blocked and waiting on manager action.",
        message: stale
          ? "Status has gone stale. Send a checkpoint or reprovision/resume the worker before more time is lost."
          : "A blocker is active. Resolve the blocker or explicitly escalate/reassign the work.",
        evidence: [worker.state.latestTelemetry.summary, worker.state.latestCheckpointSummary].filter(Boolean),
      };
    } else if (worker.state.latestTelemetry.state === "waiting_for_review") {
      decision = {
        action: "steer",
        confidence: 0.87,
        reasoning: "Worker is waiting for a manager decision and should not be left idle.",
        message: "Manager input is required. Approve, reject, escalate, or provide the missing guidance now.",
        evidence: [worker.state.latestCheckpointSummary, worker.state.completionRequest.summary].filter(Boolean),
      };
    } else {
      decision = {
        action: "continue",
        confidence: 0.7,
        reasoning: "No urgent intervention signal detected from compact worker state.",
        message: null,
        evidence: [worker.state.latestTelemetry.summary, worker.state.latestCheckpointSummary].filter(Boolean),
      };
    }

    if (apply && decision.message) {
      this.appendMessage(worker.state.workerId, {
        direction: "manager_to_worker",
        kind:
          decision.action === "escalate"
            ? "escalation"
            : decision.action === "approve"
              ? "approval_decision"
              : "unblock",
        text: decision.message,
        relatedRefs: worker.state.linkedRefs.ticketIds,
      });
      return { worker: this.readWorker(worker.state.workerId), decision };
    }

    return { worker, decision };
  }

  prepareLaunch(
    ref: string,
    resume = false,
    note?: string,
  ): WorkerReadResult {
    const worker = this.readWorker(ref);
    worker.state.linkedRefs = ensureLinkedRalphRun(
      this.cwd,
      worker.state.workerId,
      worker.state.title,
      worker.state.objective,
      worker.state.summary,
      worker.state.linkedRefs,
    );
    syncLinkedRalphRun(this.cwd, worker);
    const launch = prepareWorkerLaunchDescriptor(this.cwd, worker, { resume, note });
    worker.launch = launch;
    worker.state.lastLaunchAt = launch.updatedAt;
    worker.state.launchCount += 1;
    worker.state.updatedAt = currentTimestamp();
    syncDerivedViews(this.cwd, worker);
    const persistPromise = this.persist(worker, [
      {
        createdAt: launch.updatedAt,
        payload: {
          change: "launch_prepared",
          workerId: worker.state.workerId,
          ralphRunId: launch.ralphRunId,
          iterationId: launch.iterationId,
          runtime: launch.runtime,
          resume: launch.resume,
          branch: launch.branch,
        },
      },
    ]);
    this.trackDurability(worker, persistPromise);
    void persistPromise.catch(() => undefined);
    return worker;
  }

  startLaunchExecution(ref: string): WorkerReadResult {
    const worker = this.readWorker(ref);
    if (!worker.launch) {
      throw new Error("Worker launch descriptor has not been prepared");
    }
    const startedAt = currentTimestamp();
    const summary = worker.launch.resume
      ? `Linked Ralph run ${worker.launch.ralphRunId} resumed at iteration ${worker.launch.iterationId}`
      : `Linked Ralph run ${worker.launch.ralphRunId} launched iteration ${worker.launch.iterationId}`;
    worker.launch = {
      ...worker.launch,
      updatedAt: startedAt,
      status: "running",
      note: summary,
    };
    worker.state.status = "active";
    worker.state.lastLaunchAt = startedAt;
    worker.state.lastRuntimeKind = normalizeRuntimeKind(worker.launch.runtime);
    worker.state.latestTelemetry = normalizeTelemetry({
      ...worker.state.latestTelemetry,
      state: "busy",
      heartbeatAt: startedAt,
      summary,
    });
    worker.state.updatedAt = startedAt;
    syncDerivedViews(this.cwd, worker);
    const persistPromise = this.persist(worker, [
      {
        createdAt: startedAt,
        payload: {
          change: "launch_started",
          workerId: worker.state.workerId,
          ralphRunId: worker.launch.ralphRunId,
          iterationId: worker.launch.iterationId,
          runtime: worker.launch.runtime,
          resume: worker.launch.resume,
        },
      },
    ]);
    this.trackDurability(worker, persistPromise);
    void persistPromise.catch(() => undefined);
    return worker;
  }

  finishLaunchExecution(ref: string, execution: WorkerExecutionResult): WorkerReadResult {
    const worker = this.readWorker(ref);
    if (!worker.launch) {
      throw new Error("Worker launch descriptor has not been prepared");
    }
    const finishedAt = currentTimestamp();
    let summary = executionSummary(execution);
    let launchStatus = execution.status === "cancelled" ? "failed" : execution.status;
    let completedOutcome: ReturnType<typeof executionSummaryFromRalph> | null = null;

    if (execution.status === "completed") {
      completedOutcome = executionSummaryFromRalph(this.cwd, worker, summary, finishedAt);
      summary = completedOutcome.summary;
      if (completedOutcome.status === "failed") {
        launchStatus = "failed";
      }
    }

    worker.launch = {
      ...worker.launch,
      updatedAt: finishedAt,
      status: launchStatus,
      pid: null,
      note: summary,
    };

    if (execution.status === "completed" && launchStatus === "completed") {
      const nextState = completedOutcome ?? executionSummaryFromRalph(this.cwd, worker, summary, finishedAt);
      worker.state.status = nextState.status;
      worker.state.latestTelemetry = normalizeTelemetry({
        ...worker.state.latestTelemetry,
        state: nextState.telemetryState,
        heartbeatAt: finishedAt,
        summary,
      });
    } else if (execution.status === "completed") {
      worker.state.status = "failed";
      worker.state.latestTelemetry = normalizeTelemetry({
        ...worker.state.latestTelemetry,
        state: "blocked",
        heartbeatAt: finishedAt,
        summary,
      });
    } else if (execution.status === "cancelled") {
      worker.state.status = "blocked";
      worker.state.latestTelemetry = normalizeTelemetry({
        ...worker.state.latestTelemetry,
        state: "blocked",
        heartbeatAt: finishedAt,
        summary: `Execution cancelled: ${summary}`,
      });
      worker.launch.note = `Execution cancelled: ${summary}`;
    } else {
      worker.state.status = "failed";
      worker.state.latestTelemetry = normalizeTelemetry({
        ...worker.state.latestTelemetry,
        state: "blocked",
        heartbeatAt: finishedAt,
        summary,
      });
    }

    worker.state.updatedAt = finishedAt;
    syncDerivedViews(this.cwd, worker);
    const persistPromise = this.persist(worker, [
      {
        createdAt: finishedAt,
        payload: {
          change: execution.status === "cancelled" ? "launch_cancelled" : "launch_finished",
          workerId: worker.state.workerId,
          ralphRunId: worker.launch.ralphRunId,
          iterationId: worker.launch.iterationId,
          executionStatus: execution.status,
          launchStatus,
          runtime: worker.launch.runtime,
        },
      },
    ]);
    this.trackDurability(worker, persistPromise);
    void persistPromise.catch(() => undefined);
    return worker;
  }

  retireWorker(ref: string, note?: string): WorkerReadResult {
    const worker = this.readWorker(ref);
    if (worker.launch?.workspaceDir) {
      retireWorkerWorkspace(this.cwd, worker.state.workerId, worker.launch.workspaceDir);
    }
    worker.state.status = "retired";
    worker.state.latestTelemetry = normalizeTelemetry({
      ...worker.state.latestTelemetry,
      state: "finished",
      summary: normalizeOptionalString(note) ?? "Worker retired",
    });
    worker.state.updatedAt = currentTimestamp();
    if (worker.launch) {
      worker.launch = {
        ...worker.launch,
        updatedAt: currentTimestamp(),
        status: "retired",
        note: normalizeOptionalString(note) ?? "Worker retired",
      };
    }
    syncDerivedViews(this.cwd, worker);
    const persistPromise = this.persist(worker, [
      {
        createdAt: worker.state.updatedAt,
        payload: {
          change: "launch_cancelled",
          workerId: worker.state.workerId,
          reason: normalizeOptionalString(note) ?? "Worker retired",
        },
      },
    ]);
    this.trackDurability(worker, persistPromise);
    void persistPromise.catch(() => undefined);
    return worker;
  }

  renderList(filter: WorkerListFilter = {}): string {
    return renderWorkerList(this.listWorkers(filter));
  }

  renderDetail(ref: string): string {
    return renderWorkerDetail(this.readWorker(ref));
  }

  renderDashboard(ref: string): string {
    return renderWorkerDashboard(this.readWorker(ref).dashboard);
  }

  renderLaunch(ref: string): string {
    const worker = this.readWorker(ref);
    if (!worker.launch) {
      throw new Error("Worker launch descriptor has not been prepared");
    }
    return renderLaunchDescriptor(worker.launch);
  }

  initLedgerAsync(): Promise<{ initialized: true; root: string }> {
    return Promise.resolve(this.initLedger());
  }

  async listWorkersAsync(filter: WorkerListFilter = {}): Promise<WorkerSummary[]> {
    return filterAndSortWorkerSummaries(listStoredWorkerRecords(this.cwd), filter);
  }

  async readWorkerAsync(ref: string): Promise<WorkerReadResult> {
    const workerId = this.resolveWorkerRef(ref);
    await this.pendingPersists.get(workerId);
    await this.pendingTicketRefSyncs.get(workerId);
    return this.readWorker(workerId);
  }

  async managerOverviewAsync(): Promise<ManagerOverview> {
    const workers = await this.listWorkersAsync({});
    return {
      workers,
      unresolvedInboxWorkers: workers.filter((worker) => worker.unresolvedInboxCount > 0),
      pendingManagerActionWorkers: workers.filter((worker) => worker.pendingManagerActionCount > 0),
      pendingApprovalWorkers: workers.filter((worker) => worker.pendingApproval),
      resumeCandidates: workers.filter((summary) => {
        if (summary.unresolvedInboxCount === 0) {
          return false;
        }
        const worker = this.readWorker(summary.id);
        const ralphRun = maybeReadLinkedRalphRun(this.cwd, worker);
        return ralphRun ? ralphAllowsNextIteration(this.cwd, worker, ralphRun) : false;
      }),
    };
  }

  async createWorkerAsync(input: CreateWorkerInput): Promise<WorkerReadResult> {
    const worker = this.createWorker(input);
    const persistPromise = this.persistBySnapshot.get(worker);
    const ticketSyncPromise = this.ticketSyncBySnapshot.get(worker);
    await persistPromise;
    await ticketSyncPromise;
    return materializeWorkerRecord(this.cwd, worker);
  }

  async updateWorkerAsync(ref: string, input: UpdateWorkerInput): Promise<WorkerReadResult> {
    const worker = this.updateWorker(ref, input);
    const persistPromise = this.persistBySnapshot.get(worker);
    const ticketSyncPromise = this.ticketSyncBySnapshot.get(worker);
    await persistPromise;
    await ticketSyncPromise;
    return materializeWorkerRecord(this.cwd, worker);
  }

  async appendMessageAsync(ref: string, input: AppendWorkerMessageInput): Promise<WorkerReadResult> {
    const worker = this.appendMessage(ref, input);
    const persistPromise = this.persistBySnapshot.get(worker);
    await persistPromise;
    return materializeWorkerRecord(this.cwd, worker);
  }

  async acknowledgeMessageAsync(
    ref: string,
    messageId: string,
    actor = "worker",
    note?: string,
  ): Promise<WorkerReadResult> {
    const worker = this.acknowledgeMessage(ref, messageId, actor, note);
    const persistPromise = this.persistBySnapshot.get(worker);
    await persistPromise;
    return materializeWorkerRecord(this.cwd, worker);
  }

  async resolveMessageAsync(
    ref: string,
    messageId: string,
    actor = "worker",
    note?: string,
  ): Promise<WorkerReadResult> {
    const worker = this.resolveMessage(ref, messageId, actor, note);
    const persistPromise = this.persistBySnapshot.get(worker);
    await persistPromise;
    return materializeWorkerRecord(this.cwd, worker);
  }

  async readInboxAsync(ref: string): Promise<ReturnType<WorkerStore["readInbox"]>> {
    const worker = await this.readWorkerAsync(ref);
    return {
      workerInbox: unresolvedInbox(worker.messages),
      managerInbox: pendingManagerActions(worker.messages),
      recentMessages: worker.messages.slice(-10),
    };
  }

  async appendCheckpointAsync(ref: string, input: AppendWorkerCheckpointInput): Promise<WorkerReadResult> {
    const worker = this.appendCheckpoint(ref, input);
    const persistPromise = this.persistBySnapshot.get(worker);
    const ticketSyncPromise = this.ticketSyncBySnapshot.get(worker);
    await persistPromise;
    await ticketSyncPromise;
    return materializeWorkerRecord(this.cwd, worker);
  }

  async setTelemetryAsync(ref: string, input: SetWorkerTelemetryInput): Promise<WorkerReadResult> {
    const worker = this.setTelemetry(ref, input);
    const persistPromise = this.persistBySnapshot.get(worker);
    await persistPromise;
    return materializeWorkerRecord(this.cwd, worker);
  }

  async requestCompletionAsync(ref: string, input: RequestWorkerCompletionInput): Promise<WorkerReadResult> {
    const worker = this.requestCompletion(ref, input);
    const persistPromise = this.persistBySnapshot.get(worker);
    const ticketSyncPromise = this.ticketSyncBySnapshot.get(worker);
    await persistPromise;
    await ticketSyncPromise;
    return materializeWorkerRecord(this.cwd, worker);
  }

  async decideApprovalAsync(ref: string, input: DecideWorkerApprovalInput): Promise<WorkerReadResult> {
    const worker = this.decideApproval(ref, input);
    const persistPromise = this.persistBySnapshot.get(worker);
    const ticketSyncPromise = this.ticketSyncBySnapshot.get(worker);
    await persistPromise;
    await ticketSyncPromise;
    return materializeWorkerRecord(this.cwd, worker);
  }

  async recordConsolidationAsync(ref: string, input: RecordWorkerConsolidationInput): Promise<WorkerReadResult> {
    const worker = this.recordConsolidation(ref, input);
    const persistPromise = this.persistBySnapshot.get(worker);
    const ticketSyncPromise = this.ticketSyncBySnapshot.get(worker);
    await persistPromise;
    await ticketSyncPromise;
    return materializeWorkerRecord(this.cwd, worker);
  }

  async superviseWorkersAsync(
    refs?: string[],
    apply = false,
  ): Promise<Array<{ ref: string; decision: WorkerSupervisionDecision }>> {
    return this.superviseWorkers(refs, apply);
  }

  async prepareLaunchAsync(
    ref: string,
    resume = false,
    note?: string,
  ): Promise<WorkerReadResult> {
    const worker = this.prepareLaunch(ref, resume, note);
    const persistPromise = this.persistBySnapshot.get(worker);
    await persistPromise;
    return materializeWorkerRecord(this.cwd, worker);
  }

  async startLaunchExecutionAsync(ref: string): Promise<WorkerReadResult> {
    const worker = this.startLaunchExecution(ref);
    const persistPromise = this.persistBySnapshot.get(worker);
    await persistPromise;
    return materializeWorkerRecord(this.cwd, worker);
  }

  async finishLaunchExecutionAsync(ref: string, execution: WorkerExecutionResult): Promise<WorkerReadResult> {
    const worker = this.finishLaunchExecution(ref, execution);
    const persistPromise = this.persistBySnapshot.get(worker);
    await persistPromise;
    return materializeWorkerRecord(this.cwd, worker);
  }

  async retireWorkerAsync(ref: string, note?: string): Promise<WorkerReadResult> {
    const worker = this.retireWorker(ref, note);
    const persistPromise = this.persistBySnapshot.get(worker);
    await persistPromise;
    return materializeWorkerRecord(this.cwd, worker);
  }

  renderListAsync(filter: WorkerListFilter = {}): Promise<string> {
    return this.listWorkersAsync(filter).then((workers) => renderWorkerList(workers));
  }

  renderDetailAsync(ref: string): Promise<string> {
    return this.readWorkerAsync(ref).then((worker) => renderWorkerDetail(worker));
  }

  renderDashboardAsync(ref: string): Promise<string> {
    return this.readWorkerAsync(ref).then((worker) => renderWorkerDashboard(worker.dashboard));
  }

  renderLaunchAsync(ref: string): Promise<string> {
    return this.readWorkerAsync(ref).then((worker) => {
      if (!worker.launch) {
        throw new Error("Worker launch descriptor has not been prepared");
      }
      return renderLaunchDescriptor(worker.launch);
    });
  }
}

export function createWorkerStore(cwd: string): WorkerStore {
  return new WorkerStore(cwd);
}
