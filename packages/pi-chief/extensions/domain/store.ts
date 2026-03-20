import { resolve } from "node:path";
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
import type {
  CreateWorkerInput,
  ManagerLinkedRefs,
  PrepareWorkerLaunchInput,
  RecordWorkerOutcomeInput,
  UpdateWorkerInput,
  WorkerCanonicalRecord,
  WorkerLaunchAttachmentMetadata,
  WorkerListFilter,
  WorkerReadResult,
  WorkerRuntimeDescriptor,
  WorkerState,
  WorkerStatus,
  WorkerSummary,
  WorkerWorkspaceDescriptor,
} from "./models.js";
import {
  currentTimestamp,
  ensureRelativeOrLogicalRef,
  normalizeOptionalString,
  normalizeRuntimeKind,
  normalizeStringList,
  normalizeWorkspaceDescriptor,
  summarizeText,
} from "./normalize.js";
import { getWorkerArtifactPaths, normalizeWorkerRef, slugifyWorkerValue } from "./paths.js";
import { renderLaunchDescriptor, renderWorkerDetail, renderWorkerList } from "./render.js";
import { prepareWorkerLaunchDescriptor, retireWorkerWorkspace, type WorkerExecutionResult } from "./runtime.js";

const ENTITY_KIND = "worker" as const;
const WORKER_PROJECTION_OWNER = "worker-store" as const;
const WORKER_LAUNCH_ATTACHMENT_KIND = "launch_descriptor" as const;
const WORKER_ACTOR = "worker-store" as const;

interface WorkerEntityAttributes extends WorkerCanonicalRecord {}

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

function openWorkerCatalogSync(cwd: string) {
  return openWorkspaceStorageSync(cwd);
}

