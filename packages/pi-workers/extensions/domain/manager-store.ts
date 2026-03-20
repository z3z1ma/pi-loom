import { execFileSync } from "node:child_process";
import type { LoomEntityRecord } from "@pi-loom/pi-storage/storage/contract.js";
import { appendEntityEvent, upsertEntityByDisplayIdWithLifecycleEvents } from "@pi-loom/pi-storage/storage/entities.js";
import { openWorkspaceStorageSync } from "@pi-loom/pi-storage/storage/workspace.js";
import { createRalphStore } from "@pi-loom/pi-ralph/extensions/domain/store.js";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import type {
  CreateManagerInput,
  ManagerCanonicalRecord,
  ManagerCheckpointInput,
  ManagerLinkedRefs,
  ManagerListFilter,
  ManagerMessageKind,
  ManagerMessageRecord,
  ManagerMessageStatus,
  ManagerReadResult,
  ManagerState,
  ManagerStatus,
  ManagerSteerInput,
  ManagerSummary,
  ManagerWorkerView,
  WorkerReadResult,
} from "./models.js";
import { currentTimestamp, normalizeOptionalString, normalizeStringList, summarizeText } from "./normalize.js";
import { renderManagerDetail } from "./render.js";
import { slugifyWorkerValue } from "./paths.js";
import { startWorkerLaunchProcess } from "./manager-runtime.js";
import { createWorkerStore } from "./store.js";

const ENTITY_KIND = "manager" as const;
const MANAGER_ACTOR = "worker-manager-store" as const;

type ManagerEntityAttributes = ManagerCanonicalRecord;

