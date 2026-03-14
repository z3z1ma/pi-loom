export const CRITIQUE_STATUSES = ["proposed", "active", "resolved", "superseded", "archived"] as const;
export const CRITIQUE_TARGET_KINDS = [
  "ticket",
  "spec",
  "initiative",
  "research",
  "constitution",
  "artifact",
  "workspace",
] as const;
export const CRITIQUE_FOCUS_AREAS = [
  "correctness",
  "edge_cases",
  "tests",
  "architecture",
  "roadmap_alignment",
  "constitutional_alignment",
  "security",
  "performance",
  "docs",
  "maintainability",
  "process",
] as const;
export const CRITIQUE_VERDICTS = ["pass", "concerns", "blocked", "needs_revision"] as const;
export const CRITIQUE_RUN_KINDS = [
  "adversarial",
  "verification",
  "roadmap_alignment",
  "architecture",
  "security",
  "performance",
  "docs",
  "process",
] as const;
export const CRITIQUE_FINDING_KINDS = [
  "bug",
  "unsafe_assumption",
  "missing_test",
  "edge_case",
  "architecture",
  "roadmap_misalignment",
  "constitutional_violation",
  "security",
  "performance",
  "docs_gap",
  "process_issue",
] as const;
export const CRITIQUE_FINDING_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const CRITIQUE_FINDING_CONFIDENCE = ["low", "medium", "high"] as const;
export const CRITIQUE_FINDING_STATUSES = ["open", "accepted", "rejected", "fixed", "superseded"] as const;

export type CritiqueStatus = (typeof CRITIQUE_STATUSES)[number];
export type CritiqueTargetKind = (typeof CRITIQUE_TARGET_KINDS)[number];
export type CritiqueFocusArea = (typeof CRITIQUE_FOCUS_AREAS)[number];
export type CritiqueVerdict = (typeof CRITIQUE_VERDICTS)[number];
export type CritiqueRunKind = (typeof CRITIQUE_RUN_KINDS)[number];
export type CritiqueFindingKind = (typeof CRITIQUE_FINDING_KINDS)[number];
export type CritiqueFindingSeverity = (typeof CRITIQUE_FINDING_SEVERITIES)[number];
export type CritiqueFindingConfidence = (typeof CRITIQUE_FINDING_CONFIDENCE)[number];
export type CritiqueFindingStatus = (typeof CRITIQUE_FINDING_STATUSES)[number];

export interface CritiqueTargetRef {
  kind: CritiqueTargetKind;
  ref: string;
  path: string | null;
}

export interface CritiqueContextRefs {
  roadmapItemIds: string[];
  initiativeIds: string[];
  researchIds: string[];
  specChangeIds: string[];
  ticketIds: string[];
}

export interface CritiqueState {
  critiqueId: string;
  title: string;
  status: CritiqueStatus;
  createdAt: string;
  updatedAt: string;
  target: CritiqueTargetRef;
  focusAreas: CritiqueFocusArea[];
  reviewQuestion: string;
  scopePaths: string[];
  nonGoals: string[];
  contextRefs: CritiqueContextRefs;
  packetSummary: string;
  currentVerdict: CritiqueVerdict;
  openFindingIds: string[];
  followupTicketIds: string[];
  freshContextRequired: boolean;
  lastRunId: string | null;
  lastLaunchAt: string | null;
  launchCount: number;
}

export interface CritiqueSummary {
  id: string;
  title: string;
  status: CritiqueStatus;
  verdict: CritiqueVerdict;
  targetKind: CritiqueTargetKind;
  targetRef: string;
  focusAreas: CritiqueFocusArea[];
  updatedAt: string;
  openFindingCount: number;
  followupTicketCount: number;
  path: string;
}

export interface CritiqueRunRecord {
  id: string;
  critiqueId: string;
  createdAt: string;
  kind: CritiqueRunKind;
  summary: string;
  verdict: CritiqueVerdict;
  freshContext: boolean;
  focusAreas: CritiqueFocusArea[];
  findingIds: string[];
  followupTicketIds: string[];
}

