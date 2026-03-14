import { posix } from "node:path";
import type {
  DocumentationDashboard,
  DocumentationRevisionRecord,
  DocumentationState,
  DocumentationSummary,
} from "./models.js";

const DOCS_ROOT_SEGMENT = "/.loom/docs/";

export function toRepoRelativeDocumentationPath(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const docsRootIndex = normalizedPath.lastIndexOf(DOCS_ROOT_SEGMENT);
  if (docsRootIndex >= 0) {
    return normalizedPath.slice(docsRootIndex + 1);
  }
  return normalizedPath.replace(/^\.\//, "");
}

export function getDocumentationPacketRepoPath(state: DocumentationState): string {
  return posix.join(".loom", "docs", state.sectionGroup, state.docId, "packet.md");
}

export function summarizeDocumentation(
  state: DocumentationState,
  path: string,
  revisionCount: number,
): DocumentationSummary {
  return {
    id: state.docId,
    title: state.title,
    status: state.status,
    docType: state.docType,
    sectionGroup: state.sectionGroup,
    updatedAt: state.updatedAt,
    sourceKind: state.sourceTarget.kind,
    sourceRef: state.sourceTarget.ref,
    summary: state.summary,
    revisionCount,
    path: toRepoRelativeDocumentationPath(path),
  };
}

export function buildDocumentationDashboard(
  state: DocumentationState,
  revisions: DocumentationRevisionRecord[],
  packetPath: string,
  documentPath: string,
  path: string,
): DocumentationDashboard {
  return {
    doc: summarizeDocumentation(state, path, revisions.length),
    packetPath: toRepoRelativeDocumentationPath(packetPath),
    documentPath: toRepoRelativeDocumentationPath(documentPath),
    revisionCount: revisions.length,
    lastRevision: revisions.at(-1) ?? null,
    audience: [...state.audience],
    guideTopics: [...state.guideTopics],
    linkedOutputPaths: [...state.linkedOutputPaths],
    contextRefs: { ...state.contextRefs },
    scopePaths: [...state.scopePaths],
  };
}
