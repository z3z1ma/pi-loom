import { readFileSync } from "node:fs";
import {
  createWorkspaceProjectionDocument,
  createWorkspaceProjectionManifest,
  type WorkspaceProjectionDocument,
} from "#storage/projection-documents.js";
import {
  type LoomProjectionSelectionInput,
  normalizeProjectionSelection,
  projectionEntryMatchesSelection,
} from "#storage/projection-selection.js";
import {
  assessProjectionFileState,
  ensureProjectionWorkspace,
  type LoomProjectionManifest,
  type LoomProjectionWriteResult,
  readProjectionManifest,
  resolveProjectionFilePath,
  writeProjectionFile,
  writeProjectionManifest,
} from "#storage/projections.js";
import { renderPortableRepositoryPathList } from "#storage/repository-path.js";
import { parseMarkdownArtifact, serializeMarkdownArtifact } from "./frontmatter.js";
import type { DocumentationReadResult, UpdateDocumentationInput } from "./models.js";
import { normalizeAudience } from "./normalize.js";
import { createDocumentationStore } from "./store.js";

const DOCS_FAMILY = "docs" as const;

function readFrontmatterString(value: string | string[] | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function readFrontmatterStringList(value: string | string[] | null | undefined): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => entry.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  return [];
}

function docsProjectionSemanticInput(result: DocumentationReadResult): Record<string, unknown> {
  const currentDocument = parseMarkdownArtifact(result.document, `${result.state.docId}.md`).body;
  return {
    title: result.state.title,
    status: result.state.status,
    docType: result.state.docType,
    sectionGroup: result.state.sectionGroup,
    audience: result.state.audience,
    sourceTarget: result.state.sourceTarget,
    guideTopics: result.state.guideTopics,
    linkedOutputPaths: renderPortableRepositoryPathList(result.state.linkedOutputPaths),
    upstreamPath: result.state.upstreamPath,
    document: currentDocument,
  };
}

export function buildDocumentationProjection(result: DocumentationReadResult): WorkspaceProjectionDocument {
  const documentBody = parseMarkdownArtifact(result.document, `${result.state.docId}.md`).body;
  const renderedContent = serializeMarkdownArtifact(
    {
      id: result.state.docId,
      title: result.state.title,
      status: result.state.status,
      type: result.state.docType,
      section: result.state.sectionGroup,
      audience: result.state.audience,
      source: `${result.state.sourceTarget.kind}:${result.state.sourceTarget.ref}`,
      topics: result.state.guideTopics,
      outputs: renderPortableRepositoryPathList(result.state.linkedOutputPaths),
      "upstream-path": result.state.upstreamPath,
    },
    documentBody,
  );

  return createWorkspaceProjectionDocument({
    family: "docs",
    canonicalRef: `doc:${result.state.docId}`,
    relativePath: `${result.state.sectionGroup}/${result.state.docId}.md`,
    renderedContent,
    semanticInput: docsProjectionSemanticInput(result),
    editability: { mode: "full" },
  });
}

export function createDocumentationProjectionManifest(
  docs: readonly DocumentationReadResult[],
): LoomProjectionManifest {
  return createWorkspaceProjectionManifest(
    DOCS_FAMILY,
    docs.map((doc) => buildDocumentationProjection(doc)),
  );
}

export interface DocumentationProjectionFileResult {
  path: string;
  write: LoomProjectionWriteResult;
  document: DocumentationReadResult;
}

export interface DocumentationProjectionExportResult {
  manifest: LoomProjectionManifest;
  files: DocumentationProjectionFileResult[];
  documents: DocumentationReadResult[];
}

async function loadDocumentationProjectionRecords(cwd: string): Promise<DocumentationReadResult[]> {
  const store = createDocumentationStore(cwd);
  const summaries = await store.listDocs();
  const records = await Promise.all(summaries.map((summary) => store.readDoc(summary.id)));
  return records.sort((left, right) => left.state.docId.localeCompare(right.state.docId));
}

