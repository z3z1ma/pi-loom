export const SPEC_STATUSES = [
  "proposed",
  "clarifying",
  "planned",
  "tasked",
  "finalized",
  "archived",
  "superseded",
] as const;
export const SPEC_ARTIFACT_NAMES = ["proposal", "design", "tasks", "analysis", "checklist"] as const;
export const SPEC_DECISION_KINDS = ["clarification", "decision"] as const;
export const SPEC_ANALYSIS_SEVERITIES = ["info", "warning", "error"] as const;

export type SpecStatus = (typeof SPEC_STATUSES)[number];
export type SpecArtifactName = (typeof SPEC_ARTIFACT_NAMES)[number];
export type SpecDecisionKind = (typeof SPEC_DECISION_KINDS)[number];
export type SpecAnalysisSeverity = (typeof SPEC_ANALYSIS_SEVERITIES)[number];

export type SpecArtifactVersions = Record<SpecArtifactName, string | null>;

export interface SpecRequirementRecord {
  id: string;
  text: string;
  acceptance: string[];
  capabilities: string[];
}

export interface SpecCapabilityRecord {
  id: string;
  title: string;
  summary: string;
  requirements: string[];
  scenarios: string[];
}

export interface SpecTaskRecord {
  id: string;
  title: string;
  summary: string;
  deps: string[];
  requirements: string[];
  capabilities: string[];
  acceptance: string[];
}

export interface SpecChangeState {
  changeId: string;
  title: string;
  status: SpecStatus;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
  archivedAt: string | null;
  /** Stable non-filesystem archive identifier. */
  archivedRef: string | null;
  initiativeIds: string[];
  researchIds: string[];
  supersedes: string[];
  proposalSummary: string;
  designNotes: string;
  requirements: SpecRequirementRecord[];
  capabilities: SpecCapabilityRecord[];
  tasks: SpecTaskRecord[];
  artifactVersions: SpecArtifactVersions;
}

export interface SpecDecisionRecord {
  id: string;
  changeId: string;
  createdAt: string;
  kind: SpecDecisionKind;
  question: string;
  answer: string;
}

export interface SpecArtifactStatus {
  name: SpecArtifactName;
  exists: boolean;
  /** Stable non-filesystem artifact identifier. */
  ref: string;
  updatedAt: string | null;
}

export interface SpecLinkedTicketEntry {
  taskId: string;
  ticketId: string;
  signature: string;
  capabilityIds: string[];
  requirementIds: string[];
  dependencyTaskIds: string[];
}

export interface SpecLinkedTicketsState {
  /** Stable non-filesystem spec identifier for the linked ticket snapshot. */
  changeRef: string;
  ensuredAt: string;
  mode: "initial" | "updated";
  capabilityIds: string[];
  links: SpecLinkedTicketEntry[];
}

export interface SpecChangeSummary {
  id: string;
  title: string;
  status: SpecStatus;
  requirementCount: number;
  taskCount: number;
  capabilityIds: string[];
  initiativeIds: string[];
  researchIds: string[];
  updatedAt: string;
  archived: boolean;
  /** Stable non-filesystem spec identifier. */
  ref: string;
}

export interface CanonicalCapabilityRecord {
  id: string;
  title: string;
  summary: string;
  requirements: string[];
  scenarios: string[];
  sourceChanges: string[];
  updatedAt: string;
  /** Stable non-filesystem capability identifier. */
  ref: string;
}

export interface SpecChangeRecord {
  state: SpecChangeState;
  summary: SpecChangeSummary;
  artifacts: SpecArtifactStatus[];
  proposal: string;
  design: string;
  tasksMarkdown: string;
  analysis: string;
  checklist: string;
  decisions: SpecDecisionRecord[];
  capabilitySpecs: CanonicalCapabilityRecord[];
  linkedTickets: SpecLinkedTicketsState | null;
}

export interface SpecAnalysisFinding {
  id: string;
  severity: SpecAnalysisSeverity;
  blocking: boolean;
  artifact: SpecArtifactName | "change" | "capability" | "tickets";
  message: string;
}

export interface SpecAnalysisResult {
  changeId: string;
  generatedAt: string;
  readyToFinalize: boolean;
  findings: SpecAnalysisFinding[];
}

export interface SpecChecklistItem {
  id: string;
  title: string;
  passed: boolean;
  detail: string;
}

export interface SpecChecklistResult {
  changeId: string;
  generatedAt: string;
  passed: boolean;
  items: SpecChecklistItem[];
}

export interface SpecListFilter {
  status?: SpecStatus;
  includeArchived?: boolean;
  text?: string;
}

export interface CreateSpecChangeInput {
  changeId?: string;
  title: string;
  summary?: string;
  initiativeIds?: string[];
  researchIds?: string[];
}

export interface SpecPlanCapabilityInput {
  id?: string;
  title: string;
  summary?: string;
  requirements?: string[];
  acceptance?: string[];
  scenarios?: string[];
}

export interface SpecPlanInput {
  designNotes?: string;
  supersedes?: string[];
  capabilities: SpecPlanCapabilityInput[];
}

export interface SpecTaskInput {
  id?: string;
  title: string;
  summary?: string;
  deps?: string[];
  requirements?: string[];
  capabilities?: string[];
  acceptance?: string[];
}

export interface SpecTasksInput {
  replace?: boolean;
  tasks: SpecTaskInput[];
}

export interface SpecWriteResult {
  action: string;
  change: SpecChangeRecord;
}
