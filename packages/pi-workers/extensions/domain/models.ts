import type { LoomListSort } from "@pi-loom/pi-storage/storage/list-search.js";
import type { WorkerArtifactPaths } from "./paths.js";

export const WORKER_STATUSES = [
  "requested",
  "provisioning",
  "ready",
  "active",
  "blocked",
  "waiting_for_review",
  "completion_requested",
  "approved_for_consolidation",
  "completed",
  "retired",
  "failed",
  "archived",
] as const;
export const WORKSPACE_STRATEGIES = ["git-worktree"] as const;
export const WORKER_RUNTIME_KINDS = ["subprocess", "sdk", "rpc"] as const;
export const DEFAULT_WORKER_RUNTIME_KIND = "sdk" as const;
export const WORKER_TELEMETRY_STATES = [
  "unknown",
  "busy",
  "idle",
  "blocked",
  "waiting_for_review",
  "finished",
] as const;
export const MANAGER_REF_KINDS = ["operator", "manual", "plan", "ticket", "ralph", "runtime"] as const;
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
  "approval_decision",
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
export const CONSOLIDATION_STATUSES = [
  "not_started",
  "pending",
  "in_progress",
  "merged",
  "cherry_picked",
  "patched",
  "conflicted",
  "validation_failed",
  "rolled_back",
  "deferred",
] as const;
export const CONSOLIDATION_STRATEGIES = ["merge", "cherry-pick", "patch", "manual"] as const;
export const SUPERVISION_ACTIONS = ["continue", "steer", "escalate", "approve", "retire"] as const;

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
export type ConsolidationStatus = (typeof CONSOLIDATION_STATUSES)[number];
export type ConsolidationStrategy = (typeof CONSOLIDATION_STRATEGIES)[number];
export type SupervisionAction = (typeof SUPERVISION_ACTIONS)[number];

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

export interface WorkerCompletionRequest {
  requestedAt: string | null;
  scopeComplete: string[];
  validationEvidence: string[];
  remainingRisks: string[];
  branchState: string;
  summary: string;
  requestedBy: string;
}

export interface WorkerApprovalDecision {
  status: ApprovalStatus;
  decidedAt: string | null;
  decidedBy: string | null;
  summary: string;
  rationale: string[];
}

export interface WorkerConsolidationOutcome {
  status: ConsolidationStatus;
  strategy: ConsolidationStrategy | null;
  summary: string;
  validation: string[];
  conflicts: string[];
  followUps: string[];
  decidedAt: string | null;
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
  latestCheckpointId: string | null;
  latestCheckpointSummary: string;
  lastMessageAt: string | null;
  lastLaunchAt: string | null;
  lastSchedulerAt: string | null;
  lastSchedulerSummary: string;
  launchCount: number;
  lastRuntimeKind: WorkerRuntimeKind | null;
  interventionCount: number;
  completionRequest: WorkerCompletionRequest;
  approval: WorkerApprovalDecision;
  consolidation: WorkerConsolidationOutcome;
  packetSummary: string;
}

export interface WorkerSummary {
  id: string;
  title: string;
  objectiveSummary: string;
  status: WorkerStatus;
  updatedAt: string;
  managerKind: ManagerRefKind;
  ticketCount: number;
  runtimeKind: WorkerRuntimeKind | null;
  telemetryState: WorkerTelemetryState;
  latestCheckpointSummary: string;
  lastSchedulerSummary: string;
  acknowledgedInboxCount: number;
  unresolvedInboxCount: number;
  pendingManagerActionCount: number;
  pendingApproval: boolean;
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
  createdAt: string;
  updatedAt: string;
  runtime: WorkerRuntimeKind;
  resume: boolean;
  workspaceDir: string;
  branch: string;
  baseRef: string;
  launchPrompt: string;
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

export interface WorkerSupervisionDecision {
  action: SupervisionAction;
  confidence: number;
  reasoning: string;
  message: string | null;
  evidence: string[];
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
  approval: WorkerApprovalDecision;
  consolidation: WorkerConsolidationOutcome;
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

export interface ManagerOverview {
  workers: WorkerSummary[];
  unresolvedInboxWorkers: WorkerSummary[];
  pendingManagerActionWorkers: WorkerSummary[];
  pendingApprovalWorkers: WorkerSummary[];
  resumeCandidates: WorkerSummary[];
}

export interface ManagerSchedulerDecision {
  workerId: string;
  action: "resume" | "needs_approval" | "message" | "wait" | "blocked";
  applied: boolean;
  summary: string;
}

export interface WorkerListFilter {
  status?: WorkerStatus;
  text?: string;
  sort?: LoomListSort;
  telemetryState?: WorkerTelemetryState;
  pendingApproval?: boolean;
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
  requestedAt?: string;
  scopeComplete?: string[];
  validationEvidence?: string[];
  remainingRisks?: string[];
  branchState?: string;
  summary?: string;
  requestedBy?: string;
}

export interface DecideWorkerApprovalInput {
  status: Exclude<ApprovalStatus, "not_requested" | "pending">;
  decidedAt?: string;
  decidedBy?: string;
  summary?: string;
  rationale?: string[];
}

export interface RecordWorkerConsolidationInput {
  status: Exclude<ConsolidationStatus, "not_started" | "pending">;
  strategy?: ConsolidationStrategy | null;
  summary?: string;
  validation?: string[];
  conflicts?: string[];
  followUps?: string[];
  decidedAt?: string;
}

export interface PrepareWorkerLaunchInput {
  resume?: boolean;
  note?: string;
  prompt?: string;
  runtime?: WorkerRuntimeKind;
}