function parseStoredJson<T>(value: string, fallback: T): T {
  if (!value.trim()) {
    return fallback;
  }
  return JSON.parse(value) as T;
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

function hasStructuredWorkerAttributes(attributes: unknown): attributes is WorkerEntityAttributes {
  return Boolean(attributes && typeof attributes === "object" && "state" in attributes);
}

function readStoredWorkerSnapshot(rawAttributes: unknown): WorkerEntityAttributes | null {
  if (!hasStructuredWorkerAttributes(rawAttributes)) {
    return null;
  }
  return { state: normalizeWorkerState(rawAttributes.state as WorkerState) };
}

function launchAttachmentId(worktreeId: string, workerId: string): string {
  return createStableLoomId("attachment", [worktreeId, WORKER_LAUNCH_ATTACHMENT_KIND, workerId]);
}

function launchAttachmentLocator(workerId: string): string {
  return getWorkerArtifactPaths(".", workerId).launch;
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

function normalizeWorkerStatus(value: string | null | undefined): WorkerStatus {
  if (value === "running" || value === "waiting_for_manager" || value === "completed" || value === "failed" || value === "retired") {
    return value;
  }
  return "queued";
}

function normalizeWorkerWorkspace(workerId: string, workspace?: Partial<WorkerWorkspaceDescriptor>): WorkerWorkspaceDescriptor {
  const normalized = normalizeWorkspaceDescriptor({
    workspaceKey: `worker-runtime:${workerId}`,
    branch: workerId,
    baseRef: "HEAD",
    ...workspace,
  });
  normalized.repositoryRoot = ensureRelativeOrLogicalRef(normalized.repositoryRoot, "repository root");
  normalized.workspaceKey = ensureRelativeOrLogicalRef(normalized.workspaceKey, "workspace key");
  return normalized;
}

function normalizeWorkerState(state: WorkerState): WorkerState {
  const workerId = normalizeWorkerRef(state.workerId);
  return {
    workerId,
    title: normalizeOptionalString(state.title) ?? workerId,
    objective: normalizeOptionalString(state.objective) ?? "",
    summary: normalizeOptionalString(state.summary) ?? "",
    status: normalizeWorkerStatus(state.status),
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    managerId: normalizeOptionalString(state.managerId) ?? "",
    ticketId: normalizeOptionalString(state.ticketId) ?? "",
    ralphRunId: normalizeOptionalString(state.ralphRunId) ?? `${workerId}-loop`,
    workspace: normalizeWorkerWorkspace(workerId, state.workspace),
    pendingInstructions: normalizeStringList(state.pendingInstructions),
    lastLaunchAt: normalizeOptionalString(state.lastLaunchAt),
  };
}

function buildSummary(state: WorkerState, workerRef: string): WorkerSummary {
  return {
    id: state.workerId,
    title: state.title,
    status: state.status,
    updatedAt: state.updatedAt,
    ticketId: state.ticketId,
    branch: state.workspace.branch,
    baseRef: state.workspace.baseRef,
    ralphRunId: state.ralphRunId,
    latestSummary: summarizeText(state.summary || state.objective, 160),
    workerRef,
  };
}

function renderWorkerMarkdown(result: WorkerReadResult): string {
  const { state } = result;
  return `---
id: ${state.workerId}
title: "${state.title.replace(/"/g, '\\"')}"
status: ${state.status}
manager: ${state.managerId}
ticket: ${state.ticketId}
ralph-run: ${state.ralphRunId}
workspace-branch: ${state.workspace.branch}
workspace-base-ref: ${state.workspace.baseRef}
updated-at: ${state.updatedAt}
---

## Summary
${state.summary || state.objective || "No summary yet."}

## Objective
${state.objective || "No objective recorded."}

## Pending instructions
${state.pendingInstructions.join("\n") || "No queued instructions."}
`;
}

function materializeWorkerRecord(cwd: string, ownerEntityId: string, state: WorkerState): WorkerReadResult {
  const artifacts = getWorkerArtifactPaths(cwd, state.workerId);
  const launch = readLaunchAttachmentSync(cwd, state.workerId);
  const summary = buildSummary(state, artifacts.dir);
  return {
    state,
    summary,
    worker: renderWorkerMarkdown({ state, summary, worker: "", launch, artifacts }),
    launch,
    artifacts,
  };
}

function canonicalWorkerAttributes(worker: WorkerReadResult): WorkerEntityAttributes {
  return { state: normalizeWorkerState(worker.state) };
}

function workerLaunchAttachment(worktreeId: string, workerId: string, launch: WorkerRuntimeDescriptor): LoomRuntimeAttachment {
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

function projectedLinksForWorker(worker: WorkerReadResult): ProjectedEntityLinkInput[] {
  const desired: ProjectedEntityLinkInput[] = [
    { kind: "implements", targetKind: "ticket", targetDisplayId: worker.state.ticketId },
    { kind: "references", targetKind: "ralph_run", targetDisplayId: worker.state.ralphRunId },
  ];
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
    return materializeWorkerRecord(cwd, row.id, snapshot.state);
  });
}

function workerSearchText(worker: WorkerReadResult): string[] {
  return [
    worker.summary.id,
    worker.summary.title,
    worker.state.objective,
    worker.state.summary,
    worker.state.ticketId,
    worker.state.ralphRunId,
    worker.state.workspace.branch,
    worker.state.workspace.baseRef,
    ...worker.state.pendingInstructions,
  ];
}

function filterAndSortWorkerSummaries(records: WorkerReadResult[], filter: WorkerListFilter = {}): WorkerSummary[] {
  const filtered = records.filter((worker) => !filter.status || worker.summary.status === filter.status);
  return filterAndSortListEntries(
    filtered.map((worker) => ({
      item: worker.summary,
      id: worker.summary.id,
      createdAt: worker.state.createdAt,
      updatedAt: worker.summary.updatedAt,
      fields: [
        { value: worker.summary.id, weight: 12 },
        { value: worker.summary.title, weight: 10 },
        { value: worker.summary.latestSummary, weight: 8 },
        { value: workerSearchText(worker).join(" "), weight: 4 },
      ],
    })),
    { text: filter.text, sort: filter.sort },
  );
}

function workerRalphLinkedRefs(ticketId: string, linkedRefs?: Partial<ManagerLinkedRefs>) {
  return {
    initiativeIds: normalizeStringList(linkedRefs?.initiativeIds),
    researchIds: normalizeStringList(linkedRefs?.researchIds),
    specChangeIds: normalizeStringList(linkedRefs?.specChangeIds),
    ticketIds: [ticketId],
    critiqueIds: normalizeStringList(linkedRefs?.critiqueIds),
    docIds: normalizeStringList(linkedRefs?.docIds),
    planIds: normalizeStringList(linkedRefs?.planIds),
  };
}

async function ensureWorkerRalphRunAsync(cwd: string, input: CreateWorkerInput, workerId: string): Promise<string> {
  if (input.ralphRunId?.trim()) {
    return input.ralphRunId.trim();
  }
  const run = await createRalphStore(cwd).createRunAsync({
    runId: `${workerId}-loop`,
    title: input.title,
    objective: normalizeOptionalString(input.objective) ?? normalizeOptionalString(input.summary) ?? input.title,
    summary: normalizeOptionalString(input.summary) ?? `Ticket worker ${workerId} for ${input.ticketId}`,
    linkedRefs: workerRalphLinkedRefs(input.ticketId, input.linkedRefs),
  });
  return run.state.runId;
}

async function syncLinkedRalphRunAsync(cwd: string, worker: WorkerReadResult): Promise<void> {
  const store = createRalphStore(cwd);
  try {
    await store.updateRunAsync(worker.state.ralphRunId, {
      title: worker.state.title,
      objective: worker.state.objective || worker.state.summary,
      summary: worker.state.summary || worker.state.objective,
      linkedRefs: { ticketIds: [worker.state.ticketId] },
    });
  } catch {
    await store.createRunAsync({
      runId: worker.state.ralphRunId,
      title: worker.state.title,
      objective: worker.state.objective || worker.state.summary || worker.state.title,
      summary: worker.state.summary || worker.state.objective || worker.state.title,
      linkedRefs: { ticketIds: [worker.state.ticketId] },
    });
  }
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

function executionSummaryFromRalph(cwd: string, worker: WorkerReadResult): { status: WorkerStatus; summary: string } {
  const run = createRalphStore(cwd).readRun(worker.state.ralphRunId);
  const postIteration = run.state.postIteration;
  if (!postIteration || postIteration.iterationId !== worker.launch?.iterationId || postIteration.decision === null) {
    return {
      status: "failed",
      summary: "Linked Ralph iteration exited without durable post-iteration state and explicit decision for the prepared iteration.",
    };
  }
  const summary = summarizeText([postIteration.summary, postIteration.workerSummary].filter(Boolean).join(" — "));
  if (["failed", "halted", "archived"].includes(run.state.status)) {
    return {
      status: "failed",
      summary: summary || `Linked Ralph run ${run.state.runId} ended in status ${run.state.status}.`,
    };
  }
  return {
    status: "waiting_for_manager",
    summary: summary || `Worker iteration ${postIteration.iteration} completed and is ready for manager review.`,
  };
}

async function syncTicketExternalRef(cwd: string, ticketId: string, workerId: string, present: boolean): Promise<void> {
  const ticketStore = createTicketStore(cwd);
  const current = await ticketStore.readTicketAsync(ticketId);
  const normalizedRef = `worker:${workerId}`;
  const hasRef = current.ticket.frontmatter["external-refs"].includes(normalizedRef);
  if (present === hasRef) {
    return;
  }
  await ticketStore.updateTicketAsync(ticketId, {
    externalRefs: present
      ? normalizeStringList([...current.ticket.frontmatter["external-refs"], normalizedRef])
      : current.ticket.frontmatter["external-refs"].filter((value) => value !== normalizedRef),
  });
}

async function appendWorkerJournal(
  cwd: string,
  ticketId: string,
  kind: "state" | "verification",
  text: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await createTicketStore(cwd).addJournalEntryAsync(ticketId, kind, text, metadata);
}

export class WorkerStore {
  constructor(readonly cwd: string) {}

  initLedger(): { initialized: true; root: string } {
    return { initialized: true, root: getLoomCatalogPaths().catalogPath };
  }

  async initLedgerAsync(): Promise<{ initialized: true; root: string }> {
    return this.initLedger();
  }

  resolveWorkerRef(ref: string): string {
    return normalizeWorkerRef(ref);
  }

  listWorkers(filter: WorkerListFilter = {}): WorkerSummary[] {
    return filterAndSortWorkerSummaries(listStoredWorkerRecords(this.cwd), filter);
  }

  async listWorkersAsync(filter: WorkerListFilter = {}): Promise<WorkerSummary[]> {
    return this.listWorkers(filter);
  }

  readWorker(ref: string): WorkerReadResult {
    const workerId = normalizeWorkerRef(ref);
    const row = findStoredWorkerRow(this.cwd, workerId);
    if (!row) {
      throw new Error(`Unknown worker: ${ref}`);
    }
    const snapshot = readStoredWorkerSnapshot(parseStoredJson<Record<string, unknown>>(row.attributes_json, {}));
    if (!snapshot) {
      throw new Error(`Worker entity ${workerId} is missing structured attributes`);
    }
    return materializeWorkerRecord(this.cwd, row.id, snapshot.state);
  }

  async readWorkerAsync(ref: string): Promise<WorkerReadResult> {
    return this.readWorker(ref);
  }

  renderList(filter: WorkerListFilter = {}): string {
    return renderWorkerList(this.listWorkers(filter));
  }

  renderDetail(ref: string): string {
    return renderWorkerDetail(this.readWorker(ref));
  }

  renderLaunch(ref: string): string {
    const worker = this.readWorker(ref);
    if (!worker.launch) {
      throw new Error("Worker launch descriptor has not been prepared");
    }
    return renderLaunchDescriptor(worker.launch);
  }

  private nextWorkerId(title: string): string {
    const base = slugifyWorkerValue(title);
    const existing = new Set(listStoredWorkerRecords(this.cwd).map((worker) => worker.state.workerId));
    if (!existing.has(base)) {
      return base;
    }
    let index = 2;
    while (existing.has(`${base}-${index}`)) {
      index += 1;
    }
    return `${base}-${index}`;
  }

  private async persist(worker: WorkerReadResult, change: string): Promise<void> {
    const materialized = {
      ...worker,
      state: normalizeWorkerState(worker.state),
      summary: buildSummary(normalizeWorkerState(worker.state), worker.artifacts.dir),
    } satisfies WorkerReadResult;
    const { storage, identity } = openWorkerCatalogSync(this.cwd);
    const existing = findStoredWorkerRow(this.cwd, materialized.state.workerId);
    const previousEntity = existing ? storedWorkerRowToEntity(existing) : null;
    validateProjectedLinksSync(storage, identity.space.id, projectedLinksForWorker(materialized), WORKER_PROJECTION_OWNER);
    try {
      const { entity } = await upsertEntityByDisplayIdWithLifecycleEvents(
        storage,
        {
          kind: ENTITY_KIND,
          spaceId: identity.space.id,
          owningRepositoryId: identity.repository.id,
          displayId: materialized.state.workerId,
          title: materialized.state.title,
          summary: materialized.state.summary || materialized.state.objective,
          status: materialized.state.status,
          version: (existing?.version ?? 0) + 1,
          tags: [materialized.state.status, materialized.state.ticketId, materialized.state.ralphRunId],
          attributes: canonicalWorkerAttributes(materialized),
          createdAt: existing?.created_at ?? materialized.state.createdAt,
          updatedAt: materialized.state.updatedAt,
        },
        {
          actor: WORKER_ACTOR,
          createdPayload: { change },
          updatedPayload: { change },
        },
      );
      await syncProjectedEntityLinks({
        storage,
        spaceId: identity.space.id,
        fromEntityId: entity.id,
        projectionOwner: WORKER_PROJECTION_OWNER,
        desired: projectedLinksForWorker(materialized),
        timestamp: materialized.state.updatedAt,
      });
      const attachmentId = launchAttachmentId(identity.worktree.id, materialized.state.workerId);
      if (materialized.launch) {
        await storage.upsertRuntimeAttachment(workerLaunchAttachment(identity.worktree.id, materialized.state.workerId, materialized.launch));
      } else {
        await storage.removeRuntimeAttachment(attachmentId);
      }
      await appendEntityEvent(storage, entity.id, "updated", WORKER_ACTOR, { change }, materialized.state.updatedAt);
    } catch (error) {
      if (previousEntity) {
        await storage.upsertEntity(previousEntity);
      }
      throw error;
    }
  }

  async createWorkerAsync(input: CreateWorkerInput): Promise<WorkerReadResult> {
    if (!normalizeOptionalString(input.ticketId)) {
      throw new Error("Workers require exactly one linked ticket id");
    }
    if (!normalizeOptionalString(input.managerId)) {
      throw new Error("Workers require a linked manager id");
    }
    const workerId = input.workerId ? normalizeWorkerRef(input.workerId) : this.nextWorkerId(input.title);
    const timestamp = currentTimestamp();
    const ralphRunId = await ensureWorkerRalphRunAsync(this.cwd, input, workerId);
    const state = normalizeWorkerState({
      workerId,
      title: input.title,
      objective: normalizeOptionalString(input.objective) ?? "",
      summary: normalizeOptionalString(input.summary) ?? `Queued worker ${workerId} for ticket ${input.ticketId}`,
      status: "queued",
      createdAt: timestamp,
      updatedAt: timestamp,
      managerId: input.managerId.trim(),
      ticketId: input.ticketId.trim(),
      ralphRunId,
      workspace: normalizeWorkerWorkspace(workerId, input.workspace),
      pendingInstructions: [],
      lastLaunchAt: null,
    });
    const created = materializeWorkerRecord(this.cwd, "", state);
    await this.persist(created, "worker_created");
    await syncTicketExternalRef(this.cwd, state.ticketId, state.workerId, true);
    return this.readWorker(state.workerId);
  }

  async updateWorkerAsync(ref: string, updates: UpdateWorkerInput): Promise<WorkerReadResult> {
    const worker = this.readWorker(ref);
    worker.state = normalizeWorkerState({
      ...worker.state,
      title: updates.title ?? worker.state.title,
      objective: updates.objective ?? worker.state.objective,
      summary: updates.summary ?? worker.state.summary,
      status: updates.status ?? worker.state.status,
      workspace: updates.workspace ? { ...worker.state.workspace, ...updates.workspace } : worker.state.workspace,
      pendingInstructions: updates.pendingInstructions ?? worker.state.pendingInstructions,
      updatedAt: currentTimestamp(),
    });
    await syncLinkedRalphRunAsync(this.cwd, worker);
    await this.persist(worker, "worker_updated");
    return this.readWorker(worker.state.workerId);
  }

  async recordWorkerOutcomeAsync(ref: string, input: RecordWorkerOutcomeInput): Promise<WorkerReadResult> {
    const worker = this.readWorker(ref);
    worker.state.status = input.status;
    worker.state.summary = normalizeOptionalString(input.summary) ?? worker.state.summary;
    worker.state.pendingInstructions = normalizeStringList(input.instructions);
    worker.state.updatedAt = currentTimestamp();
    await this.persist(worker, "worker_outcome_recorded");
    await appendWorkerJournal(
      this.cwd,
      worker.state.ticketId,
      input.status === "completed" ? "verification" : "state",
      `Worker ${worker.state.workerId} outcome: ${input.status}`,
      {
        workerId: worker.state.workerId,
        status: input.status,
        summary: worker.state.summary,
        instructions: input.instructions ?? [],
        validation: input.validation ?? [],
        conflicts: input.conflicts ?? [],
        followUps: input.followUps ?? [],
      },
    );
    return this.readWorker(worker.state.workerId);
  }

  async prepareLaunchAsync(ref: string, resume = false, note?: string): Promise<WorkerReadResult> {
    const worker = this.readWorker(ref);
    await syncLinkedRalphRunAsync(this.cwd, worker);
    const launch = prepareWorkerLaunchDescriptor(this.cwd, worker, {
      resume,
      note,
      instructions: worker.state.pendingInstructions,
    });
    worker.launch = launch;
    worker.state.pendingInstructions = [];
    worker.state.lastLaunchAt = launch.updatedAt;
    worker.state.updatedAt = currentTimestamp();
    await this.persist(worker, "launch_prepared");
    return this.readWorker(worker.state.workerId);
  }

  async startLaunchExecutionAsync(ref: string): Promise<WorkerReadResult> {
    const worker = this.readWorker(ref);
    if (!worker.launch) {
      throw new Error("Worker launch descriptor has not been prepared");
    }
    const startedAt = currentTimestamp();
    worker.launch = {
      ...worker.launch,
      updatedAt: startedAt,
      status: "running",
      note: worker.launch.resume
        ? `Resumed linked Ralph run ${worker.launch.ralphRunId} at iteration ${worker.launch.iterationId}`
        : `Started linked Ralph run ${worker.launch.ralphRunId} at iteration ${worker.launch.iterationId}`,
    };
    worker.state.status = "running";
    worker.state.lastLaunchAt = startedAt;
    worker.state.updatedAt = startedAt;
    await this.persist(worker, "launch_started");
    return this.readWorker(worker.state.workerId);
  }

  async finishLaunchExecutionAsync(ref: string, execution: WorkerExecutionResult): Promise<WorkerReadResult> {
    const worker = this.readWorker(ref);
    if (!worker.launch) {
      throw new Error("Worker launch descriptor has not been prepared");
    }
    const finishedAt = currentTimestamp();
    const baseSummary = executionSummary(execution);
    let launchStatus: WorkerRuntimeDescriptor["status"] = execution.status === "cancelled" ? "failed" : execution.status;
    let outcome: { status: WorkerStatus; summary: string };
    if (execution.status === "completed") {
      outcome = executionSummaryFromRalph(this.cwd, worker);
      if (outcome.status === "failed") {
        launchStatus = "failed";
      }
    } else {
      outcome = { status: "failed", summary: baseSummary };
    }

    worker.launch = {
      ...worker.launch,
      updatedAt: finishedAt,
      status: launchStatus,
      pid: null,
      note: outcome.summary,
    };
    worker.state.status = outcome.status;
    worker.state.summary = outcome.summary;
    worker.state.updatedAt = finishedAt;
    await this.persist(worker, execution.status === "cancelled" ? "launch_cancelled" : "launch_finished");
    return this.readWorker(worker.state.workerId);
  }

  async retireWorkerAsync(ref: string, note?: string): Promise<WorkerReadResult> {
    const worker = this.readWorker(ref);
    if (worker.launch?.workspaceDir) {
      retireWorkerWorkspace(this.cwd, worker.state.workerId, worker.launch.workspaceDir);
    }
    worker.state.status = "retired";
    worker.state.summary = normalizeOptionalString(note) ?? worker.state.summary ?? "Worker retired";
    worker.state.updatedAt = currentTimestamp();
    if (worker.launch) {
      worker.launch = {
        ...worker.launch,
        updatedAt: worker.state.updatedAt,
        status: "retired",
        note: worker.state.summary,
      };
    }
    await this.persist(worker, "worker_retired");
    await appendWorkerJournal(this.cwd, worker.state.ticketId, "state", `Worker ${worker.state.workerId} retired`, {
      workerId: worker.state.workerId,
      summary: worker.state.summary,
    });
    return this.readWorker(worker.state.workerId);
  }
}

export function createWorkerStore(cwd: string): WorkerStore {
  return new WorkerStore(resolve(cwd));
}
