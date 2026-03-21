import type { LoomListSort } from "@pi-loom/pi-storage/storage/list-search.js";
import type { WorkerArtifactPaths } from "./paths.js";

export const WORKER_STATUSES = ["queued", "running", "waiting_for_manager", "completed", "failed", "retired"] as const;
export const WORKSPACE_STRATEGIES = ["git-worktree"] as const;
export const WORKER_RUNTIME_KINDS = ["session"] as const;
export const DEFAULT_WORKER_RUNTIME_KIND = "session" as const;
export const MANAGER_STATUSES = ["active", "waiting_for_input", "completed", "failed", "archived"] as const;
export const MANAGER_MESSAGE_DIRECTIONS = ["operator_to_manager", "manager_to_operator"] as const;
export const MANAGER_MESSAGE_KINDS = ["steer", "review", "escalation", "report"] as const;
export const MANAGER_MESSAGE_STATUSES = ["pending", "resolved"] as const;
export const REVIEW_DECISIONS = ["approved", "rejected_for_revision", "escalated"] as const;

export type WorkerStatus = (typeof WORKER_STATUSES)[number];
export type WorkspaceStrategy = (typeof WORKSPACE_STRATEGIES)[number];
export type WorkerRuntimeKind = (typeof WORKER_RUNTIME_KINDS)[number];
export type ManagerStatus = (typeof MANAGER_STATUSES)[number];
export type ManagerMessageDirection = (typeof MANAGER_MESSAGE_DIRECTIONS)[number];
export type ManagerMessageKind = (typeof MANAGER_MESSAGE_KINDS)[number];
export type ManagerMessageStatus = (typeof MANAGER_MESSAGE_STATUSES)[number];
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export interface WorkerWorkspaceDescriptor {
  repositoryRoot: string;
  strategy: WorkspaceStrategy;
  baseRef: string;
  branch: string;
  labels: string[];
  workspaceKey: string;
}

export interface WorkerState {
  workerId: string;
  title: string;
  objective: string;
  summary: string;
  status: WorkerStatus;
  createdAt: string;
  updatedAt: string;
  managerId: string;
  ticketId: string;
  ralphRunId: string;
  workspace: WorkerWorkspaceDescriptor;
  pendingInstructions: string[];
  lastLaunchAt: string | null;
}

export interface WorkerSummary {
  id: string;
  title: string;
  status: WorkerStatus;
  updatedAt: string;
  ticketId: string;
  branch: string;
  baseRef: string;
  ralphRunId: string;
  latestSummary: string;
  workerRef: string;
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

export interface WorkerCanonicalRecord extends Record<string, unknown> {
  state: WorkerState;
}

export interface WorkerReadResult {
  state: WorkerState;
  summary: WorkerSummary;
  worker: string;
  launch: WorkerRuntimeDescriptor | null;
  artifacts: WorkerArtifactPaths;
}

export interface WorkerListFilter {
  status?: WorkerStatus;
  text?: string;
  sort?: LoomListSort;
}

export interface CreateWorkerInput {
  workerId?: string;
  title: string;
  objective?: string;
  summary?: string;
  managerId: string;
  ticketId: string;
  ralphRunId?: string;
  linkedRefs?: Partial<ManagerLinkedRefs>;
  workspace?: Partial<WorkerWorkspaceDescriptor>;
}

export interface UpdateWorkerInput {
  title?: string;
  objective?: string;
  summary?: string;
  status?: WorkerStatus;
  workspace?: Partial<WorkerWorkspaceDescriptor>;
  pendingInstructions?: string[];
}

export interface RecordWorkerOutcomeInput {
  status: WorkerStatus;
  summary?: string;
  instructions?: string[];
  validation?: string[];
  conflicts?: string[];
  followUps?: string[];
}

export interface PrepareWorkerLaunchInput {
  resume?: boolean;
  note?: string;
  instructions?: string[];
}

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
  ralphRunId: string;
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

export interface ManagerLoopView {
  runId: string;
  status: string;
  phase: string;
  waitingFor: string;
  latestDecision: string | null;
  latestSummary: string;
  nextLaunchPrepared: string | null;
}

export interface ManagerWorkerView {
  id: string;
  title: string;
  status: WorkerStatus;
  ticketId: string;
  branch: string;
  baseRef: string;
  ralphRunId: string;
  latestSummary: string;
}

export interface ManagerReadResult {
  state: ManagerState;
  summary: ManagerSummary;
  messages: ManagerMessageRecord[];
  workers: ManagerWorkerView[];
  managerLoop: ManagerLoopView;
  manager: string;
}

export interface ManagerSummary {
  id: string;
  title: string;
  status: ManagerStatus;
  targetRef: string;
  ticketCount: number;
  workerCount: number;
  updatedAt: string;
  summary: string;
  pendingMessages: number;
  managerRunStatus: string;
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
  reviewDecision?: ReviewDecision;
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
    status: WorkerStatus;
    summary?: string;
    instructions?: string[];
    validation?: string[];
    conflicts?: string[];
    followUps?: string[];
  }>;
}