export interface CritiqueFindingRecord {
  id: string;
  critiqueId: string;
  runId: string;
  createdAt: string;
  updatedAt: string;
  kind: CritiqueFindingKind;
  severity: CritiqueFindingSeverity;
  confidence: CritiqueFindingConfidence;
  title: string;
  summary: string;
  evidence: string[];
  scopePaths: string[];
  recommendedAction: string;
  status: CritiqueFindingStatus;
  linkedTicketId: string | null;
  resolutionNotes: string | null;
}

export interface CritiqueLaunchDescriptor {
  critiqueId: string;
  createdAt: string;
  packetPath: string;
  target: CritiqueTargetRef;
  focusAreas: CritiqueFocusArea[];
  reviewQuestion: string;
  freshContextRequired: boolean;
  runtime: "descriptor_only";
  instructions: string[];
}

export interface CritiqueDashboard {
  critique: CritiqueSummary;
  packetPath: string;
  launchPath: string;
  lastLaunchAt: string | null;
  counts: {
    runs: number;
    findings: number;
    openFindings: number;
    acceptedFindings: number;
    followupTickets: number;
    bySeverity: Record<CritiqueFindingSeverity, number>;
    byStatus: Record<CritiqueFindingStatus, number>;
    byVerdict: Record<CritiqueVerdict, number>;
  };
  latestRun: CritiqueRunRecord | null;
  openFindings: Array<
    Pick<
      CritiqueFindingRecord,
      "id" | "kind" | "severity" | "confidence" | "title" | "status" | "linkedTicketId" | "updatedAt"
    >
  >;
  followupTicketIds: string[];
}

export interface CritiqueReadResult {
  state: CritiqueState;
  summary: CritiqueSummary;
  packet: string;
  critique: string;
  runs: CritiqueRunRecord[];
  findings: CritiqueFindingRecord[];
  dashboard: CritiqueDashboard;
  launch: CritiqueLaunchDescriptor | null;
}

export interface CritiqueListFilter {
  status?: CritiqueStatus;
  verdict?: CritiqueVerdict;
  targetKind?: CritiqueTargetKind;
  focusArea?: CritiqueFocusArea;
  text?: string;
}

export interface CreateCritiqueInput {
  title: string;
  target: CritiqueTargetRef;
  focusAreas?: CritiqueFocusArea[];
  reviewQuestion?: string;
  scopePaths?: string[];
  nonGoals?: string[];
  contextRefs?: Partial<CritiqueContextRefs>;
  freshContextRequired?: boolean;
}

export interface UpdateCritiqueInput {
  title?: string;
  status?: CritiqueStatus;
  target?: CritiqueTargetRef;
  focusAreas?: CritiqueFocusArea[];
  reviewQuestion?: string;
  scopePaths?: string[];
  nonGoals?: string[];
  contextRefs?: Partial<CritiqueContextRefs>;
  freshContextRequired?: boolean;
  verdict?: CritiqueVerdict;
}

export interface CreateCritiqueRunInput {
  kind: CritiqueRunKind;
  summary: string;
  verdict: CritiqueVerdict;
  freshContext?: boolean;
  focusAreas?: CritiqueFocusArea[];
  findingIds?: string[];
  followupTicketIds?: string[];
}

export interface CreateCritiqueFindingInput {
  runId: string;
  kind: CritiqueFindingKind;
  severity: CritiqueFindingSeverity;
  confidence?: CritiqueFindingConfidence;
  title: string;
  summary: string;
  evidence?: string[];
  scopePaths?: string[];
  recommendedAction: string;
  status?: CritiqueFindingStatus;
}

export interface UpdateCritiqueFindingInput {
  id: string;
  status?: CritiqueFindingStatus;
  linkedTicketId?: string | null;
  resolutionNotes?: string | null;
  recommendedAction?: string;
}

export interface TicketifyCritiqueFindingInput {
  findingId: string;
  title?: string;
}
