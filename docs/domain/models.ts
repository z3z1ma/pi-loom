import type { LoomListSort } from "#storage/list-search.js";
import type { LoomPortableRepositoryPath } from "#storage/repository-path.js";
import type { LoomRepositoryQualifier } from "#storage/repository-qualifier.js";

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
  scopePaths: LoomPortableRepositoryPath[];
  contextRefs: DocsContextRefs;
  sourceTarget: DocSourceTarget;
  updateReason: string;
  guideTopics: string[];
  linkedOutputPaths: LoomPortableRepositoryPath[];
  upstreamPath: string | null;
  lastRevisionId: string | null;
}

export interface DocumentationSummary {
  id: string;
  title: string;
  status: DocStatus;
  docType: DocType;
  sectionGroup: DocSectionGroup;
  updatedAt: string;
  repository: LoomRepositoryQualifier | null;
  sourceKind: DocSourceTargetKind;
  sourceRef: string;
  summary: string;
  upstreamPath: string | null;
  revisionCount: number;
  ref: string;
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
  packetRef: string;
  documentRef: string;
  revisionCount: number;
  lastRevision: DocumentationRevisionRecord | null;
  audience: DocAudience[];
  guideTopics: string[];
  linkedOutputPaths: LoomPortableRepositoryPath[];
  contextRefs: DocsContextRefs;
  scopePaths: LoomPortableRepositoryPath[];
}

export interface DocumentationCanonicalSnapshot {
  state: DocumentationState;
  revisions: DocumentationRevisionRecord[];
  documentBody: string;
}

export interface DocumentationEntityAttributes {
  snapshot: DocumentationCanonicalSnapshot;
}

export interface DocumentationPersistedEventPayload extends Record<string, unknown> {
  change: "documentation_persisted";
  entityKind: "documentation";
  displayId: string;
  version: number;
  status: DocStatus;
  docType: DocType;
  sourceTarget: DocSourceTarget;
  revisionCount: number;
  lastRevisionId: string | null;
}

export interface DocumentationRevisionRecordedEventPayload extends Record<string, unknown> {
  change: "documentation_revision_recorded";
  docId: string;
  revisionId: string;
  revisionCount: number;
  documentUpdated: boolean;
  changedSections: string[];
  sourceTarget: DocSourceTarget;
  linkedContextRefs: DocsContextRefs;
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
  sort?: LoomListSort;
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
  upstreamPath?: string;
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
  upstreamPath?: string;
  document?: string;
  changedSections?: string[];
}
