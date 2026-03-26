import { readFileSync } from "node:fs";
import { parseMarkdownBulletList, parseMarkdownSections } from "#storage/markdown-sections.js";
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
import { parseMarkdownArtifact, renderBulletList, renderSection, serializeMarkdownArtifact } from "./frontmatter.js";
import type { ResearchRecord, UpdateResearchInput } from "./models.js";
import { normalizeStringList } from "./normalize.js";
import { renderResearchArtifacts, renderResearchHypotheses } from "./render.js";
import { createResearchStore } from "./store.js";

const RESEARCH_FAMILY = "research" as const;

export const RESEARCH_PROJECTION_EDITABLE_SECTIONS = [
  "Question",
  "Objective",
  "Status Summary",
  "Scope",
  "Non-Goals",
  "Methodology",
  "Keywords",
  "Conclusions",
  "Recommendations",
  "Open Questions",
] as const;

const READ_ONLY_SECTION_NOTE =
  "_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._";

function joinNonEmpty(chunks: string[]): string {
  return chunks.filter(Boolean).join("\n\n");
}

function renderReadOnlySection(title: string, body: string): string {
  return renderSection(title, `${READ_ONLY_SECTION_NOTE}\n\n${body}`);
}

function renderLinkedWork(record: ResearchRecord): string {
  return renderBulletList(
    [
      ...record.state.initiativeIds.map((id) => `initiative:${id}`),
      ...record.state.specChangeIds.map((id) => `spec:${id}`),
      ...record.state.ticketIds.map((id) => `ticket:${id}`),
    ],
    "(none)",
  );
}

function renderResearchProjectionBody(record: ResearchRecord): string {
  return joinNonEmpty([
    renderSection("Question", record.state.question || "(empty)"),
    renderSection("Objective", record.state.objective || "(empty)"),
    renderSection("Status Summary", record.state.statusSummary || "(empty)"),
    renderSection("Scope", renderBulletList(record.state.scope)),
    renderSection("Non-Goals", renderBulletList(record.state.nonGoals)),
    renderSection("Methodology", renderBulletList(record.state.methodology)),
    renderSection("Keywords", renderBulletList(record.state.keywords)),
    renderSection("Conclusions", renderBulletList(record.state.conclusions)),
    renderSection("Recommendations", renderBulletList(record.state.recommendations)),
    renderSection("Open Questions", renderBulletList(record.state.openQuestions)),
    renderReadOnlySection("Linked Work", renderLinkedWork(record)),
    renderReadOnlySection("Hypotheses", renderResearchHypotheses(record.hypotheses)),
    renderReadOnlySection("Artifacts", renderResearchArtifacts(record.artifacts)),
  ]);
}

function researchProjectionSemanticInput(record: ResearchRecord): Record<string, unknown> {
  return {
    title: record.state.title,
    status: record.state.status,
    createdAt: record.state.createdAt,
    tags: record.state.tags,
    sourceRefs: record.state.sourceRefs,
    question: record.state.question,
    objective: record.state.objective,
    statusSummary: record.state.statusSummary,
    scope: record.state.scope,
    nonGoals: record.state.nonGoals,
    methodology: record.state.methodology,
    keywords: record.state.keywords,
    conclusions: record.state.conclusions,
    recommendations: record.state.recommendations,
    openQuestions: record.state.openQuestions,
    linkedWork: {
      initiativeIds: record.state.initiativeIds,
      specChangeIds: record.state.specChangeIds,
      ticketIds: record.state.ticketIds,
    },
    hypotheses: record.hypotheses.map((hypothesis) => ({
      id: hypothesis.id,
      status: hypothesis.status,
      confidence: hypothesis.confidence,
      statement: hypothesis.statement,
      evidence: hypothesis.evidence,
      results: hypothesis.results,
    })),
    artifacts: record.artifacts.map((artifact) => ({
      id: artifact.id,
      kind: artifact.kind,
      title: artifact.title,
      summary: artifact.summary,
      sourceUri: artifact.sourceUri,
      linkedHypothesisIds: artifact.linkedHypothesisIds,
    })),
  };
}

function parseEditableText(section: string): string {
  const trimmed = section.trim();
  return trimmed === "(empty)" ? "" : trimmed;
}

function parseEditableList(section: string): string[] {
  return normalizeStringList(parseMarkdownBulletList(section));
}

function requireEditableSections(sections: Record<string, string>, filePath: string): void {
  const missing = RESEARCH_PROJECTION_EDITABLE_SECTIONS.filter((section) => !(section in sections));
  if (missing.length > 0) {
    throw new Error(
      `Research projection ${filePath} is missing editable sections: ${missing.join(", ")}. Re-export before reconciling.`,
    );
  }
}

function readFrontmatterTitle(frontmatter: Record<string, string | string[] | null>): string | undefined {
  const title = frontmatter.title;
  if (typeof title !== "string") {
    return undefined;
  }
  const trimmed = title.trim();
  return trimmed || undefined;
}

