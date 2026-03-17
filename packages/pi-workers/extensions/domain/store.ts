import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { findEntityByDisplayId, upsertEntityByDisplayId, upsertProjectionForEntity } from "@pi-loom/pi-storage/storage/entities.js";
import { openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { buildWorkerDashboard, filterWorkersByTelemetry, filterWorkersByText } from "./dashboard.js";
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
  WorkerCheckpointRecord,
  WorkerConsolidationOutcome,
  WorkerDashboard,
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
import { DEFAULT_WORKER_RUNTIME_KIND } from "./models.js";
import {
  currentTimestamp,
  ensureRelativeOrLogicalPath,
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
import { getWorkerArtifactPaths, getWorkerPaths, normalizeWorkerRef, slugifyWorkerValue } from "./paths.js";
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
  type WorkerSdkSessionConfig,
  writeRuntimeDescriptor,
} from "./runtime.js";

const ENTITY_KIND = "worker" as const;

interface WorkerEntityAttributes {
  worker: WorkerReadResult;
}

interface FilesystemImportedWorkerAttributes {
  importedFrom?: string;
  filesByPath?: Record<string, string>;
}

function hasStructuredWorkerAttributes(attributes: unknown): attributes is WorkerEntityAttributes {
  return Boolean(attributes && typeof attributes === "object" && "worker" in attributes);
}

function hasFilesystemImportedWorkerAttributes(attributes: unknown): attributes is FilesystemImportedWorkerAttributes {
  return Boolean(attributes && typeof attributes === "object" && "filesByPath" in attributes);
}

function ensureDir(filePath: string): void {
  mkdirSync(filePath, { recursive: true });
}

function writeFileAtomic(filePath: string, content: string): void {
  ensureDir(dirname(filePath));
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tempPath, content, "utf-8");
  renameSync(tempPath, filePath);
}

function writeJson(filePath: string, value: unknown): void {
  writeFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

function parseJsonText<T>(content: string): T {
  return JSON.parse(content) as T;
}

function readJsonl<T>(filePath: string): T[] {
  if (!existsSync(filePath)) {
    return [];
  }
  return readFileSync(filePath, "utf-8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function relativePath(cwd: string, filePath: string): string {
  const result = relative(cwd, filePath);
  return result || ".";
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
    logicalPath: `.loom/runtime/workers/${workerId}`,
    branch: workerId,
    baseRef: "HEAD",
  });
}

function defaultManagerRef(): ManagerRef {
  return normalizeManagerRef({ kind: "operator", ref: "operator" });
}

function initialLaunchDescriptor(workerId: string, branch: string, baseRef: string): WorkerRuntimeDescriptor {
  return {
    workerId,
    createdAt: currentTimestamp(),
    updatedAt: currentTimestamp(),
    runtime: DEFAULT_WORKER_RUNTIME_KIND,
    resume: false,
    workspacePath: "",
    branch,
    baseRef,
    launchPrompt: "",
    command: [],
    pid: null,
    status: "retired",
    note: "Launch not prepared yet.",
  };
}

