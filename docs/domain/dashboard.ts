import type { LoomRepositoryQualifier } from "#storage/repository-qualifier.js";
import type {
  DocumentationDashboard,
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
  repository: LoomRepositoryQualifier | null = null,
): DocumentationSummary {
  return {
    id: state.docId,
    title: state.title,
    status: state.status,
    docType: state.docType,
    sectionGroup: state.sectionGroup,
    updatedAt: state.updatedAt,
    repository,
    sourceKind: state.sourceTarget.kind,
    sourceRef: state.sourceTarget.ref,
    summary: state.summary,
    revisionCount,
    ref: getDocumentationRef(state),
  };
}

export function buildDocumentationDashboard(
  state: DocumentationState,
  revisions: DocumentationRevisionRecord[],
  repository: LoomRepositoryQualifier | null = null,
): DocumentationDashboard {
  return {
    doc: summarizeDocumentation(state, revisions.length, repository),
    packetRef: getDocumentationPacketRef(state),
    documentRef: getDocumentationDocumentRef(state),
    revisionCount: revisions.length,
    lastRevision: revisions.at(-1) ?? null,
    audience: [...state.audience],
    guideTopics: [...state.guideTopics],
    linkedOutputPaths: [...state.linkedOutputPaths],
    contextRefs: { ...state.contextRefs },
    scopePaths: [...state.scopePaths],
  };
}