export async function exportDocumentationProjections(cwd: string): Promise<DocumentationProjectionExportResult> {
  ensureProjectionWorkspace(cwd, { enabledFamilies: [DOCS_FAMILY] });
  const documents = await loadDocumentationProjectionRecords(cwd);
  const manifest = createDocumentationProjectionManifest(documents);
  const files = documents.map((document) => {
    const projection = buildDocumentationProjection(document);
    const path = resolveProjectionFilePath(cwd, DOCS_FAMILY, projection.relativePath);
    return {
      path,
      write: writeProjectionFile(path, projection.renderedContent),
      document,
    };
  });
  writeProjectionManifest(resolveProjectionFilePath(cwd, DOCS_FAMILY, "manifest.json"), manifest);
  return { manifest, files, documents };
}

export function reconcileDocumentationProjection(
  current: DocumentationReadResult,
  markdown: string,
): UpdateDocumentationInput {
  const relativePath = `${current.state.sectionGroup}/${current.state.docId}.md`;
  const parsed = parseMarkdownArtifact(markdown, relativePath);

  const title = readFrontmatterString(parsed.frontmatter.title) ?? current.state.title;
  const audience = readFrontmatterStringList(parsed.frontmatter.audience);
  const guideTopics = readFrontmatterStringList(parsed.frontmatter.topics);
  const linkedOutputPaths = readFrontmatterStringList(parsed.frontmatter.outputs);
  const upstreamPathValue = parsed.frontmatter["upstream-path"];

  return {
    title,
    audience: audience ? normalizeAudience(audience) : current.state.audience,
    guideTopics: guideTopics ?? current.state.guideTopics,
    linkedOutputPaths: linkedOutputPaths ?? renderPortableRepositoryPathList(current.state.linkedOutputPaths),
    upstreamPath:
      upstreamPathValue === undefined
        ? (current.state.upstreamPath ?? undefined)
        : upstreamPathValue === null
          ? ""
          : typeof upstreamPathValue === "string"
            ? upstreamPathValue
            : "",
    document: parsed.body,
  };
}

export async function reconcileDocumentationProjections(
  cwd: string,
  selectionInput: LoomProjectionSelectionInput = {},
): Promise<DocumentationReadResult[]> {
  const store = createDocumentationStore(cwd);
  const documents = await loadDocumentationProjectionRecords(cwd);
  const selection = normalizeProjectionSelection(selectionInput);
  const manifest = readProjectionManifest(resolveProjectionFilePath(cwd, DOCS_FAMILY, "manifest.json"));
  if (!manifest) {
    throw new Error("Projection family docs has no manifest. Export it before reconciling.");
  }
  const manifestEntriesByPath = new Map(manifest.entries.map((entry) => [entry.relativePath, entry]));
  const updated: DocumentationReadResult[] = [];
  let matchedSelection = false;

  for (const document of documents) {
    const projection = buildDocumentationProjection(document);
    if (!projectionEntryMatchesSelection(DOCS_FAMILY, projection.manifestEntry, selection)) {
      continue;
    }
    matchedSelection = true;
    const manifestEntry = manifestEntriesByPath.get(projection.relativePath);
    if (!manifestEntry) {
      throw new Error(`Projection docs/${projection.relativePath} is not exported. Refresh it before reconciling.`);
    }
    const state = assessProjectionFileState(cwd, DOCS_FAMILY, manifestEntry);
    if (state.kind === "missing") {
      throw new Error(`Projection docs/${projection.relativePath} is missing. Refresh it before reconciling.`);
    }
    if (state.kind !== "modified") {
      continue;
    }
    if (
      manifestEntry.revisionToken !== projection.manifestEntry.revisionToken ||
      manifestEntry.baseVersion !== projection.manifestEntry.baseVersion
    ) {
      throw new Error(`Projection docs/${projection.relativePath} is stale. Refresh it before reconciling.`);
    }
    updated.push(
      await store.updateDoc(
        document.state.docId,
        reconcileDocumentationProjection(document, readFileSync(state.absolutePath, "utf-8")),
      ),
    );
  }

  if (selection.hasSelection && !matchedSelection) {
    throw new Error("No documentation projections matched the requested selection.");
  }

  return updated;
}
