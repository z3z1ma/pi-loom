import { describe, expect, it } from "vitest";
import type { DocumentationGovernanceSurface, DocumentationReadResult, DocumentationState } from "../domain/models.js";
import { buildDocumentationOverview, summarizeDocumentation } from "../domain/overview.js";
import {
  buildDocumentationProjection,
  createDocumentationProjectionManifest,
  reconcileDocumentationProjection,
} from "../domain/projection.js";
import { renderDocumentationMarkdown } from "../domain/render.js";

function sampleDocState(overrides: Partial<DocumentationState> = {}): DocumentationState {
  return {
    docId: overrides.docId ?? "workspace-projections-guide",
    title: overrides.title ?? "Workspace projections guide",
    status: overrides.status ?? "active",
    docType: overrides.docType ?? "guide",
    sectionGroup: overrides.sectionGroup ?? "guides",
    topicId: overrides.topicId ?? "workspace-projections",
    topicRole: overrides.topicRole ?? "companion",
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
    verifiedAt: overrides.verifiedAt ?? "2026-03-21T12:00:00.000Z",
    verificationSource: overrides.verificationSource ?? "ticket:pl-0117",
    successorDocId: overrides.successorDocId ?? null,
    retirementReason: overrides.retirementReason ?? null,
    updateReason: overrides.updateReason ?? "Document the accepted projection behavior.",
    guideTopics: overrides.guideTopics ?? ["workspace-projections"],
    linkedOutputPaths: overrides.linkedOutputPaths ?? [],
    upstreamPath: overrides.upstreamPath ?? "README.md",
    lastRevisionId: overrides.lastRevisionId ?? "rev-002",
  };
}

function sampleGovernance(
  state: DocumentationState,
  overrides: Partial<DocumentationGovernanceSurface> = {},
): DocumentationGovernanceSurface {
  return {
    publicationStatus:
      overrides.publicationStatus ?? (state.status === "active" ? "current-companion" : "historical-archived"),
    publicationSummary:
      overrides.publicationSummary ??
      (state.status === "active"
        ? "Current companion doc beneath active topic owner workspace-projections-overview."
        : "Historical archived record that should stay readable but never count as current truth."),
    recommendedAction:
      overrides.recommendedAction ?? (state.status === "active" ? "update-current-companion" : "keep-archived-history"),
    currentOwnerDocId: overrides.currentOwnerDocId ?? "workspace-projections-overview",
    currentOwnerTitle: overrides.currentOwnerTitle ?? "Workspace projections overview",
    activeOwnerDocIds: overrides.activeOwnerDocIds ?? ["workspace-projections-overview"],
    successorDocId: overrides.successorDocId ?? state.successorDocId,
    successorTitle: overrides.successorTitle ?? null,
    predecessorDocIds: overrides.predecessorDocIds ?? [],
    relatedDocs: overrides.relatedDocs ?? [
      {
        id: "workspace-projections-overview",
        title: "Workspace projections overview",
        status: "active",
        docType: "overview",
        topicRole: "owner",
        updatedAt: "2026-03-21T11:00:00.000Z",
        publicationStatus: "current-owner",
        relationship: "current-owner",
        ref: "documentation:workspace-projections-overview",
      },
    ],
  };
}

function sampleDoc(overrides: Partial<DocumentationState> = {}): DocumentationReadResult {
  const state = sampleDocState(overrides);
  const governance = sampleGovernance(state);
  const body = [
    "# Workspace projections",
    "",
    "## Why it exists",
    "",
    "Canonical state stays in SQLite while `.loom/` remains derived.",
  ].join("\n");
  const summary = summarizeDocumentation(state, 0, governance);
  const overview = buildDocumentationOverview(state, [], governance);
  return {
    state,
    summary,
    packet: "packet",
    document: renderDocumentationMarkdown(state, governance, body),
    revisions: [],
    overview,
    governance,
  };
}

describe("documentation workspace projections", () => {
  it("renders docs-quality markdown through the shared manifest contract", () => {
    const alpha = sampleDoc();
    const beta = sampleDoc({ docId: "alpha-guide", title: "Alpha guide" });
    const archived = sampleDoc({ docId: "retired-guide", title: "Retired guide", status: "archived" });

    const projection = buildDocumentationProjection(alpha);
    const manifest = createDocumentationProjectionManifest([alpha, beta, archived]);

    expect(projection.relativePath).toBe("guides/workspace-projections-guide.md");
    expect(projection.manifestEntry.editability).toEqual({ mode: "full" });
    expect(projection.renderedContent.match(/^---$/gm)).toHaveLength(2);
    expect(projection.renderedContent).toContain("publication-status: current-companion");
    expect(projection.renderedContent).toContain("# Workspace projections");
    expect(manifest.entries.map((entry) => entry.relativePath)).toEqual([
      "guides/alpha-guide.md",
      "guides/workspace-projections-guide.md",
      "history/archived/guides/retired-guide.md",
    ]);
  });

  it("reconciles editable metadata and body while preserving canonical-only metadata boundaries", () => {
    const current = sampleDoc();
    const rendered = buildDocumentationProjection(current).renderedContent;
    const edited = rendered
      .replace('title: "Workspace projections guide"', 'title: "Repository projection guide"')
      .replace("type: guide", "type: faq")
      .replace("source: workspace:repo", "source: ticket:pl-9999")
      .replace("publication-status: current-companion", "publication-status: current-owner")
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
    expect(update).not.toHaveProperty("topicRole");
  });
});
