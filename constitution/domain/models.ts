export const CONSTITUTION_DECISION_KINDS = [
  "clarification",
  "revision",
  "roadmap_update",
  "principle_update",
  "constraint_update",
] as const;
export const ROADMAP_ITEM_STATUSES = ["candidate", "active", "paused", "completed", "superseded"] as const;
export const ROADMAP_ITEM_HORIZONS = ["now", "next", "later"] as const;

export type ConstitutionDecisionKind = (typeof CONSTITUTION_DECISION_KINDS)[number];
export type RoadmapItemStatus = (typeof ROADMAP_ITEM_STATUSES)[number];
export type RoadmapItemHorizon = (typeof ROADMAP_ITEM_HORIZONS)[number];

export interface ConstitutionalEntry {
  id: string;
  title: string;
  summary: string;
  rationale: string;
}

export interface RoadmapItem {
  id: string;
  title: string;
  status: RoadmapItemStatus;
  horizon: RoadmapItemHorizon;
  summary: string;
  rationale: string;
  initiativeIds: string[];
  researchIds: string[];
  specChangeIds: string[];
  updatedAt: string;
}

export interface ConstitutionalCompleteness {
  vision: boolean;
  principles: boolean;
  constraints: boolean;
  roadmap: boolean;
  brief: boolean;
}

export interface ConstitutionalState {
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  visionSummary: string;
  visionNarrative: string;
  principles: ConstitutionalEntry[];
  constraints: ConstitutionalEntry[];
  roadmapItems: RoadmapItem[];
  roadmapItemIds: string[];
  strategicDirectionSummary: string;
  currentFocus: string[];
  openConstitutionQuestions: string[];
  initiativeIds: string[];
  researchIds: string[];
  specChangeIds: string[];
  completeness: ConstitutionalCompleteness;
}

export interface ConstitutionDecisionRecord {
  id: string;
  createdAt: string;
  kind: ConstitutionDecisionKind;
  question: string;
  answer: string;
  affectedArtifacts: string[];
}

export interface ConstitutionalDashboard {
  project: {
    projectId: string;
    title: string;
    updatedAt: string;
    strategicDirectionSummary: string;
    currentFocus: string[];
  };
  completeness: ConstitutionalCompleteness;
  openConstitutionQuestions: string[];
  principles: Array<Pick<ConstitutionalEntry, "id" | "title">>;
  constraints: Array<Pick<ConstitutionalEntry, "id" | "title">>;
  roadmap: {
    total: number;
    byStatus: Record<RoadmapItemStatus, number>;
    byHorizon: Record<RoadmapItemHorizon, number>;
    activeItemIds: string[];
    items: RoadmapItem[];
  };
  linkedWork: {
    initiativeIds: string[];
    researchIds: string[];
    specChangeIds: string[];
  };
}

export interface ConstitutionalRecord {
  state: ConstitutionalState;
  brief: string;
  vision: string;
  principles: string;
  constraints: string;
  roadmap: string;
  decisions: ConstitutionDecisionRecord[];
  dashboard: ConstitutionalDashboard;
}

export interface InitConstitutionInput {
  projectId?: string;
  title?: string;
}

export interface UpdateVisionInput {
  projectId?: string;
  title?: string;
  visionSummary?: string;
  visionNarrative?: string;
}

export interface ConstitutionalEntryInput {
  id?: string;
  title: string;
  summary: string;
  rationale?: string;
}

export interface UpdateRoadmapInput {
  strategicDirectionSummary?: string;
  currentFocus?: string[];
  openConstitutionQuestions?: string[];
}

export interface RoadmapItemInput {
  id?: string;
  title: string;
  status?: RoadmapItemStatus;
  horizon?: RoadmapItemHorizon;
  summary?: string;
  rationale?: string;
  initiativeIds?: string[];
  researchIds?: string[];
  specChangeIds?: string[];
}

export interface UpdateRoadmapItemInput {
  id: string;
  title?: string;
  status?: RoadmapItemStatus;
  horizon?: RoadmapItemHorizon;
  summary?: string;
  rationale?: string;
  initiativeIds?: string[];
  researchIds?: string[];
  specChangeIds?: string[];
}

export interface RoadmapListFilter {
  status?: RoadmapItemStatus;
  horizon?: RoadmapItemHorizon;
}
