import type { LoomListSort } from "#storage/list-search.js";
import type { LoomPortableRepositoryPath } from "#storage/repository-path.js";
import type { LoomRepositoryQualifier } from "#storage/repository-qualifier.js";

export const DOC_STATUSES = ["active", "archived", "superseded"] as const;
export const DOC_TYPES = ["overview", "guide", "concept", "operations", "workflow", "faq"] as const;
export const DOC_SECTION_GROUPS = ["overviews", "guides", "concepts", "operations"] as const;
export const DOC_AUDIENCES = ["ai", "human"] as const;
export const DOC_SOURCE_TARGET_KINDS = ["initiative", "spec", "ticket", "critique", "workspace"] as const;
export const DOC_TOPIC_ROLES = ["owner", "companion", "legacy"] as const;
export const DOC_AUDIT_FINDING_KINDS = ["stale", "overlapping", "orphaned", "unverified"] as const;
export const DOC_AUDIT_FINDING_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const DOC_PUBLICATION_STATUSES = [
  "current-owner",
  "current-companion",
  "historical-superseded",
  "historical-archived",
  "legacy-migration-debt",
  "overlapping-owner-debt",
  "governed-without-owner",
] as const;
export const DOC_GOVERNANCE_ACTIONS = [
  "update-current-owner",
  "update-current-companion",
  "follow-successor-or-retirement",
  "keep-archived-history",
  "backfill-topic-metadata",
  "resolve-owner-overlap",
  "publish-topic-owner",
] as const;
export const DOC_GOVERNANCE_RELATIONSHIPS = ["same-topic", "current-owner", "successor", "predecessor"] as const;

export type DocStatus = (typeof DOC_STATUSES)[number];
export type DocType = (typeof DOC_TYPES)[number];
export type DocSectionGroup = (typeof DOC_SECTION_GROUPS)[number];
export type DocAudience = (typeof DOC_AUDIENCES)[number];
export type DocSourceTargetKind = (typeof DOC_SOURCE_TARGET_KINDS)[number];
export type DocTopicRole = (typeof DOC_TOPIC_ROLES)[number];
export type DocumentationAuditFindingKind = (typeof DOC_AUDIT_FINDING_KINDS)[number];
export type DocumentationAuditFindingSeverity = (typeof DOC_AUDIT_FINDING_SEVERITIES)[number];
export type DocPublicationStatus = (typeof DOC_PUBLICATION_STATUSES)[number];
export type DocGovernanceAction = (typeof DOC_GOVERNANCE_ACTIONS)[number];
export type DocGovernanceRelationship = (typeof DOC_GOVERNANCE_RELATIONSHIPS)[number];

export interface DocumentationRelatedDocSummary {
  id: string;
  title: string;
  status: DocStatus;
  docType: DocType;
  topicRole: DocTopicRole;
  updatedAt: string;
  publicationStatus: DocPublicationStatus;
  relationship: DocGovernanceRelationship;
  ref: string;
}

export interface DocumentationGovernanceSurface {
  publicationStatus: DocPublicationStatus;
  publicationSummary: string;
  recommendedAction: DocGovernanceAction;
  currentOwnerDocId: string | null;
  currentOwnerTitle: string | null;
  activeOwnerDocIds: string[];
  successorDocId: string | null;
  successorTitle: string | null;
  predecessorDocIds: string[];
  relatedDocs: DocumentationRelatedDocSummary[];
}

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
  topicId: string | null;
  topicRole: DocTopicRole;
  createdAt: string;
  updatedAt: string;
  summary: string;
  audience: DocAudience[];
  scopePaths: LoomPortableRepositoryPath[];
  contextRefs: DocsContextRefs;
  sourceTarget: DocSourceTarget;
  verifiedAt: string | null;
  verificationSource: string | null;
  successorDocId: string | null;
  retirementReason: string | null;
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
  topicId: string | null;
  topicRole: DocTopicRole;
  updatedAt: string;
  repository: LoomRepositoryQualifier | null;
  sourceKind: DocSourceTargetKind;
  sourceRef: string;
  summary: string;
  upstreamPath: string | null;
  verifiedAt: string | null;
  successorDocId: string | null;
  revisionCount: number;
  ref: string;
  governance: DocumentationGovernanceSurface;
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

