export const DOC_STATUSES = ["active", "archived", "superseded"] as const;
export const DOC_TYPES = ["overview", "guide", "concept", "operations", "workflow", "faq"] as const;
export const DOC_SECTION_GROUPS = ["overviews", "guides", "concepts", "operations"] as const;
export const DOC_AUDIENCES = ["ai", "human"] as const;
export const DOC_SOURCE_TARGET_KINDS = ["initiative", "spec", "ticket", "critique", "workspace"] as const;

export type DocStatus = (typeof DOC_STATUSES)[number];
export type DocType = (typeof DOC_TYPES)[number];
export type DocSectionGroup = (typeof DOC_SECTION_GROUPS)[number];
export type DocAudience = (typeof DOC_AUDIENCES)[number];
export type DocSourceTargetKind = (typeof DOC_SOURCE_TARGET_KINDS)[number];

export interface DocsContextRefs {
  roadmapItemIds: string[];
  initiativeIds: string[];
  researchIds: string[];
  specChangeIds: string[];
  ticketIds: string[];
  critiqueIds: string[];
}

export interface DocSourceTarget {
  kind: DocSourceTargetKind;
  ref: string;
}

export interface DocumentationState {
  docId: string;
  title: string;
  status: DocStatus;
  docType: DocType;
  sectionGroup: DocSectionGroup;
  createdAt: string;
  updatedAt: string;
  summary: string;
  audience: DocAudience[];
  scopePaths: string[];
  contextRefs: DocsContextRefs;
  sourceTarget: DocSourceTarget;
  updateReason: string;
  guideTopics: string[];
  linkedOutputPaths: string[];
  lastRevisionId: string | null;
}

export interface DocumentationSummary {
  id: string;
  title: string;
  status: DocStatus;
  docType: DocType;
  sectionGroup: DocSectionGroup;
  updatedAt: string;
  sourceKind: DocSourceTargetKind;
  sourceRef: string;
  summary: string;
  revisionCount: number;
  path: string;
}

export interface DocumentationRevisionRecord {
  id: string;
  docId: string;
  createdAt: string;
  reason: string;
  summary: string;
  sourceTarget: DocSourceTarget;
  packetHash: string;
  changedSections: string[];
  linkedContextRefs: DocsContextRefs;
}

export interface DocumentationDashboard {
  doc: DocumentationSummary;
  packetPath: string;
  documentPath: string;
  revisionCount: number;
  lastRevision: DocumentationRevisionRecord | null;
  audience: DocAudience[];
  guideTopics: string[];
  linkedOutputPaths: string[];
  contextRefs: DocsContextRefs;
  scopePaths: string[];
}

export interface DocumentationReadResult {
  state: DocumentationState;
  summary: DocumentationSummary;
  packet: string;
  document: string;
  revisions: DocumentationRevisionRecord[];
  dashboard: DocumentationDashboard;
}

export interface DocumentationListFilter {
  status?: DocStatus;
  docType?: DocType;
  sectionGroup?: DocSectionGroup;
  sourceKind?: DocSourceTargetKind;
  topic?: string;
  text?: string;
}

export interface CreateDocumentationInput {
  title: string;
  docType: DocType;
  summary?: string;
  audience?: DocAudience[];
  scopePaths?: string[];
  contextRefs?: Partial<DocsContextRefs>;
  sourceTarget: DocSourceTarget;
  updateReason?: string;
  guideTopics?: string[];
  linkedOutputPaths?: string[];
  document?: string;
}

export interface UpdateDocumentationInput {
  title?: string;
  summary?: string;
  audience?: DocAudience[];
  scopePaths?: string[];
  contextRefs?: Partial<DocsContextRefs>;
  sourceTarget?: DocSourceTarget;
  updateReason?: string;
  guideTopics?: string[];
  linkedOutputPaths?: string[];
  document?: string;
  changedSections?: string[];
}
