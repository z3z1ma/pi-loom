import type { LoomListSort } from "@pi-loom/pi-storage/storage/list-search.js";
import type { WorkerArtifactPaths } from "./paths.js";

export const WORKER_STATUSES = [
  "requested",
  "provisioning",
  "ready",
  "active",
  "blocked",
  "waiting_for_review",
  "completed",
  "retired",
  "failed",
  "archived",
] as const;
export const WORKSPACE_STRATEGIES = ["git-worktree"] as const;
export const WORKER_RUNTIME_KINDS = ["subprocess", "descriptor_only"] as const;
export const DEFAULT_WORKER_RUNTIME_KIND = "subprocess" as const;
export const WORKER_TELEMETRY_STATES = [
  "unknown",
  "busy",
  "idle",
  "blocked",
  "waiting_for_review",
  "finished",
] as const;
export const MANAGER_REF_KINDS = ["operator", "manual", "initiative", "plan", "ticket", "ralph", "manager"] as const;
export const MESSAGE_DIRECTIONS = ["manager_to_worker", "worker_to_manager", "broadcast"] as const;
export const MESSAGE_AWAITING = ["none", "worker", "manager"] as const;
export const MESSAGE_KINDS = [
  "assignment",
  "acknowledgement",
  "clarification",
  "unblock",
  "escalation",
  "resolution",
  "checkpoint_notice",
  "completion_notice",
  "broadcast_warning",
  "status_update",
  "note",
] as const;
export const MESSAGE_STATUSES = ["pending", "acknowledged", "resolved"] as const;
export const APPROVAL_STATUSES = [
  "not_requested",
  "pending",
  "approved",
  "rejected_for_revision",
  "escalated",
] as const;

export type WorkerStatus = (typeof WORKER_STATUSES)[number];
export type WorkspaceStrategy = (typeof WORKSPACE_STRATEGIES)[number];
export type WorkerRuntimeKind = (typeof WORKER_RUNTIME_KINDS)[number];
export type WorkerTelemetryState = (typeof WORKER_TELEMETRY_STATES)[number];
export type ManagerRefKind = (typeof MANAGER_REF_KINDS)[number];
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];
export type MessageAwaiting = (typeof MESSAGE_AWAITING)[number];
export type MessageKind = (typeof MESSAGE_KINDS)[number];
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export interface WorkerLinkedRefs {
  initiativeIds: string[];
  researchIds: string[];
  specChangeIds: string[];
  ticketIds: string[];
  critiqueIds: string[];
  docIds: string[];
  planIds: string[];
  ralphRunIds: string[];
}

export interface ManagerRef {
  kind: ManagerRefKind;
  ref: string;
  label: string | null;
}

export interface WorkerWorkspaceDescriptor {
  repositoryRoot: string;
  strategy: WorkspaceStrategy;
  baseRef: string;
  branch: string;
  labels: string[];
  workspaceKey: string;
}

export interface WorkerTelemetry {
  state: WorkerTelemetryState;
  summary: string;
  heartbeatAt: string | null;
  checkpointId: string | null;
  pendingMessages: number;
  notes: string[];
}

export interface WorkerState {
  workerId: string;
  title: string;
  objective: string;
  summary: string;
  status: WorkerStatus;
  createdAt: string;
  updatedAt: string;
  managerRef: ManagerRef;
  linkedRefs: WorkerLinkedRefs;
  workspace: WorkerWorkspaceDescriptor;
  latestTelemetry: WorkerTelemetry;
  latestCheckpointSummary: string;
  lastLaunchAt: string | null;
}

export interface WorkerSummary {
  id: string;
  title: string;
  objectiveSummary: string;
  status: WorkerStatus;
  updatedAt: string;
  managerKind: ManagerRefKind;
  ticketCount: number;
  telemetryState: WorkerTelemetryState;
  latestCheckpointSummary: string;
  acknowledgedInboxCount: number;
  unresolvedInboxCount: number;
  pendingManagerActionCount: number;
  workerRef: string;
}

