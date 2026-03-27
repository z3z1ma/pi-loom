import type { LoomRepositoryQualifier } from "#storage/repository-qualifier.js";
import type {
  DocumentationGovernanceSurface,
  DocumentationOverview,
  DocumentationRevisionRecord,
  DocumentationState,
  DocumentationSummary,
} from "./models.js";

export function getDocumentationRef(state: DocumentationState): string {
  return `documentation:${state.docId}`;
}

export function getDocumentationPacketRef(state: DocumentationState): string {
  return `${getDocumentationRef(state)}:packet`;
}

export function getDocumentationDocumentRef(state: DocumentationState): string {
  return `${getDocumentationRef(state)}:document`;
}

export function summarizeDocumentation(
  state: DocumentationState,
  revisionCount: number,
  governance: DocumentationGovernanceSurface,
  repository: LoomRepositoryQualifier | null = null,
): DocumentationSummary {
  return {
    id: state.docId,
    title: state.title,
    status: state.status,
    docType: state.docType,
    sectionGroup: state.sectionGroup,
    topicId: state.topicId,
    topicRole: state.topicRole,
    updatedAt: state.updatedAt,
    repository,
    sourceKind: state.sourceTarget.kind,
    sourceRef: state.sourceTarget.ref,
    summary: state.summary,
    upstreamPath: state.upstreamPath,
    verifiedAt: state.verifiedAt,
    successorDocId: state.successorDocId,
    revisionCount,
    ref: getDocumentationRef(state),
    governance,
  };
}

export function buildDocumentationOverview(
  state: DocumentationState,
  revisions: DocumentationRevisionRecord[],
  governance: DocumentationGovernanceSurface,
  repository: LoomRepositoryQualifier | null = null,
): DocumentationOverview {
  return {
    doc: summarizeDocumentation(state, revisions.length, governance, repository),
    packetRef: getDocumentationPacketRef(state),
    documentRef: getDocumentationDocumentRef(state),
    revisionCount: revisions.length,
    lastRevision: revisions.at(-1) ?? null,
    topicId: state.topicId,
    topicRole: state.topicRole,
    audience: [...state.audience],
    guideTopics: [...state.guideTopics],
    linkedOutputPaths: [...state.linkedOutputPaths],
    verifiedAt: state.verifiedAt,
    verificationSource: state.verificationSource,
    successorDocId: state.successorDocId,
    retirementReason: state.retirementReason,
    contextRefs: { ...state.contextRefs },
    scopePaths: [...state.scopePaths],
    governance,
  };
}
