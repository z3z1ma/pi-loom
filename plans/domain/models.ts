import type { LoomListSort } from "#storage/list-search.js";
import type { LoomPortableRepositoryPath } from "#storage/repository-path.js";
import type { LoomRepositoryQualifier } from "#storage/repository-qualifier.js";
import type {
  TicketBranchMode,
  TicketPriority,
  TicketReviewStatus,
  TicketRisk,
  TicketType,
} from "#ticketing/domain/models.js";

export const PLAN_STATUSES = ["active", "paused", "completed", "archived", "superseded"] as const;
export const PLAN_SOURCE_TARGET_KINDS = ["workspace", "initiative", "spec", "research"] as const;
export const PLAN_PROGRESS_STATUSES = ["done", "pending"] as const;

export type PlanStatus = (typeof PLAN_STATUSES)[number];
export type PlanSourceTargetKind = (typeof PLAN_SOURCE_TARGET_KINDS)[number];
export type PlanProgressStatus = (typeof PLAN_PROGRESS_STATUSES)[number];

export interface PlanContextRefs {
  roadmapItemIds: string[];
  initiativeIds: string[];
  researchIds: string[];
  specChangeIds: string[];
  ticketIds: string[];
  critiqueIds: string[];
  docIds: string[];
}

export interface PlanContextRefsUpdate {
  replace?: Partial<PlanContextRefs>;
  remove?: Partial<PlanContextRefs>;
}

export interface PlanSourceTarget {
  kind: PlanSourceTargetKind;
  ref: string;
}

export interface PlanTicketLink {
  ticketId: string;
  role: string | null;
  order: number;
}

export interface PlanLinkedTicketInput {
  ticketRef?: string;
  title?: string;
  summary?: string;
  context?: string;
  plan?: string;
  notes?: string;
  verification?: string;
  journalSummary?: string;
  priority?: TicketPriority;
  type?: TicketType;
  tags?: string[];
  deps?: string[];
  links?: string[];
  initiativeIds?: string[];
  researchIds?: string[];
  parent?: string | null;
  assignee?: string | null;
  acceptance?: string[];
  labels?: string[];
  risk?: TicketRisk;
  reviewStatus?: TicketReviewStatus;
  externalRefs?: string[];
  branchMode?: TicketBranchMode;
  branchFamily?: string | null;
  exactBranchName?: string | null;
  role?: string | null;
  order?: number;
}

export interface PlanDiscoveryRecord {
  note: string;
  evidence: string;
}

export interface PlanDecisionRecord {
  decision: string;
  rationale: string;
  date: string;
  author: string;
}

export interface PlanProgressRecord {
  timestamp: string;
  status: PlanProgressStatus;
  text: string;
}

export interface PlanRevisionRecord {
  timestamp: string;
  change: string;
  reason: string;
}

export interface PlanState {
  planId: string;
  title: string;
  status: PlanStatus;
  createdAt: string;
  updatedAt: string;
  summary: string;
  purpose: string;
  contextAndOrientation: string;
  milestones: string;
  planOfWork: string;
  concreteSteps: string;
  validation: string;
  idempotenceAndRecovery: string;
  artifactsAndNotes: string;
  interfacesAndDependencies: string;
  risksAndQuestions: string;
  outcomesAndRetrospective: string;
  scopePaths: LoomPortableRepositoryPath[];
  sourceTarget: PlanSourceTarget;
  contextRefs: PlanContextRefs;
  linkedTickets: PlanTicketLink[];
  progress: PlanProgressRecord[];
  discoveries: PlanDiscoveryRecord[];
  decisions: PlanDecisionRecord[];
  revisionNotes: PlanRevisionRecord[];
  packetSummary: string;
}

export interface PlanSummary {
  id: string;
  title: string;
  status: PlanStatus;
  updatedAt: string;
  repository?: LoomRepositoryQualifier | null;
  sourceKind: PlanSourceTargetKind;
  sourceRef: string;
  linkedTicketCount: number;
  summary: string;
  ref: string;
}

export interface PlanOverviewTicket {
  ticketId: string;
  role: string | null;
  order: number;
  status: string;
  title: string;
  ref: string;
}

export interface PlanOverview {
  plan: PlanSummary;
  packetRef: string;
  planRef: string;
  sourceTarget: PlanSourceTarget;
  contextRefs: PlanContextRefs;
  scopePaths: LoomPortableRepositoryPath[];
  linkedTickets: PlanOverviewTicket[];
  counts: {
    tickets: number;
    byStatus: Record<string, number>;
  };
}

export interface PlanReadResult {
  state: PlanState;
  summary: PlanSummary;
  packet: string;
  plan: string;
  overview: PlanOverview;
}

export interface PlanListFilter {
  status?: PlanStatus;
  repositoryId?: string;
  sourceKind?: PlanSourceTargetKind;
  sort?: LoomListSort;
  text?: string;
  linkedTicketId?: string;
}

export interface CreatePlanInput {
  title: string;
  summary?: string;
  purpose?: string;
  contextAndOrientation?: string;
  milestones?: string;
  planOfWork?: string;
  concreteSteps?: string;
  validation?: string;
  idempotenceAndRecovery?: string;
  artifactsAndNotes?: string;
  interfacesAndDependencies?: string;
  risksAndQuestions?: string;
  outcomesAndRetrospective?: string;
  scopePaths?: string[];
  sourceTarget: PlanSourceTarget;
  contextRefs?: Partial<PlanContextRefs>;
  progress?: PlanProgressRecord[];
  discoveries?: PlanDiscoveryRecord[];
  decisions?: PlanDecisionRecord[];
  revisionNotes?: PlanRevisionRecord[];
}

export interface UpdatePlanInput {
  title?: string;
  status?: PlanStatus;
  summary?: string;
  purpose?: string;
  contextAndOrientation?: string;
  milestones?: string;
  planOfWork?: string;
  concreteSteps?: string;
  validation?: string;
  idempotenceAndRecovery?: string;
  artifactsAndNotes?: string;
  interfacesAndDependencies?: string;
  risksAndQuestions?: string;
  outcomesAndRetrospective?: string;
  scopePaths?: string[];
  sourceTarget?: PlanSourceTarget;
  contextRefs?: PlanContextRefsUpdate;
  progress?: PlanProgressRecord[];
  discoveries?: PlanDiscoveryRecord[];
  decisions?: PlanDecisionRecord[];
  revisionNotes?: PlanRevisionRecord[];
}

export interface LinkPlanTicketInput {
  ticketId: string;
  role?: string | null;
  order?: number;
}