export interface WorkerMessageRecord {
  id: string;
  workerId: string;
  createdAt: string;
  direction: MessageDirection;
  awaiting: MessageAwaiting;
  kind: MessageKind;
  status: MessageStatus;
  from: string;
  text: string;
  relatedRefs: string[];
  replyTo: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface WorkerCheckpointRecord {
  id: string;
  workerId: string;
  createdAt: string;
  summary: string;
  understanding: string;
  recentChanges: string[];
  validation: string[];
  blockers: string[];
  nextAction: string;
  acknowledgedMessageIds: string[];
  resolvedMessageIds: string[];
  remainingInboxCount: number;
  managerInputRequired: boolean;
}

export interface WorkerRuntimeDescriptor {
  workerId: string;
  ralphRunId: string;
  iterationId: string;
  iteration: number;
  createdAt: string;
  updatedAt: string;
  runtime: WorkerRuntimeKind;
  resume: boolean;
  workspaceDir: string;
  branch: string;
  baseRef: string;
  packetRef: string;
  ralphLaunchRef: string;
  instructions: string[];
  command: string[];
  pid: number | null;
  status: "prepared" | "running" | "completed" | "failed" | "retired";
  note: string;
}

export interface WorkerLaunchAttachmentMetadata extends Record<string, unknown> {
  workerId: string;
  launch: WorkerRuntimeDescriptor;
}

export interface WorkerCheckpointArtifactPayload extends WorkerCheckpointRecord, Record<string, unknown> {}

export interface WorkerCanonicalRecord extends Record<string, unknown> {
  state: WorkerState;
  messages: WorkerMessageRecord[];
}

export interface WorkerDashboard {
  worker: WorkerSummary;
  workerRef: string;
  launchRef: string;
  latestTelemetry: WorkerTelemetry;
  latestCheckpoint: WorkerCheckpointRecord | null;
  latestMessage: WorkerMessageRecord | null;
  unresolvedInbox: WorkerMessageRecord[];
  pendingManagerActions: WorkerMessageRecord[];
  counts: {
    messages: number;
    checkpoints: number;
    acknowledgedInbox: number;
    unresolvedMessages: number;
    pendingManagerActions: number;
  };
  stale: boolean;
}

export interface WorkerReadResult {
  state: WorkerState;
  summary: WorkerSummary;
  worker: string;
  messages: WorkerMessageRecord[];
  checkpoints: WorkerCheckpointRecord[];
  launch: WorkerRuntimeDescriptor | null;
  dashboard: WorkerDashboard;
  packet: string;
  artifacts: WorkerArtifactPaths;
}

export interface WorkerListFilter {
  status?: WorkerStatus;
  text?: string;
  sort?: LoomListSort;
  telemetryState?: WorkerTelemetryState;
}

export interface CreateWorkerInput {
  workerId?: string;
  title: string;
  objective?: string;
  summary?: string;
  managerRef?: Partial<ManagerRef>;
  linkedRefs?: Partial<WorkerLinkedRefs>;
  workspace?: Partial<WorkerWorkspaceDescriptor>;
}

export interface UpdateWorkerInput {
  title?: string;
  objective?: string;
  summary?: string;
  status?: WorkerStatus;
  managerRef?: Partial<ManagerRef>;
  linkedRefs?: Partial<WorkerLinkedRefs>;
  workspace?: Partial<WorkerWorkspaceDescriptor>;
}

export interface AppendWorkerMessageInput {
  id?: string;
  createdAt?: string;
  direction?: MessageDirection;
  awaiting?: MessageAwaiting;
  kind?: MessageKind;
  status?: MessageStatus;
  from?: string;
  text: string;
  relatedRefs?: string[];
  replyTo?: string | null;
}

export interface AppendWorkerCheckpointInput {
  id?: string;
  createdAt?: string;
  summary?: string;
  understanding?: string;
  recentChanges?: string[];
  validation?: string[];
  blockers?: string[];
  nextAction?: string;
  acknowledgedMessageIds?: string[];
  resolvedMessageIds?: string[];
  remainingInboxCount?: number;
  managerInputRequired?: boolean;
}

export interface SetWorkerTelemetryInput {
  state?: WorkerTelemetryState;
  summary?: string;
  heartbeatAt?: string | null;
  checkpointId?: string | null;
  pendingMessages?: number;
  notes?: string[];
}

export interface RequestWorkerCompletionInput {
  summary?: string;
}

export interface RecordWorkerOutcomeInput {
  status: Extract<WorkerStatus, "ready" | "blocked" | "waiting_for_review" | "completed" | "failed">;
  summary?: string;
  validation?: string[];
  conflicts?: string[];
  followUps?: string[];
  decidedAt?: string;
}

export interface PrepareWorkerLaunchInput {
  resume?: boolean;
  note?: string;
}

export const MANAGER_STATUSES = ["active", "waiting_for_input", "completed", "failed", "archived"] as const;
export const MANAGER_MESSAGE_DIRECTIONS = ["operator_to_manager", "manager_to_operator"] as const;
export const MANAGER_MESSAGE_KINDS = ["steer", "approval", "escalation", "report"] as const;
export const MANAGER_MESSAGE_STATUSES = ["pending", "resolved"] as const;

export type ManagerStatus = (typeof MANAGER_STATUSES)[number];
export type ManagerMessageDirection = (typeof MANAGER_MESSAGE_DIRECTIONS)[number];
export type ManagerMessageKind = (typeof MANAGER_MESSAGE_KINDS)[number];
export type ManagerMessageStatus = (typeof MANAGER_MESSAGE_STATUSES)[number];

export interface ManagerLinkedRefs {
  initiativeIds: string[];
  researchIds: string[];
  specChangeIds: string[];
  ticketIds: string[];
  critiqueIds: string[];
  docIds: string[];
  planIds: string[];
}

export interface ManagerState {
  managerId: string;
  title: string;
  objective: string;
  summary: string;
  status: ManagerStatus;
  createdAt: string;
  updatedAt: string;
  targetRef: string;
  linkedRefs: ManagerLinkedRefs;
  workerIds: string[];
  workerSignature: string;
  latestSummary: string;
  lastRunAt: string | null;
  runCount: number;
}

export interface ManagerMessageRecord {
  id: string;
  managerId: string;
  createdAt: string;
  direction: ManagerMessageDirection;
  kind: ManagerMessageKind;
  status: ManagerMessageStatus;
  text: string;
  workerId: string | null;
  resolvedAt: string | null;
}

export interface ManagerCanonicalRecord extends Record<string, unknown> {
  state: ManagerState;
  messages: ManagerMessageRecord[];
}

export interface ManagerSummary {
  id: string;
  title: string;
  status: ManagerStatus;
  targetRef: string;
  ticketCount: number;
  workerCount: number;
  updatedAt: string;
  latestSummary: string;
  pendingMessages: number;
}

export interface ManagerWorkerView {
  id: string;
  title: string;
  status: WorkerStatus;
  branch: string;
  baseRef: string;
  ticketIds: string[];
  ralphRunId: string | null;
  latestSummary: string;
}

export interface ManagerReadResult {
  state: ManagerState;
  summary: ManagerSummary;
  messages: ManagerMessageRecord[];
  workers: ManagerWorkerView[];
  manager: string;
}

export interface ManagerListFilter {
  status?: ManagerStatus;
  text?: string;
  sort?: LoomListSort;
}

export interface CreateManagerInput {
  managerId?: string;
  title: string;
  objective?: string;
  summary?: string;
  targetRef?: string;
  linkedRefs?: Partial<ManagerLinkedRefs>;
}

export interface ManagerSteerInput {
  text?: string;
  workerId?: string;
  approvalStatus?: Exclude<ApprovalStatus, "not_requested" | "pending">;
  targetRef?: string;
}

export interface ManagerCheckpointInput {
  status?: ManagerStatus;
  summary?: string;
  linkedRefs?: Partial<ManagerLinkedRefs>;
  resolveOperatorInput?: boolean;
  operatorMessages?: Array<{
    kind: ManagerMessageKind;
    text: string;
    workerId?: string | null;
  }>;
  workerUpdates?: Array<{
    workerId: string;
    status: Extract<WorkerStatus, "ready" | "blocked" | "waiting_for_review" | "completed" | "failed">;
    summary?: string;
    validation?: string[];
    conflicts?: string[];
    followUps?: string[];
  }>;
}