interface StoredManagerEntityRow {
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

function parseStoredJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function defaultTargetRef(cwd: string): string {
  try {
    const branch = execFileSync("git", ["branch", "--show-current"], { cwd, encoding: "utf-8" }).trim();
    return branch || "HEAD";
  } catch {
    return "HEAD";
  }
}

function normalizeManagerStatus(value: string | null | undefined): ManagerStatus {
  if (value === "waiting_for_input" || value === "completed" || value === "failed" || value === "archived") {
    return value;
  }
  return "active";
}

function normalizeManagerMessageStatus(value: string | null | undefined): ManagerMessageStatus {
  return value === "resolved" ? "resolved" : "pending";
}

function normalizeManagerMessageKind(value: string | null | undefined): ManagerMessageKind {
  if (value === "approval" || value === "escalation" || value === "report") {
    return value;
  }
  return "steer";
}

function normalizeManagerLinkedRefs(input?: Partial<ManagerLinkedRefs>): ManagerLinkedRefs {
  return {
    initiativeIds: normalizeStringList(input?.initiativeIds),
    researchIds: normalizeStringList(input?.researchIds),
    specChangeIds: normalizeStringList(input?.specChangeIds),
    ticketIds: normalizeStringList(input?.ticketIds),
    critiqueIds: normalizeStringList(input?.critiqueIds),
    docIds: normalizeStringList(input?.docIds),
    planIds: normalizeStringList(input?.planIds),
  };
}

function mergeManagerLinkedRefs(current: ManagerLinkedRefs, input?: Partial<ManagerLinkedRefs>): ManagerLinkedRefs {
  if (!input) {
    return current;
  }
  return {
    initiativeIds: normalizeStringList([...(current.initiativeIds ?? []), ...(input.initiativeIds ?? [])]),
    researchIds: normalizeStringList([...(current.researchIds ?? []), ...(input.researchIds ?? [])]),
    specChangeIds: normalizeStringList([...(current.specChangeIds ?? []), ...(input.specChangeIds ?? [])]),
    ticketIds: normalizeStringList([...(current.ticketIds ?? []), ...(input.ticketIds ?? [])]),
    critiqueIds: normalizeStringList([...(current.critiqueIds ?? []), ...(input.critiqueIds ?? [])]),
    docIds: normalizeStringList([...(current.docIds ?? []), ...(input.docIds ?? [])]),
    planIds: normalizeStringList([...(current.planIds ?? []), ...(input.planIds ?? [])]),
  };
}

function normalizeManagerState(state: ManagerState): ManagerState {
  return {
    managerId: slugifyWorkerValue(state.managerId),
    title: normalizeOptionalString(state.title) ?? "Manager",
    objective: normalizeOptionalString(state.objective) ?? "",
    summary: normalizeOptionalString(state.summary) ?? "",
    status: normalizeManagerStatus(state.status),
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    targetRef: normalizeOptionalString(state.targetRef) ?? "HEAD",
    linkedRefs: normalizeManagerLinkedRefs(state.linkedRefs),
    workerIds: normalizeStringList(state.workerIds),
    workerSignature: normalizeOptionalString(state.workerSignature) ?? "",
    latestSummary: normalizeOptionalString(state.latestSummary) ?? "",
    lastRunAt: normalizeOptionalString(state.lastRunAt),
    runCount:
      typeof state.runCount === "number" && Number.isFinite(state.runCount) && state.runCount >= 0
        ? Math.floor(state.runCount)
        : 0,
  };
}

function normalizeManagerMessage(message: ManagerMessageRecord): ManagerMessageRecord {
  return {
    id: normalizeOptionalString(message.id) ?? "",
    managerId: slugifyWorkerValue(message.managerId),
    createdAt: message.createdAt,
    direction: message.direction === "manager_to_operator" ? "manager_to_operator" : "operator_to_manager",
    kind: normalizeManagerMessageKind(message.kind),
    status: normalizeManagerMessageStatus(message.status),
    text: normalizeOptionalString(message.text) ?? "",
    workerId: normalizeOptionalString(message.workerId),
    resolvedAt: normalizeOptionalString(message.resolvedAt),
  };
}

function hasManagerAttributes(attributes: unknown): attributes is ManagerEntityAttributes {
  if (!attributes || typeof attributes !== "object") {
    return false;
  }
  const candidate = attributes as Record<string, unknown>;
  return Array.isArray(candidate.messages) && Boolean(candidate.state && typeof candidate.state === "object");
}

function readManagerAttributes(attributes: unknown): ManagerEntityAttributes | null {
  if (!hasManagerAttributes(attributes)) {
    return null;
  }
  const candidate = attributes as ManagerEntityAttributes;
  return {
    state: normalizeManagerState(candidate.state),
    messages: candidate.messages.map((message) => normalizeManagerMessage(message as ManagerMessageRecord)),
  };
}

function canonicalManagerAttributes(manager: ManagerReadResult): ManagerCanonicalRecord {
  return {
    state: normalizeManagerState(manager.state),
    messages: manager.messages.map((message) => normalizeManagerMessage(message)),
  };
}

function storedManagerRowToEntity(row: StoredManagerEntityRow): LoomEntityRecord {
  return {
    id: row.id,
    kind: ENTITY_KIND as unknown as LoomEntityRecord["kind"],
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

function findStoredManagerRow(cwd: string, managerId: string): StoredManagerEntityRow | null {
  const { storage, identity } = openWorkspaceStorageSync(cwd);
  return (
    (storage.db
      .prepare(
        "SELECT id, space_id, owning_repository_id, display_id, title, summary, status, version, tags_json, created_at, updated_at, attributes_json FROM entities WHERE space_id = ? AND kind = ? AND display_id = ? LIMIT 1",
      )
      .get(identity.space.id, ENTITY_KIND, managerId) as StoredManagerEntityRow | undefined) ?? null
  );
}

function nextMessageId(messages: ManagerMessageRecord[]): string {
  return `msg-${String(messages.length + 1).padStart(3, "0")}`;
}

function createManagerMessage(
  manager: ManagerReadResult,
  direction: ManagerMessageRecord["direction"],
  kind: ManagerMessageKind,
  text: string,
  workerId?: string | null,
): ManagerMessageRecord {
  return normalizeManagerMessage({
    id: nextMessageId(manager.messages),
    managerId: manager.state.managerId,
    createdAt: currentTimestamp(),
    direction,
    kind,
    status: "pending",
    text,
    workerId: workerId ?? null,
    resolvedAt: null,
  });
}

function pendingOutgoingMessages(manager: ManagerReadResult): ManagerMessageRecord[] {
  return manager.messages.filter(
    (message) => message.direction === "manager_to_operator" && message.status !== "resolved",
  );
}

function countPendingOutgoingMessages(messages: ManagerMessageRecord[]): number {
  return messages.filter((message) => message.direction === "manager_to_operator" && message.status !== "resolved")
    .length;
}

function resolveMessages(manager: ManagerReadResult, predicate: (message: ManagerMessageRecord) => boolean): void {
  const resolvedAt = currentTimestamp();
  for (const message of manager.messages) {
    if (predicate(message) && message.status !== "resolved") {
      message.status = "resolved";
      message.resolvedAt = resolvedAt;
    }
  }
}

function summarizeWorker(worker: WorkerReadResult): ManagerWorkerView {
  return {
    id: worker.state.workerId,
    title: worker.state.title,
    status: worker.state.status,
    branch: worker.state.workspace.branch,
    baseRef: worker.state.workspace.baseRef,
    ticketIds: [...worker.state.linkedRefs.ticketIds],
    ralphRunId: worker.state.linkedRefs.ralphRunIds[0] ?? null,
    latestSummary:
      worker.state.latestTelemetry.summary ||
      worker.state.latestCheckpointSummary ||
      worker.state.summary ||
      worker.state.objective,
  };
}

function managerWorkerSignature(workers: ManagerWorkerView[]): string {
  return workers
    .map((worker) => `${worker.id}:${worker.status}:${worker.latestSummary}`)
    .sort()
    .join("|");
}

function readManagerWorkers(cwd: string, workerIds: string[]): ManagerWorkerView[] {
  const workerStore = createWorkerStore(cwd);
  return workerIds.flatMap((workerId) => {
    try {
      return [summarizeWorker(workerStore.readWorker(workerId))];
    } catch {
      return [];
    }
  });
}

function buildManagerSummary(
  state: ManagerState,
  messages: ManagerMessageRecord[],
  workers: ManagerWorkerView[],
): ManagerSummary {
  return {
    id: state.managerId,
    title: state.title,
    status: state.status,
    targetRef: state.targetRef,
    ticketCount: state.linkedRefs.ticketIds.length,
    workerCount: workers.length,
    updatedAt: state.updatedAt,
    latestSummary: state.latestSummary,
    pendingMessages: countPendingOutgoingMessages(messages),
  };
}

function materializeManagerRecord(
  cwd: string,
  state: ManagerState,
  messages: ManagerMessageRecord[],
): ManagerReadResult {
  const workers = readManagerWorkers(cwd, state.workerIds);
  const result: ManagerReadResult = {
    state,
    summary: buildManagerSummary(state, messages, workers),
    messages,
    workers,
    manager: "",
  };
  result.manager = renderManagerDetail(result);
  return result;
}

async function ticketTitleFor(cwd: string, ticketId: string): Promise<string> {
  try {
    const ticket = await createTicketStore(cwd).readTicketAsync(ticketId);
    return ticket.summary.title || ticketId;
  } catch {
    return ticketId;
  }
}

function workerIdFor(managerId: string, ticketId: string): string {
  return slugifyWorkerValue(`${managerId}-${ticketId}`);
}

function shouldRunWorker(worker: WorkerReadResult): boolean {
  return (
    (worker.state.status === "requested" || worker.state.status === "ready" || worker.state.status === "active") &&
    worker.launch?.status !== "running"
  );
}

export class ManagerStore {
  constructor(readonly cwd: string) {}

  async initLedgerAsync(): Promise<{ root: string }> {
    return createWorkerStore(this.cwd).initLedgerAsync();
  }

  private async persist(manager: ManagerReadResult, change: string): Promise<void> {
    const { storage, identity } = openWorkspaceStorageSync(this.cwd);
    const existing = findStoredManagerRow(this.cwd, manager.state.managerId);
    const previousEntity = existing ? storedManagerRowToEntity(existing) : null;
    try {
      const { entity } = await upsertEntityByDisplayIdWithLifecycleEvents(
        storage,
        {
          kind: ENTITY_KIND as unknown as Parameters<typeof upsertEntityByDisplayIdWithLifecycleEvents>[1]["kind"],
          spaceId: identity.space.id,
          owningRepositoryId: identity.repository.id,
          displayId: manager.state.managerId,
          title: manager.state.title,
          summary: manager.state.summary || manager.state.objective,
          status: manager.state.status,
          version: (existing?.version ?? 0) + 1,
          tags: [manager.state.status, manager.state.targetRef, ...manager.state.linkedRefs.ticketIds],
          attributes: canonicalManagerAttributes(manager),
          createdAt: existing?.created_at ?? manager.state.createdAt,
          updatedAt: manager.state.updatedAt,
        },
        {
          actor: MANAGER_ACTOR,
          createdPayload: { change },
          updatedPayload: { change },
        },
      );
      await appendEntityEvent(storage, entity.id, "updated", MANAGER_ACTOR, { change }, manager.state.updatedAt);
    } catch (error) {
      if (previousEntity) {
        await storage.upsertEntity(previousEntity);
      }
      throw error;
    }
  }

  listManagers(filter: ManagerListFilter = {}): ManagerSummary[] {
    const { storage, identity } = openWorkspaceStorageSync(this.cwd);
    const rows = storage.db
      .prepare(
        "SELECT id, space_id, owning_repository_id, display_id, title, summary, status, version, tags_json, created_at, updated_at, attributes_json FROM entities WHERE space_id = ? AND kind = ?",
      )
      .all(identity.space.id, ENTITY_KIND) as StoredManagerEntityRow[];
    const lowered = normalizeOptionalString(filter.text)?.toLowerCase() ?? null;
    return rows
      .map((row) => readManagerAttributes(parseStoredJson(row.attributes_json, {})))
      .flatMap((attributes) =>
        attributes ? [materializeManagerRecord(this.cwd, attributes.state, attributes.messages).summary] : [],
      )
      .filter((summary) => !filter.status || summary.status === filter.status)
      .filter((summary) => {
        if (!lowered) {
          return true;
        }
        return [summary.id, summary.title, summary.latestSummary, summary.targetRef]
          .join(" ")
          .toLowerCase()
          .includes(lowered);
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
  }

  readManager(ref: string): ManagerReadResult {
    const managerId = slugifyWorkerValue(ref);
    const row = findStoredManagerRow(this.cwd, managerId);
    if (!row) {
      throw new Error(`Unknown manager: ${ref}`);
    }
    const attributes = readManagerAttributes(parseStoredJson(row.attributes_json, {}));
    if (!attributes) {
      throw new Error(`Manager entity ${managerId} is missing structured attributes`);
    }
    return materializeManagerRecord(this.cwd, attributes.state, attributes.messages);
  }

  createManager(input: CreateManagerInput): ManagerReadResult {
    const linkedRefs = normalizeManagerLinkedRefs(input.linkedRefs);
    const timestamp = currentTimestamp();
    const state = normalizeManagerState({
      managerId: input.managerId ? slugifyWorkerValue(input.managerId) : slugifyWorkerValue(input.title),
      title: input.title,
      objective: normalizeOptionalString(input.objective) ?? "",
      summary: normalizeOptionalString(input.summary) ?? "",
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
      targetRef: normalizeOptionalString(input.targetRef) ?? defaultTargetRef(this.cwd),
      linkedRefs,
      workerIds: [],
      workerSignature: "",
      latestSummary: "Manager created.",
      lastRunAt: null,
      runCount: 0,
    });
    return materializeManagerRecord(this.cwd, state, []);
  }

  async createManagerAsync(input: CreateManagerInput): Promise<ManagerReadResult> {
    const manager = this.createManager(input);
    await this.persist(manager, "manager_created");
    return this.readManager(manager.state.managerId);
  }

  async steerManagerAsync(ref: string, input: ManagerSteerInput): Promise<ManagerReadResult> {
    const manager = this.readManager(ref);
    if (input.targetRef?.trim()) {
      manager.state.targetRef = input.targetRef.trim();
    }
    if (input.text?.trim()) {
      manager.messages.push(createManagerMessage(manager, "operator_to_manager", "steer", input.text));
    }
    if (input.workerId && input.approvalStatus) {
      resolveMessages(
        manager,
        (message) =>
          message.direction === "manager_to_operator" &&
          message.workerId === input.workerId &&
          message.kind === "approval",
      );
      manager.messages.push(
        createManagerMessage(
          manager,
          "operator_to_manager",
          "approval",
          input.text ?? `Approval decision: ${input.approvalStatus}`,
          input.workerId,
        ),
      );
    }
    manager.state.status = "active";
    manager.state.updatedAt = currentTimestamp();
    manager.state.latestSummary = summarizeText(input.text ?? `Steered manager ${manager.state.managerId}`);
    await this.persist(manager, "manager_steered");
    return this.readManager(manager.state.managerId);
  }

  private async ensureWorkers(manager: ManagerReadResult): Promise<{ changed: boolean; notes: string[] }> {
    const workerStore = createWorkerStore(this.cwd);
    const notes: string[] = [];
    let changed = false;
    for (const ticketId of manager.state.linkedRefs.ticketIds) {
      const expectedWorkerId = workerIdFor(manager.state.managerId, ticketId);
      if (manager.state.workerIds.includes(expectedWorkerId)) {
        continue;
      }
      const ticketTitle = await ticketTitleFor(this.cwd, ticketId);
      const created = await workerStore.createWorkerAsync({
        workerId: expectedWorkerId,
        title: `${manager.state.title} ${ticketTitle}`,
        objective: manager.state.objective,
        summary: `Managed by ${manager.state.managerId} for ticket ${ticketId}`,
        linkedRefs: {
          ...manager.state.linkedRefs,
          ticketIds: [ticketId],
        },
        managerRef: { kind: "manager", ref: manager.state.managerId, label: manager.state.title },
        workspace: { branch: expectedWorkerId, baseRef: manager.state.targetRef },
      });
      manager.state.workerIds.push(created.state.workerId);
      changed = true;
      notes.push(`Spawned worker ${created.state.workerId} for ticket ${ticketId}.`);
    }
    manager.state.workerIds = normalizeStringList(manager.state.workerIds);
    return { changed, notes };
  }

  private async runWorkerIteration(workerId: string): Promise<string> {
    const workerStore = createWorkerStore(this.cwd);
    const worker = workerStore.readWorker(workerId);
    const runId = worker.state.linkedRefs.ralphRunIds[0];
    if (!runId) {
      return `Worker ${workerId} is missing a linked Ralph run.`;
    }
    const run = createRalphStore(this.cwd).readRun(runId);
    if (run.state.waitingFor !== "none" || ["completed", "failed", "halted", "archived"].includes(run.state.status)) {
      return `Worker ${workerId} is not runnable because linked Ralph run ${runId} is ${run.state.status}/${run.state.waitingFor}.`;
    }
    const prepared = worker.launch
      ? await workerStore.prepareLaunchAsync(workerId, true, `Prepared by manager ${worker.state.managerRef.ref}.`)
      : await workerStore.prepareLaunchAsync(workerId, false, `Prepared by manager ${worker.state.managerRef.ref}.`);
    const running = await workerStore.startLaunchExecutionAsync(prepared.state.workerId);
    if (!running.launch) {
      return `Worker ${workerId} could not prepare a launch descriptor.`;
    }
    startWorkerLaunchProcess(this.cwd, workerId);
    return `Started background Ralph iteration for worker ${workerId}.`;
  }

  async dispatchManagerWorkAsync(ref: string): Promise<ManagerReadResult> {
    const manager = this.readManager(ref);
    const notes: string[] = [];
    const ensured = await this.ensureWorkers(manager);
    if (ensured.changed) {
      notes.push(...ensured.notes);
    }

    for (const workerId of manager.state.workerIds) {
      const worker = createWorkerStore(this.cwd).readWorker(workerId);
      if (worker.state.status === "waiting_for_review" || worker.state.status === "completed") {
        continue;
      }
      if (!shouldRunWorker(worker)) {
        continue;
      }
      notes.push(await this.runWorkerIteration(workerId));
    }

    manager.state.updatedAt = currentTimestamp();
    manager.state.lastRunAt = manager.state.updatedAt;
    manager.state.runCount += 1;
    manager.state.workerSignature = managerWorkerSignature(readManagerWorkers(this.cwd, manager.state.workerIds));
    manager.state.latestSummary = summarizeText(
      notes.join(" ") || manager.state.latestSummary || "No runnable work this cycle.",
    );
    await this.persist(manager, "manager_dispatched");
    return this.readManager(manager.state.managerId);
  }

  async checkpointManagerAsync(ref: string, input: ManagerCheckpointInput): Promise<ManagerReadResult> {
    const manager = this.readManager(ref);
    manager.state.linkedRefs = mergeManagerLinkedRefs(manager.state.linkedRefs, input.linkedRefs);
    if (input.resolveOperatorInput === true) {
      resolveMessages(manager, (message) => message.direction === "operator_to_manager");
    }
    for (const message of input.operatorMessages ?? []) {
      if (!message.text.trim()) {
        continue;
      }
      manager.messages.push(
        createManagerMessage(manager, "manager_to_operator", message.kind, message.text.trim(), message.workerId),
      );
    }
    for (const update of input.workerUpdates ?? []) {
      await createWorkerStore(this.cwd).recordWorkerOutcomeAsync(update.workerId, {
        status: update.status,
        summary: update.summary,
        validation: update.validation,
        conflicts: update.conflicts,
        followUps: update.followUps,
      });
    }
    if (input.status) {
      manager.state.status = input.status;
    } else if (pendingOutgoingMessages(manager).length > 0) {
      manager.state.status = "waiting_for_input";
    } else if (manager.state.status === "waiting_for_input") {
      manager.state.status = "active";
    }
    if (input.summary?.trim()) {
      manager.state.latestSummary = summarizeText(input.summary);
    }
    manager.state.updatedAt = currentTimestamp();
    manager.state.lastRunAt = manager.state.updatedAt;
    manager.state.runCount += 1;
    manager.state.workerSignature = managerWorkerSignature(readManagerWorkers(this.cwd, manager.state.workerIds));
    await this.persist(manager, "manager_checkpointed");
    return this.readManager(manager.state.managerId);
  }

  async listManagersAsync(filter: ManagerListFilter = {}): Promise<ManagerSummary[]> {
    return this.listManagers(filter);
  }

  async readManagerAsync(ref: string): Promise<ManagerReadResult> {
    return this.readManager(ref);
  }
}

export function createManagerStore(cwd: string): ManagerStore {
  return new ManagerStore(cwd);
}
