import type { RoadmapItemHorizon, RoadmapItemStatus } from "#constitution/domain/models.js";
import type { SpecChangeSummary, SpecStatus } from "#specs/domain/models.js";
import type { LoomListSort } from "#storage/list-search.js";
import type { TicketStatus, TicketSummary } from "#ticketing/domain/models.js";

export interface InitiativeRoadmapLink {
  id: string;
  title: string;
  status: RoadmapItemStatus;
  horizon: RoadmapItemHorizon;
  summary: string;
  updatedAt: string;
}

export const INITIATIVE_STATUSES = ["proposed", "active", "paused", "completed", "archived", "superseded"] as const;
export const INITIATIVE_DECISION_KINDS = ["clarification", "decision", "status"] as const;
export const INITIATIVE_MILESTONE_STATUSES = ["planned", "in_progress", "blocked", "completed"] as const;
export const INITIATIVE_MILESTONE_HEALTH = ["pending", "active", "at_risk", "complete"] as const;

export type InitiativeStatus = (typeof INITIATIVE_STATUSES)[number];
export type InitiativeDecisionKind = (typeof INITIATIVE_DECISION_KINDS)[number];
export type InitiativeMilestoneStatus = (typeof INITIATIVE_MILESTONE_STATUSES)[number];
export type InitiativeMilestoneHealth = (typeof INITIATIVE_MILESTONE_HEALTH)[number];

export interface InitiativeMilestone {
  id: string;
  title: string;
  status: InitiativeMilestoneStatus;
  description: string;
  specChangeIds: string[];
  ticketIds: string[];
}

export interface InitiativeState {
  initiativeId: string;
  title: string;
  status: InitiativeStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  archivedAt: string | null;
  objective: string;
  outcomes: string[];
  scope: string[];
  nonGoals: string[];
  successMetrics: string[];
  milestones: InitiativeMilestone[];
  risks: string[];
  statusSummary: string;
  targetWindow: string | null;
  owners: string[];
  tags: string[];
  researchIds: string[];
  specChangeIds: string[];
  ticketIds: string[];
  capabilityIds: string[];
  supersedes: string[];
  roadmapRefs: string[];
}

export interface InitiativeDecisionRecord {
  id: string;
  initiativeId: string;
  createdAt: string;
  kind: InitiativeDecisionKind;
  question: string;
  answer: string;
}

export interface InitiativeSummary {
  id: string;
  title: string;
  status: InitiativeStatus;
  milestoneCount: number;
  specChangeCount: number;
  ticketCount: number;
  updatedAt: string;
  tags: string[];
  ref: string;
}

export interface InitiativeDashboardMilestone {
  id: string;
  title: string;
  status: InitiativeMilestoneStatus;
  health: InitiativeMilestoneHealth;
  description: string;
  specChangeIds: string[];
  ticketIds: string[];
  linkedOpenTicketCount: number;
  linkedCompletedTicketCount: number;
}

export interface InitiativeDashboard {
  initiative: {
    id: string;
    title: string;
    status: InitiativeStatus;
    objective: string;
    statusSummary: string;
    targetWindow: string | null;
    owners: string[];
    tags: string[];
    capabilityIds: string[];
    roadmapRefs: string[];
    updatedAt: string;
  };
  linkedRoadmap: {
    total: number;
    items: InitiativeRoadmapLink[];
  };
  linkedResearch: {
    total: number;
    items: Array<{
      id: string;
      title: string;
      status: string;
      updatedAt: string;
      ref: string;
    }>;
  };
  linkedSpecs: {
    total: number;
    counts: Record<SpecStatus, number>;
    items: SpecChangeSummary[];
  };
  linkedTickets: {
    total: number;
    counts: Record<TicketStatus, number>;
    ready: number;
    blocked: number;
    inProgress: number;
    review: number;
    closed: number;
    items: TicketSummary[];
  };
  milestones: InitiativeDashboardMilestone[];
  openRisks: string[];
  unlinkedReferences: {
    roadmapRefs: string[];
    specChangeIds: string[];
    ticketIds: string[];
  };
}

export interface InitiativeRecord {
  state: InitiativeState;
  summary: InitiativeSummary;
  brief: string;
  decisions: InitiativeDecisionRecord[];
  dashboard: InitiativeDashboard;
}

export interface InitiativeListFilter {
  status?: InitiativeStatus;
  includeArchived?: boolean;
  sort?: LoomListSort;
  text?: string;
  tag?: string;
}

export interface InitiativeMilestoneInput {
  id?: string;
  title: string;
  status?: InitiativeMilestoneStatus;
  description?: string;
  specChangeIds?: string[];
  ticketIds?: string[];
}

export interface CreateInitiativeInput {
  initiativeId?: string;
  title: string;
  objective?: string;
  outcomes?: string[];
  scope?: string[];
  nonGoals?: string[];
  successMetrics?: string[];
  risks?: string[];
  statusSummary?: string;
  targetWindow?: string | null;
  owners?: string[];
  tags?: string[];
  researchIds?: string[];
  specChangeIds?: string[];
  ticketIds?: string[];
  capabilityIds?: string[];
  supersedes?: string[];
  roadmapRefs?: string[];
  milestones?: InitiativeMilestoneInput[];
}

export interface UpdateInitiativeInput {
  title?: string;
  status?: InitiativeStatus;
  objective?: string;
  outcomes?: string[];
  scope?: string[];
  nonGoals?: string[];
  successMetrics?: string[];
  risks?: string[];
  statusSummary?: string;
  targetWindow?: string | null;
  owners?: string[];
  tags?: string[];
  researchIds?: string[];
  specChangeIds?: string[];
  ticketIds?: string[];
  capabilityIds?: string[];
  supersedes?: string[];
  roadmapRefs?: string[];
}

export interface InitiativeWriteResult {
  action: string;
  initiative: InitiativeRecord;
}
