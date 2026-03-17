import { join, resolve } from "node:path";
import type { DocSectionGroup, DocType } from "./models.js";
import { normalizeDocId, sectionGroupForDocType } from "./normalize.js";

export interface DocumentationPaths {
  rootDir: string;
  loomDir: string;
  docsDir: string;
  overviewsDir: string;
  guidesDir: string;
  conceptsDir: string;
  operationsDir: string;
}

export function getDocumentationPaths(cwd: string): DocumentationPaths {
  const rootDir = resolve(cwd);
  const loomDir = join(rootDir, ".loom");
  const docsDir = join(loomDir, "docs");
  return {
    rootDir,
    loomDir,
    docsDir,
    overviewsDir: join(docsDir, "overviews"),
    guidesDir: join(docsDir, "guides"),
    conceptsDir: join(docsDir, "concepts"),
    operationsDir: join(docsDir, "operations"),
  };
}

export function getDocumentationSectionDir(cwd: string, sectionGroup: DocSectionGroup): string {
  return join(getDocumentationPaths(cwd).docsDir, sectionGroup);
}

export function getDocumentationDir(cwd: string, sectionGroup: DocSectionGroup, docId: string): string {
  return join(getDocumentationSectionDir(cwd, sectionGroup), normalizeDocId(docId));
}

export function getDocumentationDirForType(cwd: string, docType: DocType, docId: string): string {
  return getDocumentationDir(cwd, sectionGroupForDocType(docType), docId);
}

export function getDocumentationStatePath(cwd: string, sectionGroup: DocSectionGroup, docId: string): string {
  return join(getDocumentationDir(cwd, sectionGroup, docId), "state.json");
}

export function getDocumentationPacketPath(cwd: string, sectionGroup: DocSectionGroup, docId: string): string {
  return join(getDocumentationDir(cwd, sectionGroup, docId), "packet.md");
}

export function getDocumentationMarkdownPath(cwd: string, sectionGroup: DocSectionGroup, docId: string): string {
  return join(getDocumentationDir(cwd, sectionGroup, docId), "doc.md");
}

export function getDocumentationRevisionsPath(cwd: string, sectionGroup: DocSectionGroup, docId: string): string {
  return join(getDocumentationDir(cwd, sectionGroup, docId), "revisions.jsonl");
}