export interface DocumentationOverview {
  doc: DocumentationSummary;
  packetRef: string;
  documentRef: string;
  revisionCount: number;
  lastRevision: DocumentationRevisionRecord | null;
  topicId: string | null;
  topicRole: DocTopicRole;
  audience: DocAudience[];
  guideTopics: string[];
  linkedOutputPaths: LoomPortableRepositoryPath[];
  verifiedAt: string | null;
  verificationSource: string | null;
  successorDocId: string | null;
  retirementReason: string | null;
  contextRefs: DocsContextRefs;
  scopePaths: LoomPortableRepositoryPath[];
  governance: DocumentationGovernanceSurface;
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
  topicId: string | null;
  topicRole: DocTopicRole;
  sourceTarget: DocSourceTarget;
  verifiedAt: string | null;
  successorDocId: string | null;
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
  overview: DocumentationOverview;
  governance: DocumentationGovernanceSurface;
}

export interface DocumentationListFilter {
  status?: DocStatus;
  docType?: DocType;
  sectionGroup?: DocSectionGroup;
  sourceKind?: DocSourceTargetKind;
  topic?: string;
  includeSupporting?: boolean;
  includeHistorical?: boolean;
  sort?: LoomListSort;
  text?: string;
}

export interface CreateDocumentationInput {
  title: string;
  docType: DocType;
  summary?: string;
  topicId?: string;
  topicRole?: DocTopicRole;
  audience?: DocAudience[];
  scopePaths?: string[];
  contextRefs?: Partial<DocsContextRefs>;
  sourceTarget: DocSourceTarget;
  verifiedAt?: string;
  verificationSource?: string;
  updateReason?: string;
  successorDocId?: string;
  retirementReason?: string;
  guideTopics?: string[];
  linkedOutputPaths?: string[];
  upstreamPath?: string;
  document?: string;
}

export interface UpdateDocumentationInput {
  title?: string;
  summary?: string;
  topicId?: string;
  topicRole?: DocTopicRole;
  audience?: DocAudience[];
  scopePaths?: string[];
  contextRefs?: Partial<DocsContextRefs>;
  sourceTarget?: DocSourceTarget;
  verifiedAt?: string;
  verificationSource?: string;
  updateReason?: string;
  successorDocId?: string;
  retirementReason?: string;
  guideTopics?: string[];
  linkedOutputPaths?: string[];
  upstreamPath?: string;
  document?: string;
  changedSections?: string[];
}

export interface DocumentationAuditFinding {
  id: string;
  kind: DocumentationAuditFindingKind;
  severity: DocumentationAuditFindingSeverity;
  title: string;
  summary: string;
  docIds: string[];
  scopeRefs: string[];
  evidence: string[];
  recommendedAction: string;
}

export interface DocumentationAuditSubject {
  id: string;
  title: string;
  status: DocStatus;
  docType: DocType;
  topicId: string | null;
  topicRole: DocTopicRole;
  sourceTarget: DocSourceTarget;
  verifiedAt: string | null;
  verificationSource: string | null;
  updatedAt: string;
}

export interface DocumentationAuditCounts {
  docsAudited: number;
  findings: number;
  byKind: Record<DocumentationAuditFindingKind, number>;
  bySeverity: Record<DocumentationAuditFindingSeverity, number>;
}

export interface DocumentationAuditReport {
  generatedAt: string;
  ref: string | null;
  subjects: DocumentationAuditSubject[];
  findings: DocumentationAuditFinding[];
  scopePaths: LoomPortableRepositoryPath[];
  contextRefs: DocsContextRefs;
  counts: DocumentationAuditCounts;
}
