import type { RalphArtifactPaths } from "./paths.js";

export const RALPH_RUN_STATUSES = [
  "planned",
  "active",
  "paused",
  "waiting_for_review",
  "completed",
  "halted",
  "failed",
  "archived",
] as const;
export const RALPH_RUN_PHASES = ["preparing", "executing", "reviewing", "deciding", "completed", "halted"] as const;
export const RALPH_WAITING_FOR = ["none", "verifier", "critique", "operator"] as const;
export const RALPH_ITERATION_STATUSES = [
  "pending",
  "running",
  "reviewing",
  "accepted",
  "rejected",
  "failed",
  "cancelled",
] as const;
export const RALPH_POLICY_MODES = ["strict", "balanced", "expedite"] as const;
export const RALPH_VERIFIER_SOURCE_KINDS = ["manual", "plan", "ticket", "test", "diagnostic", "runtime"] as const;
export const RALPH_VERIFIER_VERDICTS = ["not_run", "pass", "concerns", "fail"] as const;
export const RALPH_CRITIQUE_LINK_KINDS = ["context", "launched", "blocking", "accepted", "followup"] as const;
export const RALPH_CRITIQUE_VERDICTS = ["pass", "concerns", "blocked", "needs_revision"] as const;
export const RALPH_DECISION_KINDS = ["continue", "pause", "complete", "halt", "escalate"] as const;
export const RALPH_DECISION_REASONS = [
  "goal_reached",
  "verifier_blocked",
  "critique_blocked",
  "manual_review_required",
  "iteration_limit_reached",
  "policy_blocked",
  "operator_requested",
  "runtime_unavailable",
  "runtime_failure",
  "timeout_exceeded",
  "budget_exceeded",
  "worker_requested_completion",
  "unknown",
] as const;

export type RalphRunStatus = (typeof RALPH_RUN_STATUSES)[number];
export type RalphRunPhase = (typeof RALPH_RUN_PHASES)[number];
export type RalphWaitingFor = (typeof RALPH_WAITING_FOR)[number];
export type RalphIterationStatus = (typeof RALPH_ITERATION_STATUSES)[number];
export type RalphPolicyMode = (typeof RALPH_POLICY_MODES)[number];
export type RalphVerifierSourceKind = (typeof RALPH_VERIFIER_SOURCE_KINDS)[number];
export type RalphVerifierVerdict = (typeof RALPH_VERIFIER_VERDICTS)[number];
export type RalphCritiqueLinkKind = (typeof RALPH_CRITIQUE_LINK_KINDS)[number];
export type RalphCritiqueVerdict = (typeof RALPH_CRITIQUE_VERDICTS)[number];
export type RalphDecisionKind = (typeof RALPH_DECISION_KINDS)[number];
export type RalphDecisionReason = (typeof RALPH_DECISION_REASONS)[number];

export interface RalphLinkedRefs {
  roadmapItemIds: string[];
  initiativeIds: string[];
  researchIds: string[];
  specChangeIds: string[];
  ticketIds: string[];
  critiqueIds: string[];
  docIds: string[];
  planIds: string[];
}

export interface RalphPolicySnapshot {
  mode: RalphPolicyMode;
  maxIterations: number | null;
  maxRuntimeMinutes: number | null;
  tokenBudget: number | null;
  verifierRequired: boolean;
  critiqueRequired: boolean;
  stopWhenVerified: boolean;
  manualApprovalRequired: boolean;
  allowOperatorPause: boolean;
  notes: string[];
}

export interface RalphVerifierSummary {
  sourceKind: RalphVerifierSourceKind;
  sourceRef: string;
  verdict: RalphVerifierVerdict;
  summary: string;
  required: boolean;
  blocker: boolean;
  checkedAt: string | null;
  evidence: string[];
}

export interface RalphCritiqueLink {
  critiqueId: string;
  kind: RalphCritiqueLinkKind;
  verdict: RalphCritiqueVerdict | null;
  required: boolean;
  blocking: boolean;
  reviewedAt: string | null;
  findingIds: string[];
  summary: string;
}

export interface RalphContinuationDecision {
  kind: RalphDecisionKind;
  reason: RalphDecisionReason;
  summary: string;
  decidedAt: string;
  decidedBy: "policy" | "verifier" | "critique" | "operator" | "runtime";
  blockingRefs: string[];
}

export interface RalphIterationRecord {
  id: string;
  runId: string;
  iteration: number;
  status: RalphIterationStatus;
  startedAt: string;
  completedAt: string | null;
  focus: string;
  summary: string;
  workerSummary: string;
  verifier: RalphVerifierSummary;
  critiqueLinks: RalphCritiqueLink[];
  decision: RalphContinuationDecision | null;
  notes: string[];
}

