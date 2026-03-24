import type { InitiativeSummary } from "#initiatives/extensions/domain/models.js";
import type { SpecChangeSummary, SpecStatus } from "#specs/extensions/domain/models.js";
import type { LoomListSort } from "#storage/list-search.js";
import type { LoomRepositoryQualifier } from "#storage/repository-qualifier.js";
import type { TicketStatus, TicketSummary } from "#ticketing/extensions/domain/models.js";

export const RESEARCH_STATUSES = ["proposed", "active", "paused", "synthesized", "archived", "superseded"] as const;
export const HYPOTHESIS_STATUSES = ["open", "supported", "rejected", "superseded"] as const;
export const HYPOTHESIS_CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export const RESEARCH_ARTIFACT_KINDS = ["note", "experiment", "source", "dataset", "log", "summary"] as const;

export type ResearchStatus = (typeof RESEARCH_STATUSES)[number];
export type ResearchHypothesisStatus = (typeof HYPOTHESIS_STATUSES)[number];
export type HypothesisConfidence = (typeof HYPOTHESIS_CONFIDENCE_LEVELS)[number];
export type ResearchArtifactKind = (typeof RESEARCH_ARTIFACT_KINDS)[number];

export interface ResearchState {
  researchId: string;
  title: string;
  status: ResearchStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  synthesizedAt: string | null;
  question: string;
  objective: string;
  scope: string[];
  nonGoals: string[];
  methodology: string[];
  keywords: string[];
  statusSummary: string;
  conclusions: string[];
  recommendations: string[];
  openQuestions: string[];
  initiativeIds: string[];
  specChangeIds: string[];
  ticketIds: string[];
  capabilityIds: string[];
  artifactIds: string[];
  sourceRefs: string[];
  supersedes: string[];
  tags: string[];
}

export interface ResearchHypothesisRecord {
  id: string;
  researchId: string;
  statement: string;
  status: ResearchHypothesisStatus;
  confidence: HypothesisConfidence;
  evidence: string[];
  results: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ResearchArtifactRecord {
  id: string;
  researchId: string;
  kind: ResearchArtifactKind;
  title: string;
  artifactRef: string;
  createdAt: string;
  summary: string;
  sourceUri: string | null;
  tags: string[];
  linkedHypothesisIds: string[];
}

export interface ResearchSummary {
  id: string;
  title: string;
  status: ResearchStatus;
  repository?: LoomRepositoryQualifier | null;
  hypothesisCount: number;
  artifactCount: number;
  linkedInitiativeCount: number;
  linkedSpecCount: number;
  linkedTicketCount: number;
  updatedAt: string;
  tags: string[];
  ref: string;
}

export interface ResearchUnresolvedReferences {
  initiativeIds: string[];
  specChangeIds: string[];
  ticketIds: string[];
}

export interface ResearchDashboard {
  research: {
    id: string;
    title: string;
    status: ResearchStatus;
    question: string;
    objective: string;
    statusSummary: string;
    keywords: string[];
    tags: string[];
    updatedAt: string;
  };
  hypotheses: {
    total: number;
    counts: Record<ResearchHypothesisStatus, number>;
    confidence: Record<HypothesisConfidence, number>;
    items: ResearchHypothesisRecord[];
  };
  artifacts: {
    total: number;
    counts: Record<ResearchArtifactKind, number>;
    items: ResearchArtifactRecord[];
  };
  linkedInitiatives: {
    total: number;
    items: InitiativeSummary[];
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
  conclusions: string[];
  recommendations: string[];
  openQuestions: string[];
  unresolvedReferences: ResearchUnresolvedReferences;
}

export interface ResearchMapNode {
  id: string;
  kind: "research" | "initiative" | "spec" | "ticket" | "artifact" | "hypothesis";
  title: string;
  status: string | null;
  ref: string | null;
  missing: boolean;
}

export interface ResearchMapEdge {
  from: string;
  to: string;
  relation:
    | "links_initiative"
    | "links_spec"
    | "links_ticket"
    | "contains_artifact"
    | "tracks_hypothesis"
    | "supports_hypothesis";
}

export interface ResearchMap {
  researchId: string;
  nodes: Record<string, ResearchMapNode>;
  edges: ResearchMapEdge[];
  generatedAt: string;
}

export interface ResearchRecord {
  state: ResearchState;
  summary: ResearchSummary;
  synthesis: string;
  hypotheses: ResearchHypothesisRecord[];
  hypothesisHistory: ResearchHypothesisRecord[];
  artifacts: ResearchArtifactRecord[];
  dashboard: ResearchDashboard;
  map: ResearchMap;
}

export interface ResearchListFilter {
  status?: ResearchStatus;
  repositoryId?: string;
  includeArchived?: boolean;
  sort?: LoomListSort;
  text?: string;
  tag?: string;
  keyword?: string;
}

export interface CreateResearchInput {
  researchId?: string;
  title: string;
  question?: string;
  objective?: string;
  scope?: string[];
  nonGoals?: string[];
  methodology?: string[];
  keywords?: string[];
  statusSummary?: string;
  conclusions?: string[];
  recommendations?: string[];
  openQuestions?: string[];
  initiativeIds?: string[];
  specChangeIds?: string[];
  ticketIds?: string[];
  capabilityIds?: string[];
  sourceRefs?: string[];
  supersedes?: string[];
  tags?: string[];
}

export interface UpdateResearchInput {
  title?: string;
  status?: ResearchStatus;
  question?: string;
  objective?: string;
  scope?: string[];
  nonGoals?: string[];
  methodology?: string[];
  keywords?: string[];
  statusSummary?: string;
  conclusions?: string[];
  recommendations?: string[];
  openQuestions?: string[];
  initiativeIds?: string[];
  specChangeIds?: string[];
  ticketIds?: string[];
  capabilityIds?: string[];
  sourceRefs?: string[];
  supersedes?: string[];
  tags?: string[];
}

export interface ResearchHypothesisInput {
  id?: string;
  statement: string;
  status?: ResearchHypothesisStatus;
  confidence?: HypothesisConfidence;
  evidence?: string[];
  results?: string[];
}

export interface ResearchArtifactInput {
  id?: string;
  kind: ResearchArtifactKind;
  title: string;
  summary?: string;
  body?: string;
  sourceUri?: string | null;
  tags?: string[];
  linkedHypothesisIds?: string[];
}

export interface ResearchWriteResult {
  action: string;
  research: ResearchRecord;
}