function isSuccessfulConsolidationStatus(status: RecordWorkerConsolidationInput["status"]): boolean {
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

function timestampAtOrAfter(value: string | null | undefined, floor: string): boolean {
  if (!value) {
    return false;
  }
  return new Date(value).getTime() >= new Date(floor).getTime();
}

function isActionableManagerMessageAtLaunchStart(message: WorkerMessageRecord, startedAt: string): boolean {
  if (message.direction === "worker_to_manager") {
    return false;
  }
  if (!timestampAtOrAfter(startedAt, message.createdAt)) {
    return false;
  }
  if (message.resolvedAt && new Date(message.resolvedAt).getTime() < new Date(startedAt).getTime()) {
    return false;
  }
  return (
    message.awaiting === "worker" ||
    timestampAtOrAfter(message.acknowledgedAt, startedAt) ||
    timestampAtOrAfter(message.resolvedAt, startedAt)
  );
}

function assessCompletedLaunchProgress(
  worker: WorkerReadResult,
  startedAt: string,
): {
  durableProgress: boolean;
  actionableInboxAtStart: number;
  evidence: string[];
} {
  const actionableInboxAtStart = worker.messages.filter((message) =>
    isActionableManagerMessageAtLaunchStart(message, startedAt),
  ).length;
  const evidence: string[] = [];

  const touchedInboxCount = worker.messages.filter(
    (message) =>
      message.direction !== "worker_to_manager" &&
      (timestampAtOrAfter(message.acknowledgedAt, startedAt) || timestampAtOrAfter(message.resolvedAt, startedAt)),
  ).length;
  if (touchedInboxCount > 0) {
    evidence.push(`${touchedInboxCount} inbox item(s) acknowledged or resolved`);
  }

  const workerUpdatesCount = worker.messages.filter(
    (message) => message.direction === "worker_to_manager" && timestampAtOrAfter(message.createdAt, startedAt),
  ).length;
  if (workerUpdatesCount > 0) {
    evidence.push(`${workerUpdatesCount} worker-to-manager update(s)`);
  }

  const checkpointCount = worker.checkpoints.filter((checkpoint) =>
    timestampAtOrAfter(checkpoint.createdAt, startedAt),
  ).length;
  if (checkpointCount > 0) {
    evidence.push(`${checkpointCount} checkpoint(s)`);
  }

  if (timestampAtOrAfter(worker.state.completionRequest.requestedAt, startedAt)) {
    evidence.push("completion request");
  }

  return {
    durableProgress: evidence.length > 0,
    actionableInboxAtStart,
    evidence,
  };
}

function noDurableProgressSummary(
  execution: WorkerExecutionResult,
  progress: { actionableInboxAtStart: number; evidence: string[] },
): string {
  const runtimeOutput = execution.output.trim();
  const outputNote = runtimeOutput ? ` Runtime output was non-durable: ${summarizeText(runtimeOutput, 160)}` : "";
  const evidenceNote = progress.evidence.length > 0 ? ` Evidence seen: ${progress.evidence.join(", ")}.` : "";
  return `Launch reported completed but made no durable progress: ${progress.actionableInboxAtStart} actionable inbox item(s) were already pending at launch start, yet no acknowledgements, resolutions, checkpoints, escalations, status updates, or completion request were recorded.${evidenceNote}${outputNote}`;
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
    completionRequest:
      state.completionRequest ?? {
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
  normalized.workspace.repositoryRoot = ensureRelativeOrLogicalPath(normalized.workspace.repositoryRoot, "repository root");
  normalized.workspace.logicalPath = ensureRelativeOrLogicalPath(normalized.workspace.logicalPath, "logical workspace path");
  return normalized;
}

function buildSummary(cwd: string, state: WorkerState, artifactPath: string): WorkerSummary {
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
    path: relativePath(cwd, artifactPath),
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
    ...buildSummary(cwd, worker.state, worker.artifacts.worker),
    acknowledgedInboxCount: acknowledgedInbox(worker.messages).length,
    unresolvedInboxCount: unresolvedInbox(worker.messages).length,
    pendingManagerActionCount: pendingManagerActions(worker.messages).length,
  };
  worker.dashboard = buildWorkerDashboard(cwd, worker);
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

export class WorkerStore {
  readonly cwd: string;

  constructor(cwd: string) {
    this.cwd = resolve(cwd);
  }

  initLedger(): { initialized: true; root: string } {
    const paths = getWorkerPaths(this.cwd);
    ensureDir(paths.workersDir);
    ensureDir(paths.runtimeDir);
    return { initialized: true, root: paths.workersDir };
  }

  private workerIds(): string[] {
    const paths = getWorkerPaths(this.cwd);
    if (!existsSync(paths.workersDir)) {
      return [];
    }
    return readdirSync(paths.workersDir)
      .filter((entry) => existsSync(join(paths.workersDir, entry, "state.json")))
      .sort((left, right) => left.localeCompare(right));
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

  private readLaunch(artifacts: ReturnType<typeof getWorkerArtifactPaths>): WorkerRuntimeDescriptor | null {
    if (!existsSync(artifacts.launch)) {
      return null;
    }
    return readJson<WorkerRuntimeDescriptor>(artifacts.launch);
  }

  private readState(workerId: string): WorkerState {
    const state = readJson<WorkerState>(getWorkerArtifactPaths(this.cwd, workerId).state);
    return normalizeWorkerState(state);
  }

  private readWorkerArtifacts(workerId: string): WorkerReadResult {
    const artifacts = getWorkerArtifactPaths(this.cwd, workerId);
    const state = this.readState(workerId);
    const messages = readJsonl<WorkerMessageRecord>(artifacts.messages);
    const checkpoints = readJsonl<WorkerCheckpointRecord>(artifacts.checkpoints);
    const launch = this.readLaunch(artifacts);
    const worker: WorkerReadResult = {
      state,
      summary: buildSummary(this.cwd, state, artifacts.worker),
      worker: existsSync(artifacts.worker) ? readFileSync(artifacts.worker, "utf-8") : "",
      messages,
      checkpoints,
      launch,
      dashboard: {} as WorkerDashboard,
      packet: "",
      artifacts,
    };
    syncDerivedViews(this.cwd, worker);
    return worker;
  }

  private persist(worker: WorkerReadResult): void {
    const artifacts = worker.artifacts;
    writeJson(artifacts.state, normalizeWorkerState(worker.state));
    writeFileAtomic(artifacts.worker, renderWorkerMarkdown(worker));
    writeFileAtomic(
      artifacts.messages,
      `${worker.messages.map((entry) => JSON.stringify(entry)).join("\n")}${worker.messages.length > 0 ? "\n" : ""}`,
    );
    writeFileAtomic(
      artifacts.checkpoints,
      `${worker.checkpoints.map((entry) => JSON.stringify(entry)).join("\n")}${worker.checkpoints.length > 0 ? "\n" : ""}`,
    );
    if (worker.launch) {
      writeRuntimeDescriptor(artifacts.launch, worker.launch);
    }
  }

  private async upsertCanonicalWorker(worker: WorkerReadResult): Promise<WorkerReadResult> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const existing = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, worker.summary.id);
    const version = (existing?.version ?? 0) + 1;
    const entity = await upsertEntityByDisplayId(storage, {
      kind: ENTITY_KIND,
      spaceId: identity.space.id,
      owningRepositoryId: identity.repository.id,
      displayId: worker.summary.id,
      title: worker.summary.title,
      summary: worker.state.summary || worker.state.objective,
      status: worker.summary.status,
      version,
      tags: [worker.summary.telemetryState, ...(worker.state.linkedRefs.ticketIds ?? [])],
      pathScopes: [
        { repositoryId: identity.repository.id, relativePath: worker.summary.path, role: "canonical" },
        { repositoryId: identity.repository.id, relativePath: relativePath(this.cwd, worker.artifacts.worker), role: "projection" },
        { repositoryId: identity.repository.id, relativePath: relativePath(this.cwd, worker.artifacts.messages), role: "projection" },
        { repositoryId: identity.repository.id, relativePath: relativePath(this.cwd, worker.artifacts.checkpoints), role: "projection" },
      ],
      attributes: { worker },
      createdAt: existing?.createdAt ?? worker.state.createdAt,
      updatedAt: worker.state.updatedAt,
    });
    await upsertProjectionForEntity(
      storage,
      entity.id,
      "packet_markdown_projection",
      "repo_materialized",
      identity.repository.id,
      relativePath(this.cwd, worker.artifacts.worker),
      worker.worker,
      version,
      worker.state.createdAt,
      worker.state.updatedAt,
    );
    return worker;
  }

  private entityWorker(entity: { attributes: unknown }): WorkerReadResult {
    return (entity.attributes as WorkerEntityAttributes).worker;
  }

  private readImportedWorker(
    workerId: string,
    attributes: unknown,
    fallback?: { title: string; status: WorkerStatus; updatedAt: string },
  ): WorkerReadResult | null {
    if (!hasFilesystemImportedWorkerAttributes(attributes) || !attributes.filesByPath) {
      return null;
    }
    const artifacts = getWorkerArtifactPaths(this.cwd, workerId);
    const statePath = relativePath(this.cwd, artifacts.state);
    const stateText = attributes.filesByPath[statePath];
    if (!stateText) {
      const workerMarkdown = attributes.filesByPath[relativePath(this.cwd, artifacts.worker)];
      if (!workerMarkdown || !fallback) {
        return null;
      }
      const state: WorkerState = {
        workerId,
        title: fallback.title,
        objective: fallback.title,
        summary: "Imported worker projection awaiting canonical rehydration.",
        status: fallback.status,
        createdAt: fallback.updatedAt,
        updatedAt: fallback.updatedAt,
        managerRef: defaultManagerRef(),
        linkedRefs: normalizeLinkedRefs({}),
        workspace: defaultWorkspaceDescriptor(workerId),
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
        packetSummary: "Imported worker projection awaiting canonical rehydration.",
      };
      const summary: WorkerSummary = {
        id: workerId,
        title: fallback.title,
        objectiveSummary: fallback.title,
        status: fallback.status,
        updatedAt: fallback.updatedAt,
        managerKind: state.managerRef.kind,
        ticketCount: 0,
        runtimeKind: null,
        telemetryState: state.latestTelemetry.state,
        latestCheckpointSummary: "",
        lastSchedulerSummary: "",
        acknowledgedInboxCount: 0,
        unresolvedInboxCount: 0,
        pendingManagerActionCount: 0,
        pendingApproval: false,
        path: `.loom/workers/${workerId}`,
      };
      return {
        state,
        summary,
        worker: workerMarkdown,
        messages: [],
        checkpoints: [],
        launch: null,
        dashboard: {
          worker: summary,
          workerPath: `.loom/workers/${workerId}/worker.md`,
          launchPath: `.loom/workers/${workerId}/launch.json`,
          latestTelemetry: state.latestTelemetry,
          latestCheckpoint: null,
          latestMessage: null,
          unresolvedInbox: [],
          pendingManagerActions: [],
          counts: { messages: 0, checkpoints: 0, acknowledgedInbox: 0, unresolvedMessages: 0, pendingManagerActions: 0 },
          approval: state.approval,
          consolidation: state.consolidation,
          stale: false,
        },
        packet: workerMarkdown,
        artifacts,
      };
    }
    const worker: WorkerReadResult = {
      state: normalizeWorkerState(parseJsonText<WorkerState>(stateText)),
      summary: {} as WorkerSummary,
      worker: attributes.filesByPath[relativePath(this.cwd, artifacts.worker)] ?? "",
      messages: (attributes.filesByPath[relativePath(this.cwd, artifacts.messages)] ?? "")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          const message = JSON.parse(line) as Partial<WorkerMessageRecord>;
          return {
            id: message.id ?? `${workerId}-message-imported`,
            workerId: message.workerId ?? workerId,
            createdAt: message.createdAt ?? currentTimestamp(),
            direction: normalizeMessageDirection(message.direction),
            awaiting: normalizeMessageAwaiting(message.awaiting),
            kind: normalizeMessageKind(message.kind),
            status: normalizeMessageStatus(message.status),
            from: message.from ?? "imported",
            text: message.text ?? "",
            relatedRefs: normalizeStringList(message.relatedRefs),
            replyTo: normalizeOptionalString(message.replyTo),
            acknowledgedAt: normalizeOptionalString(message.acknowledgedAt),
            acknowledgedBy: normalizeOptionalString(message.acknowledgedBy),
            resolvedAt: normalizeOptionalString(message.resolvedAt),
            resolvedBy: normalizeOptionalString(message.resolvedBy),
          } satisfies WorkerMessageRecord;
        }),
      checkpoints: (attributes.filesByPath[relativePath(this.cwd, artifacts.checkpoints)] ?? "")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          const checkpoint = JSON.parse(line) as Partial<WorkerCheckpointRecord>;
          return {
            id: checkpoint.id ?? `${workerId}-checkpoint-imported`,
            workerId: checkpoint.workerId ?? workerId,
            createdAt: checkpoint.createdAt ?? currentTimestamp(),
            summary: checkpoint.summary ?? "",
            understanding: checkpoint.understanding ?? "",
            recentChanges: normalizeStringList(checkpoint.recentChanges),
            validation: normalizeStringList(checkpoint.validation),
            blockers: normalizeStringList(checkpoint.blockers),
            nextAction: checkpoint.nextAction ?? "",
            acknowledgedMessageIds: normalizeStringList(checkpoint.acknowledgedMessageIds),
            resolvedMessageIds: normalizeStringList(checkpoint.resolvedMessageIds),
            remainingInboxCount: checkpoint.remainingInboxCount ?? 0,
            managerInputRequired: checkpoint.managerInputRequired ?? false,
          } satisfies WorkerCheckpointRecord;
        }),
      launch: attributes.filesByPath[relativePath(this.cwd, artifacts.launch)]
        ? parseJsonText<WorkerRuntimeDescriptor>(attributes.filesByPath[relativePath(this.cwd, artifacts.launch)])
        : null,
      dashboard: {} as WorkerDashboard,
      packet: "",
      artifacts,
    };
    syncDerivedViews(this.cwd, worker);
    if (!worker.worker) {
      worker.worker = renderWorkerMarkdown(worker);
    }
    return worker;
  }

  private async repairWorkerToCanonical(
    workerId: string,
    attributes?: unknown,
    fallback?: { title: string; status: WorkerStatus; updatedAt: string },
  ): Promise<WorkerReadResult> {
    const imported = this.readImportedWorker(workerId, attributes, fallback);
    if (imported) {
      return this.upsertCanonicalWorker(imported);
    }
    if (existsSync(getWorkerArtifactPaths(this.cwd, workerId).state)) {
      return this.upsertCanonicalWorker(this.readWorkerProjection(workerId));
    }
    throw new Error(`Worker entity ${workerId} is missing structured attributes`);
  }

  private linkWorkerIntoTickets(worker: WorkerState): void {
    const ticketStore = createTicketStore(this.cwd);
    for (const ticketId of worker.linkedRefs.ticketIds) {
      ticketStore.addExternalRef(ticketId, `worker:${worker.workerId}`);
    }
  }

  listWorkers(filter: WorkerListFilter = {}): WorkerSummary[] {
    const workers = this.workerIds().map((workerId) => this.readWorkerArtifacts(workerId).summary);
    const filteredByText = filterWorkersByText(workers, filter.text);
    const filteredByTelemetry = filterWorkersByTelemetry(filteredByText, filter.telemetryState);
    return filteredByTelemetry.filter((worker) => {
      if (filter.status && worker.status !== filter.status) {
        return false;
      }
      if (filter.pendingApproval !== undefined && worker.pendingApproval !== filter.pendingApproval) {
        return false;
      }
      return true;
    });
  }

  readWorker(ref: string): WorkerReadResult {
    return this.readWorkerArtifacts(this.resolveWorkerRef(ref));
  }

  managerOverview(): ManagerOverview {
    const workers = this.listWorkers();
    const unresolvedInboxWorkers = workers.filter((worker) => worker.unresolvedInboxCount > 0);
    const pendingManagerActionWorkers = workers.filter((worker) => worker.pendingManagerActionCount > 0);
    const pendingApprovalWorkers = workers.filter((worker) => worker.pendingApproval);
    const resumeCandidates = workers.filter(
      (worker) =>
        worker.unresolvedInboxCount > 0 &&
        (worker.status === "requested" ||
          worker.status === "ready" ||
          worker.status === "active" ||
          worker.status === "blocked" ||
          (worker.status === "waiting_for_review" && !worker.pendingApproval)),
    );
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

  private recordSchedulerObservation(ref: string, summary: string): void {
    const worker = this.readWorker(ref);
    worker.state.lastSchedulerAt = currentTimestamp();
    worker.state.lastSchedulerSummary = summary;
    worker.state.updatedAt = currentTimestamp();
    syncDerivedViews(this.cwd, worker);
    this.persist(worker);
  }

  async runManagerSchedulerPass(
    options: {
      refs?: string[];
      apply?: boolean;
      executeResumes?: boolean;
      signal?: AbortSignal;
      sdkSessionConfig?: WorkerSdkSessionConfig;
    } = {},
  ): Promise<ManagerSchedulerDecision[]> {
    const workerRefs =
      options.refs && options.refs.length > 0
        ? options.refs.map((ref) => this.resolveWorkerRef(ref))
        : this.listWorkers().map((worker) => worker.id);

    const decisions: ManagerSchedulerDecision[] = [];

    for (const ref of workerRefs) {
      const worker = this.readWorker(ref);
      const unresolvedCount = unresolvedInbox(worker.messages).length;
      if (worker.state.status === "completion_requested" && worker.state.approval.status === "pending") {
        const summary = "Pending manager approval requires explicit review.";
        this.recordSchedulerObservation(ref, summary);
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
        this.recordSchedulerObservation(ref, summary);
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
        (worker.state.status === "requested" ||
          worker.state.status === "ready" ||
          worker.state.status === "active" ||
          worker.state.status === "blocked" ||
          (worker.state.status === "waiting_for_review" && !worker.summary.pendingApproval))
      ) {
        if (options.apply === true && options.executeResumes === true) {
          this.prepareLaunch(ref, true, "Prepared by manager scheduler.");
          const running = this.startLaunchExecution(ref);
          if (!running.launch) {
            decisions.push({
              workerId: ref,
              action: "blocked",
              applied: false,
              summary: "Scheduler could not start worker launch execution.",
            });
            continue;
          }
          const execution = await runWorkerLaunch(running.launch, options.signal, undefined, options.sdkSessionConfig);
          this.finishLaunchExecution(ref, execution);
          const summary = `Scheduler resumed worker because unresolved inbox backlog existed (${unresolvedCount}).`;
          this.recordSchedulerObservation(ref, summary);
          decisions.push({
            workerId: ref,
            action: "resume",
            applied: true,
            summary,
          });
        } else {
          const summary = `Worker has unresolved inbox backlog (${unresolvedCount}) and is a resume candidate.`;
          this.recordSchedulerObservation(ref, summary);
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
      if (supervision.decision.action === "steer" || supervision.decision.action === "escalate") {
        const summary = supervision.decision.message ?? supervision.decision.reasoning;
        this.recordSchedulerObservation(ref, summary);
        decisions.push({
          workerId: ref,
          action: "message",
          applied: options.apply === true,
          summary,
        });
      } else if (worker.state.status === "blocked" || worker.state.status === "failed") {
        this.recordSchedulerObservation(ref, supervision.decision.reasoning);
        decisions.push({
          workerId: ref,
          action: "blocked",
          applied: false,
          summary: supervision.decision.reasoning,
        });
      } else {
        this.recordSchedulerObservation(ref, supervision.decision.reasoning);
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
    const linkedRefs = normalizeLinkedRefs(input.linkedRefs);
    if (linkedRefs.ticketIds.length === 0) {
      throw new Error("Workers require at least one linked ticket id");
    }
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
      summary: buildSummary(this.cwd, state, artifacts.worker),
      worker: "",
      messages: [],
      checkpoints: [],
      launch: initialLaunchDescriptor(workerId, state.workspace.branch, state.workspace.baseRef),
      dashboard: {} as WorkerDashboard,
      packet: "",
      artifacts,
    };
    syncDerivedViews(this.cwd, worker);
    this.persist(worker);
    this.linkWorkerIntoTickets(worker.state);
    return this.readWorker(workerId);
  }

  updateWorker(ref: string, input: UpdateWorkerInput): WorkerReadResult {
    const worker = this.readWorker(ref);
    if (input.title !== undefined) worker.state.title = input.title.trim();
    if (input.objective !== undefined) worker.state.objective = input.objective.trim();
    if (input.summary !== undefined) worker.state.summary = input.summary.trim();
    if (input.status !== undefined) worker.state.status = input.status;
    if (input.managerRef !== undefined)
      worker.state.managerRef = normalizeManagerRef({ ...worker.state.managerRef, ...input.managerRef });
    if (input.linkedRefs !== undefined)
      worker.state.linkedRefs = mergeLinkedRefs(worker.state.linkedRefs, input.linkedRefs);
    if (input.workspace !== undefined)
      worker.state.workspace = normalizeWorkspaceDescriptor({ ...worker.state.workspace, ...input.workspace });
    worker.state.updatedAt = currentTimestamp();
    syncDerivedViews(this.cwd, worker);
    this.persist(worker);
    this.linkWorkerIntoTickets(worker.state);
    return this.readWorker(worker.state.workerId);
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
    this.persist(worker);
    return this.readWorker(worker.state.workerId);
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
    this.persist(worker);
    return this.readWorker(worker.state.workerId);
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
    this.persist(worker);

    const ticketStore = createTicketStore(this.cwd);
    for (const ticketId of worker.state.linkedRefs.ticketIds) {
      ticketStore.addJournalEntry(
        ticketId,
        "checkpoint",
        `Worker ${worker.state.workerId} recorded checkpoint ${checkpoint.id}: ${checkpoint.summary}`,
        {
          workerId: worker.state.workerId,
          checkpointId: checkpoint.id,
        },
      );
    }
    return this.readWorker(worker.state.workerId);
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
    this.persist(worker);
    return this.readWorker(worker.state.workerId);
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
    this.persist(worker);

    const ticketStore = createTicketStore(this.cwd);
    for (const ticketId of worker.state.linkedRefs.ticketIds) {
      ticketStore.addJournalEntry(ticketId, "state", `Worker ${worker.state.workerId} requested completion`, {
        workerId: worker.state.workerId,
        summary: worker.state.completionRequest.summary,
      });
    }
    return this.readWorker(worker.state.workerId);
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
    this.persist(worker);

    const ticketStore = createTicketStore(this.cwd);
    for (const ticketId of worker.state.linkedRefs.ticketIds) {
      ticketStore.addJournalEntry(ticketId, "state", `Worker ${worker.state.workerId} approval decision: ${status}`, {
        workerId: worker.state.workerId,
        approval: status,
      });
    }
    return this.readWorker(worker.state.workerId);
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
    this.persist(worker);

    const ticketStore = createTicketStore(this.cwd);
    for (const ticketId of worker.state.linkedRefs.ticketIds) {
      ticketStore.addJournalEntry(
        ticketId,
        isSuccessfulConsolidationStatus(status) ? "verification" : "state",
        `Worker ${worker.state.workerId} consolidation outcome: ${status}`,
        { workerId: worker.state.workerId, consolidationStatus: status, strategy: input.strategy ?? null },
      );
    }
    return this.readWorker(worker.state.workerId);
  }

  superviseWorker(ref: string, apply = false): { worker: WorkerReadResult; decision: WorkerSupervisionDecision } {
    const worker = this.readWorker(ref);
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

    if (worker.state.status === "completion_requested" && worker.state.approval.status === "pending") {
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
    runtime?: WorkerRuntimeDescriptor["runtime"],
  ): WorkerReadResult {
    const worker = this.readWorker(ref);
    const launch = prepareWorkerLaunchDescriptor(this.cwd, worker, { resume, note, runtime });
    worker.launch = launch;
    worker.state.lastLaunchAt = launch.updatedAt;
    worker.state.launchCount += 1;
    worker.state.updatedAt = currentTimestamp();
    syncDerivedViews(this.cwd, worker);
    this.persist(worker);
    return this.readWorker(worker.state.workerId);
  }

  startLaunchExecution(ref: string): WorkerReadResult {
    const worker = this.readWorker(ref);
    if (!worker.launch) {
      throw new Error("Worker launch descriptor has not been prepared");
    }
    const startedAt = currentTimestamp();
    const summary = worker.launch.resume ? "Worker resumed execution" : "Worker launch started";
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
    this.persist(worker);
    return this.readWorker(worker.state.workerId);
  }

  finishLaunchExecution(ref: string, execution: WorkerExecutionResult): WorkerReadResult {
    const worker = this.readWorker(ref);
    if (!worker.launch) {
      throw new Error("Worker launch descriptor has not been prepared");
    }
    const finishedAt = currentTimestamp();
    const startedAt = worker.launch.updatedAt;
    let summary = executionSummary(execution);
    let launchStatus = execution.status === "cancelled" ? "failed" : execution.status;

    if (execution.status === "completed") {
      const progress = assessCompletedLaunchProgress(worker, startedAt);
      if (!progress.durableProgress && progress.actionableInboxAtStart > 0) {
        summary = noDurableProgressSummary(execution, progress);
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
      const nextState = completedExecutionState(worker);
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
    this.persist(worker);
    return this.readWorker(worker.state.workerId);
  }

  retireWorker(ref: string, note?: string): WorkerReadResult {
    const worker = this.readWorker(ref);
    if (worker.launch?.workspacePath) {
      retireWorkerWorkspace(this.cwd, worker.state.workerId, worker.launch.workspacePath);
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
    this.persist(worker);
    return this.readWorker(worker.state.workerId);
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

  listWorkersProjection(filter: WorkerListFilter = {}): WorkerSummary[] {
    return this.listWorkers(filter);
  }

  readWorkerProjection(ref: string): WorkerReadResult {
    return this.readWorker(ref);
  }

  managerOverviewProjection(): ManagerOverview {
    return this.managerOverview();
  }

  async listWorkersAsync(filter: WorkerListFilter = {}): Promise<WorkerSummary[]> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const workers = await Promise.all(
      (await storage.listEntities(identity.space.id, ENTITY_KIND)).map(async (entity) => {
        const workerId = this.resolveWorkerRef(entity.displayId);
        return hasStructuredWorkerAttributes(entity.attributes)
          ? this.entityWorker(entity)
          : this.repairWorkerToCanonical(workerId, entity.attributes, {
              title: entity.title,
              status: entity.status as WorkerStatus,
              updatedAt: entity.updatedAt,
            });
      }),
    );
    return workers
      .map((worker) => worker.summary)
      .filter((worker) => {
        if (filter.status && worker.status !== filter.status) return false;
        if (filter.telemetryState && worker.telemetryState !== filter.telemetryState) return false;
        if (filter.pendingApproval !== undefined && worker.pendingApproval !== filter.pendingApproval) return false;
        return !filter.text || filterWorkersByText([worker], filter.text).length > 0;
      })
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  async readWorkerAsync(ref: string): Promise<WorkerReadResult> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const workerId = this.resolveWorkerRef(ref);
    const entity = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, workerId);
    if (!entity) {
      return this.repairWorkerToCanonical(workerId);
    }
    return hasStructuredWorkerAttributes(entity.attributes)
      ? this.entityWorker(entity)
      : this.repairWorkerToCanonical(workerId, entity.attributes, {
          title: entity.title,
          status: entity.status as WorkerStatus,
          updatedAt: entity.updatedAt,
        });
  }

  async managerOverviewAsync(): Promise<ManagerOverview> {
    const workers = await this.listWorkersAsync({});
    return {
      workers,
      unresolvedInboxWorkers: workers.filter((worker) => worker.unresolvedInboxCount > 0),
      pendingManagerActionWorkers: workers.filter((worker) => worker.pendingManagerActionCount > 0),
      pendingApprovalWorkers: workers.filter((worker) => worker.pendingApproval),
      resumeCandidates: workers.filter(
        (worker) =>
          worker.unresolvedInboxCount > 0 &&
          (worker.status === "requested" ||
            worker.status === "ready" ||
            worker.status === "active" ||
            worker.status === "blocked" ||
            (worker.status === "waiting_for_review" && !worker.pendingApproval)),
      ),
    };
  }

  async createWorkerAsync(input: CreateWorkerInput): Promise<WorkerReadResult> {
    return this.upsertCanonicalWorker(this.createWorker(input));
  }

  async updateWorkerAsync(ref: string, input: UpdateWorkerInput): Promise<WorkerReadResult> {
    return this.upsertCanonicalWorker(this.updateWorker(ref, input));
  }

  async appendMessageAsync(ref: string, input: AppendWorkerMessageInput): Promise<WorkerReadResult> {
    return this.upsertCanonicalWorker(this.appendMessage(ref, input));
  }

  async acknowledgeMessageAsync(ref: string, messageId: string, actor = "worker", note?: string): Promise<WorkerReadResult> {
    return this.upsertCanonicalWorker(this.acknowledgeMessage(ref, messageId, actor, note));
  }

  async resolveMessageAsync(ref: string, messageId: string, actor = "worker", note?: string): Promise<WorkerReadResult> {
    return this.upsertCanonicalWorker(this.resolveMessage(ref, messageId, actor, note));
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
    return this.upsertCanonicalWorker(this.appendCheckpoint(ref, input));
  }

  async setTelemetryAsync(ref: string, input: SetWorkerTelemetryInput): Promise<WorkerReadResult> {
    return this.upsertCanonicalWorker(this.setTelemetry(ref, input));
  }

  async requestCompletionAsync(ref: string, input: RequestWorkerCompletionInput): Promise<WorkerReadResult> {
    return this.upsertCanonicalWorker(this.requestCompletion(ref, input));
  }

  async decideApprovalAsync(ref: string, input: DecideWorkerApprovalInput): Promise<WorkerReadResult> {
    return this.upsertCanonicalWorker(this.decideApproval(ref, input));
  }

  async recordConsolidationAsync(ref: string, input: RecordWorkerConsolidationInput): Promise<WorkerReadResult> {
    return this.upsertCanonicalWorker(this.recordConsolidation(ref, input));
  }

  async superviseWorkersAsync(refs?: string[], apply = false): Promise<Array<{ ref: string; decision: WorkerSupervisionDecision }>> {
    return this.superviseWorkers(refs, apply);
  }

  async prepareLaunchAsync(
    ref: string,
    resume = false,
    note?: string,
    runtime?: WorkerRuntimeDescriptor["runtime"],
  ): Promise<WorkerReadResult> {
    return this.upsertCanonicalWorker(this.prepareLaunch(ref, resume, note, runtime));
  }

  async startLaunchExecutionAsync(ref: string): Promise<WorkerReadResult> {
    return this.upsertCanonicalWorker(this.startLaunchExecution(ref));
  }

  async finishLaunchExecutionAsync(ref: string, execution: WorkerExecutionResult): Promise<WorkerReadResult> {
    return this.upsertCanonicalWorker(this.finishLaunchExecution(ref, execution));
  }

  async retireWorkerAsync(ref: string, note?: string): Promise<WorkerReadResult> {
    return this.upsertCanonicalWorker(this.retireWorker(ref, note));
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
