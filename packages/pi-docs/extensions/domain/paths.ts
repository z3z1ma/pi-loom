import { resolve } from "node:path";
import type { DocSectionGroup, DocType } from "./models.js";
import { normalizeDocId, sectionGroupForDocType } from "./normalize.js";

export interface DocumentationPaths {
  rootDir: string;
  docsDir: string;
  overviewsDir: string;
  guidesDir: string;
  conceptsDir: string;
  operationsDir: string;
}

export function getDocumentationPaths(cwd: string): DocumentationPaths {
  return {
    rootDir: resolve(cwd),
    docsDir: "documentation",
    overviewsDir: "documentation:overviews",
    guidesDir: "documentation:guides",
    conceptsDir: "documentation:concepts",
    operationsDir: "documentation:operations",
  };
}

export function getDocumentationSectionDir(_cwd: string, sectionGroup: DocSectionGroup): string {
  return `documentation:${sectionGroup}`;
}

export function getDocumentationDir(cwd: string, sectionGroup: DocSectionGroup, docId: string): string {
  return `${getDocumentationSectionDir(cwd, sectionGroup)}:${normalizeDocId(docId)}`;
}

export function getDocumentationDirForType(cwd: string, docType: DocType, docId: string): string {
  return getDocumentationDir(cwd, sectionGroupForDocType(docType), docId);
}

export function getDocumentationStatePath(cwd: string, sectionGroup: DocSectionGroup, docId: string): string {
  return `${getDocumentationDir(cwd, sectionGroup, docId)}:state`;
}

export function getDocumentationPacketPath(cwd: string, sectionGroup: DocSectionGroup, docId: string): string {
  return `${getDocumentationDir(cwd, sectionGroup, docId)}:packet`;
}

export function getDocumentationMarkdownPath(cwd: string, sectionGroup: DocSectionGroup, docId: string): string {
  return `${getDocumentationDir(cwd, sectionGroup, docId)}:document`;
}

export function getDocumentationRevisionsPath(cwd: string, sectionGroup: DocSectionGroup, docId: string): string {
  return `${getDocumentationDir(cwd, sectionGroup, docId)}:revisions`;
}