export function buildResearchProjection(record: ResearchRecord): WorkspaceProjectionDocument {
  const renderedContent = serializeMarkdownArtifact(
    {
      id: record.state.researchId,
      title: record.state.title,
      status: record.state.status,
      "created-at": record.state.createdAt,
      tags: record.state.tags,
      "source-refs": record.state.sourceRefs,
    },
    renderResearchProjectionBody(record),
  );

  return createWorkspaceProjectionDocument({
    family: "research",
    canonicalRef: `research:${record.state.researchId}`,
    relativePath: `${record.state.researchId}.md`,
    renderedContent,
    semanticInput: researchProjectionSemanticInput(record),
    editability: { mode: "sections", editableSections: [...RESEARCH_PROJECTION_EDITABLE_SECTIONS] },
  });
}

export function createResearchProjectionManifest(records: readonly ResearchRecord[]): LoomProjectionManifest {
  return createWorkspaceProjectionManifest(
    RESEARCH_FAMILY,
    records.map((record) => buildResearchProjection(record)),
  );
}

export interface ResearchProjectionFileResult {
  path: string;
  write: LoomProjectionWriteResult;
  record: ResearchRecord;
}

export interface ResearchProjectionExportResult {
  manifest: LoomProjectionManifest;
  files: ResearchProjectionFileResult[];
  records: ResearchRecord[];
}

async function loadResearchProjectionRecords(cwd: string): Promise<ResearchRecord[]> {
  const store = createResearchStore(cwd);
  const summaries = await store.listResearch({ includeArchived: true });
  const records = await Promise.all(summaries.map((summary) => store.readResearch(summary.id)));
  return records.sort((left, right) => left.state.researchId.localeCompare(right.state.researchId));
}

export async function exportResearchProjections(cwd: string): Promise<ResearchProjectionExportResult> {
  ensureProjectionWorkspace(cwd, { enabledFamilies: [RESEARCH_FAMILY] });
  const records = await loadResearchProjectionRecords(cwd);
  const manifest = createResearchProjectionManifest(records);
  const files = records.map((record) => {
    const projection = buildResearchProjection(record);
    const path = resolveProjectionFilePath(cwd, RESEARCH_FAMILY, projection.relativePath);
    return {
      path,
      write: writeProjectionFile(path, projection.renderedContent),
      record,
    };
  });
  writeProjectionManifest(resolveProjectionFilePath(cwd, RESEARCH_FAMILY, "manifest.json"), manifest);
  return { manifest, files, records };
}

export function reconcileResearchProjection(current: ResearchRecord, markdown: string): UpdateResearchInput {
  const filePath = `${current.state.researchId}.md`;
  const parsed = parseMarkdownArtifact(markdown, filePath);
  const sections = parseMarkdownSections(parsed.body);
  requireEditableSections(sections, filePath);

  return {
    title: readFrontmatterTitle(parsed.frontmatter) ?? current.state.title,
    question: parseEditableText(sections.Question ?? ""),
    objective: parseEditableText(sections.Objective ?? ""),
    statusSummary: parseEditableText(sections["Status Summary"] ?? ""),
    scope: parseEditableList(sections.Scope ?? ""),
    nonGoals: parseEditableList(sections["Non-Goals"] ?? ""),
    methodology: parseEditableList(sections.Methodology ?? ""),
    keywords: parseEditableList(sections.Keywords ?? ""),
    conclusions: parseEditableList(sections.Conclusions ?? ""),
    recommendations: parseEditableList(sections.Recommendations ?? ""),
    openQuestions: parseEditableList(sections["Open Questions"] ?? ""),
  };
}

export async function reconcileResearchProjections(
  cwd: string,
  selectionInput: LoomProjectionSelectionInput = {},
): Promise<ResearchRecord[]> {
  const store = createResearchStore(cwd);
  const records = await loadResearchProjectionRecords(cwd);
  const selection = normalizeProjectionSelection(selectionInput);
  const manifest = readProjectionManifest(resolveProjectionFilePath(cwd, RESEARCH_FAMILY, "manifest.json"));
  if (!manifest) {
    throw new Error("Projection family research has no manifest. Export it before reconciling.");
  }
  const manifestEntriesByPath = new Map(manifest.entries.map((entry) => [entry.relativePath, entry]));
  const updated: ResearchRecord[] = [];
  let matchedSelection = false;

  for (const record of records) {
    const projection = buildResearchProjection(record);
    if (!projectionEntryMatchesSelection(RESEARCH_FAMILY, projection.manifestEntry, selection)) {
      continue;
    }
    matchedSelection = true;
    const manifestEntry = manifestEntriesByPath.get(projection.relativePath);
    if (!manifestEntry) {
      throw new Error(`Projection research/${projection.relativePath} is not exported. Refresh it before reconciling.`);
    }
    const state = assessProjectionFileState(cwd, RESEARCH_FAMILY, manifestEntry);
    if (state.kind === "missing") {
      throw new Error(`Projection research/${projection.relativePath} is missing. Refresh it before reconciling.`);
    }
    if (state.kind !== "modified") {
      continue;
    }
    if (
      manifestEntry.revisionToken !== projection.manifestEntry.revisionToken ||
      manifestEntry.baseVersion !== projection.manifestEntry.baseVersion
    ) {
      throw new Error(`Projection research/${projection.relativePath} is stale. Refresh it before reconciling.`);
    }
    updated.push(
      await store.updateResearch(
        record.state.researchId,
        reconcileResearchProjection(record, readFileSync(state.absolutePath, "utf-8")),
      ),
    );
  }

  if (selection.hasSelection && !matchedSelection) {
    throw new Error("No research projections matched the requested selection.");
  }

  return updated;
}