export interface RalphLaunchDescriptor {
  runId: string;
  iterationId: string;
  iteration: number;
  createdAt: string;
  runtime: "subprocess" | "descriptor_only";
  packetPath: string;
  launchPath: string;
  resume: boolean;
  instructions: string[];
}

export interface RalphRunState {
  runId: string;
  title: string;
  status: RalphRunStatus;
  phase: RalphRunPhase;
  waitingFor: RalphWaitingFor;
  createdAt: string;
  updatedAt: string;
  objective: string;
  summary: string;
  linkedRefs: RalphLinkedRefs;
  policySnapshot: RalphPolicySnapshot;
  verifierSummary: RalphVerifierSummary;
  critiqueLinks: RalphCritiqueLink[];
  latestDecision: RalphContinuationDecision | null;
  lastIterationNumber: number;
  currentIterationId: string | null;
  lastLaunchAt: string | null;
  launchCount: number;
  stopReason: RalphDecisionReason | null;
  packetSummary: string;
}

export interface RalphRunSummary {
  id: string;
  title: string;
  status: RalphRunStatus;
  phase: RalphRunPhase;
  updatedAt: string;
  iterationCount: number;
  policyMode: RalphPolicyMode;
  decision: RalphDecisionKind | null;
  waitingFor: RalphWaitingFor;
  objectiveSummary: string;
  path: string;
}

export interface RalphDashboardLatestIteration {
  id: string;
  iteration: number;
  status: RalphIterationStatus;
  summary: string;
  completedAt: string | null;
}

export interface RalphDashboard {
  run: RalphRunSummary;
  packetPath: string;
  runPath: string;
  launchPath: string;
  latestIteration: RalphDashboardLatestIteration | null;
  counts: {
    iterations: number;
    byStatus: Record<RalphIterationStatus, number>;
    verifierVerdicts: Record<RalphVerifierVerdict, number>;
  };
  critiqueLinks: RalphCritiqueLink[];
  latestDecision: RalphContinuationDecision | null;
  waitingFor: RalphWaitingFor;
}

export interface RalphReadResult {
  state: RalphRunState;
  summary: RalphRunSummary;
  packet: string;
  run: string;
  iterations: RalphIterationRecord[];
  launch: RalphLaunchDescriptor;
  dashboard: RalphDashboard;
  artifacts: RalphArtifactPaths;
}

export interface RalphListFilter {
  status?: RalphRunStatus;
  phase?: RalphRunPhase;
  decision?: RalphDecisionKind;
  waitingFor?: RalphWaitingFor;
  text?: string;
}

export interface CreateRalphRunInput {
  runId?: string;
  title: string;
  objective?: string;
  summary?: string;
  linkedRefs?: Partial<RalphLinkedRefs>;
  policySnapshot?: Partial<RalphPolicySnapshot>;
  verifierSummary?: Partial<RalphVerifierSummary>;
  critiqueLinks?: RalphCritiqueLink[];
  latestDecision?: RalphContinuationDecision | null;
  launchInstructions?: string[];
}

export interface UpdateRalphRunInput {
  title?: string;
  objective?: string;
  summary?: string;
  linkedRefs?: Partial<RalphLinkedRefs>;
  policySnapshot?: Partial<RalphPolicySnapshot>;
  verifierSummary?: Partial<RalphVerifierSummary>;
  critiqueLinks?: RalphCritiqueLink[];
  latestDecision?: RalphContinuationDecision | null;
  waitingFor?: RalphWaitingFor;
  status?: RalphRunStatus;
  phase?: RalphRunPhase;
}

export interface AppendRalphIterationInput {
  id?: string;
  status?: RalphIterationStatus;
  startedAt?: string;
  completedAt?: string | null;
  focus?: string;
  summary?: string;
  workerSummary?: string;
  verifier?: Partial<RalphVerifierSummary>;
  critiqueLinks?: RalphCritiqueLink[];
  decision?: RalphContinuationDecision | null;
  notes?: string[];
}

export interface LinkRalphCritiqueInput {
  critiqueId: string;
  kind?: RalphCritiqueLinkKind;
  verdict?: RalphCritiqueVerdict | null;
  required?: boolean;
  blocking?: boolean;
  reviewedAt?: string | null;
  findingIds?: string[];
  summary?: string;
}

export interface DecideRalphRunInput {
  workerRequestedCompletion?: boolean;
  operatorRequestedStop?: boolean;
  runtimeUnavailable?: boolean;
  runtimeFailure?: boolean;
  timeoutExceeded?: boolean;
  budgetExceeded?: boolean;
  summary?: string;
  decidedBy?: RalphContinuationDecision["decidedBy"];
  blockingRefs?: string[];
}

export interface PrepareRalphLaunchInput {
  focus?: string;
  instructions?: string[];
  resume?: boolean;
}
