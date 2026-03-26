import { describe, expect, it } from "vitest";
import {
  buildDocumentationProjection,
  createDocumentationProjectionManifest,
  reconcileDocumentationProjection,
} from "../domain/projection.js";
import { renderDocumentationMarkdown } from "../domain/render.js";
import type { DocumentationReadResult, DocumentationState } from "../domain/models.js";

function sampleDocState(overrides: Partial<DocumentationState> = {}): DocumentationState {
  return {
    docId: overrides.docId ?? "workspace-projections-guide",
    title: overrides.title ?? "Workspace projections guide",
    status: overrides.status ?? "active",
    docType: overrides.docType ?? "guide",
    sectionGroup: overrides.sectionGroup ?? "guides",
    createdAt: overrides.createdAt ?? "2026-03-20T12:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-03-21T12:00:00.000Z",
    summary: overrides.summary ?? "Explain how repository-visible projections relate to canonical storage.",
    audience: overrides.audience ?? ["ai", "human"],
    scopePaths: overrides.scopePaths ?? [],
    contextRefs: overrides.contextRefs ?? {
      roadmapItemIds: [],
      initiativeIds: [],
      researchIds: ["human-editable-workspace-projections-for-canonical-loom-records"],
      specChangeIds: ["workspace-projections-for-canonical-loom-records"],
      ticketIds: ["pl-0117"],
      critiqueIds: [],
    },
    sourceTarget: overrides.sourceTarget ?? { kind: "workspace", ref: "repo" },
    updateReason: overrides.updateReason ?? "Document the accepted projection behavior.",
    guideTopics: overrides.guideTopics ?? ["workspace-projections"],
    linkedOutputPaths: overrides.linkedOutputPaths ?? [],
    upstreamPath: overrides.upstreamPath ?? "README.md",
    lastRevisionId: overrides.lastRevisionId ?? "rev-002",
  };
}

function sampleDoc(overrides: Partial<DocumentationState> = {}): DocumentationReadResult {
  const state = sampleDocState(overrides);
  const body = [
    "# Workspace projections",
    "",
    "## Why it exists",
    "",
    "Canonical state stays in SQLite while `.loom/` remains derived.",
  ].join("\n");
  return {
    state,
    summary: {
      id: state.docId,
      title: state.title,
      status: state.status,
      docType: state.docType,
      sectionGroup: state.sectionGroup,
      updatedAt: state.updatedAt,
      repository: null,
      sourceKind: state.sourceTarget.kind,
      sourceRef: state.sourceTarget.ref,
      summary: state.summary,
      upstreamPath: state.upstreamPath,
      revisionCount: 2,
      ref: `doc:${state.docId}`,
    },
    packet: "packet",
    document: renderDocumentationMarkdown(state, body),
    revisions: [],
    overview: {
      doc: {
        id: state.docId,
        title: state.title,
        status: state.status,
        docType: state.docType,
        sectionGroup: state.sectionGroup,
        updatedAt: state.updatedAt,
        repository: null,
        sourceKind: state.sourceTarget.kind,
        sourceRef: state.sourceTarget.ref,
        summary: state.summary,
        upstreamPath: state.upstreamPath,
        revisionCount: 2,
        ref: `doc:${state.docId}`,
      },
      packetRef: `doc:${state.docId}:packet`,
      documentRef: `doc:${state.docId}:document`,
      revisionCount: 2,
      lastRevision: null,
      audience: state.audience,
      guideTopics: state.guideTopics,
      linkedOutputPaths: state.linkedOutputPaths,
      contextRefs: state.contextRefs,
      scopePaths: state.scopePaths,
    },
  } as DocumentationReadResult;
}

describe("documentation workspace projections", () => {
  it("renders docs-quality markdown through the shared manifest contract", () => {
    const alpha = sampleDoc();
    const beta = sampleDoc({ docId: "alpha-guide", title: "Alpha guide" });

    const projection = buildDocumentationProjection(alpha);
    const manifest = createDocumentationProjectionManifest([alpha, beta]);

    expect(projection.relativePath).toBe("guides/workspace-projections-guide.md");
    expect(projection.manifestEntry.editability).toEqual({ mode: "full" });
    expect(projection.renderedContent.match(/^---$/gm)).toHaveLength(2);
    expect(projection.renderedContent).toContain("# Workspace projections");
    expect(manifest.entries.map((entry) => entry.relativePath)).toEqual([
      "guides/alpha-guide.md",
      "guides/workspace-projections-guide.md",
    ]);
  });

  it("reconciles editable metadata and body while preserving canonical-only metadata boundaries", () => {
    const current = sampleDoc();
    const rendered = buildDocumentationProjection(current).renderedContent;
    const edited = rendered
      .replace('title: "Workspace projections guide"', 'title: "Repository projection guide"')
      .replace("type: guide", "type: faq")
      .replace("source: workspace:repo", "source: ticket:pl-9999")
      .replace("topics:\n  - workspace-projections", "topics:\n  - workspace-projections\n  - projections")
      .replace("outputs: []", "outputs:\n  - docs/loom.md")
      .replace("upstream-path: README.md", "upstream-path: CONTRIBUTING.md")
      .replace(
        "Canonical state stays in SQLite while `.loom/` remains derived.",
        "Canonical state stays in SQLite while `.loom/` remains a low-churn projection surface.",
      );

    const update = reconcileDocumentationProjection(current, edited);

    expect(update).toMatchObject({
      title: "Repository projection guide",
      audience: ["ai", "human"],
      guideTopics: ["workspace-projections", "projections"],
      linkedOutputPaths: ["docs/loom.md"],
      upstreamPath: "CONTRIBUTING.md",
      document:
        "# Workspace projections\n\n## Why it exists\n\nCanonical state stays in SQLite while `.loom/` remains a low-churn projection surface.",
    });
    expect(update).not.toHaveProperty("sourceTarget");
    expect(update).not.toHaveProperty("docType");
    expect(update).not.toHaveProperty("status");
  });
});
