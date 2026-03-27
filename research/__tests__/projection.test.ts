import { describe, expect, it } from "vitest";
import type { ResearchRecord } from "../domain/models.js";
import {
  buildResearchProjection,
  createResearchProjectionManifest,
  RESEARCH_PROJECTION_EDITABLE_SECTIONS,
  reconcileResearchProjection,
} from "../domain/projection.js";

function sampleResearchRecord(overrides: Partial<ResearchRecord["state"]> = {}): ResearchRecord {
  return {
    state: {
      researchId: overrides.researchId ?? "workspace-projections-research",
      title: overrides.title ?? "Workspace projection research",
      status: overrides.status ?? "active",
      createdAt: overrides.createdAt ?? "2026-03-20T12:00:00.000Z",
      updatedAt: overrides.updatedAt ?? "2026-03-21T12:00:00.000Z",
      archivedAt: null,
      synthesizedAt: null,
      question: overrides.question ?? "How should repository-visible research projections work?",
      objective: overrides.objective ?? "Expose editable narrative sections without losing structured history.",
      scope: overrides.scope ?? ["Render research markdown", "Preserve linked work"],
      nonGoals: overrides.nonGoals ?? ["Implement operator commands"],
      methodology: overrides.methodology ?? ["Read existing renderers", "Add projection adapters"],
      keywords: overrides.keywords ?? ["projection", "research"],
      statusSummary: overrides.statusSummary ?? "Research projection adapter is in progress.",
      conclusions: overrides.conclusions ?? ["Generated summaries must remain read-only."],
      recommendations: overrides.recommendations ?? ["Map only editable narrative sections back into canonical state."],
      openQuestions: overrides.openQuestions ?? ["Should artifacts ever become first-class editable files?"],
      initiativeIds: overrides.initiativeIds ?? ["init-001"],
      specChangeIds: overrides.specChangeIds ?? ["workspace-projections-for-canonical-loom-records"],
      ticketIds: overrides.ticketIds ?? ["pl-0117"],
      capabilityIds: overrides.capabilityIds ?? ["workspace-projections"],
      artifactIds: overrides.artifactIds ?? ["artifact-001"],
      sourceRefs: overrides.sourceRefs ?? ["plan:workspace-projections-rollout-plan"],
      supersedes: overrides.supersedes ?? [],
      tags: overrides.tags ?? ["projection"],
    },
    summary: {
      id: overrides.researchId ?? "workspace-projections-research",
      title: overrides.title ?? "Workspace projection research",
      status: overrides.status ?? "active",
      hypothesisCount: 1,
      artifactCount: 1,
      linkedInitiativeCount: 1,
      linkedSpecCount: 1,
      linkedTicketCount: 1,
      updatedAt: overrides.updatedAt ?? "2026-03-21T12:00:00.000Z",
      tags: ["projection"],
      ref: `research:${overrides.researchId ?? "workspace-projections-research"}`,
      repository: null,
    },
    synthesis: "Generated summaries remain derived from canonical child records.",
    hypotheses: [
      {
        id: "hyp-001",
        researchId: overrides.researchId ?? "workspace-projections-research",
        statement: "Read-only summaries avoid markdown-only history loss.",
        status: "supported",
        confidence: "high",
        evidence: ["Research packet"],
        results: ["Preserved artifact and ticket links"],
        createdAt: "2026-03-20T12:00:00.000Z",
        updatedAt: "2026-03-21T12:00:00.000Z",
      },
    ],
    hypothesisHistory: [],
    artifacts: [
      {
        id: "artifact-001",
        researchId: overrides.researchId ?? "workspace-projections-research",
        kind: "note",
        title: "Projection design notes",
        artifactRef: "artifact:workspace-projections-research:artifact-001",
        createdAt: "2026-03-20T12:00:00.000Z",
        summary: "Explains why linked work stays generated.",
        sourceUri: "local://note.md",
        tags: ["projection"],
        linkedHypothesisIds: ["hyp-001"],
      },
    ],
    overview: {} as ResearchRecord["overview"],
    map: {
      researchId: overrides.researchId ?? "workspace-projections-research",
      nodes: {},
      edges: [],
      generatedAt: "2026-03-21T12:00:00.000Z",
    },
  } as ResearchRecord;
}

describe("research workspace projections", () => {
  it("renders deterministic research projections through the shared manifest contract", () => {
    const alpha = sampleResearchRecord();
    const beta = sampleResearchRecord({ researchId: "alpha-research", title: "Alpha research" });

    const projection = buildResearchProjection(alpha);
    const manifest = createResearchProjectionManifest([alpha, beta]);

    expect(projection.relativePath).toBe("workspace-projections-research.md");
    expect(projection.manifestEntry.editability).toEqual({
      mode: "sections",
      editableSections: [...RESEARCH_PROJECTION_EDITABLE_SECTIONS].sort((left, right) => left.localeCompare(right)),
    });
    expect(projection.renderedContent).toContain("## Hypotheses");
    expect(projection.renderedContent).toContain("Generated summary. Reconcile ignores edits in this section");
    expect(manifest.family).toBe("research");
    expect(manifest.entries.map((entry) => entry.relativePath)).toEqual([
      "alpha-research.md",
      "workspace-projections-research.md",
    ]);
  });

  it("reconciles only editable narrative sections and preserves structured child history", () => {
    const current = sampleResearchRecord();
    const rendered = buildResearchProjection(current).renderedContent;
    const edited = rendered
      .replace(
        "How should repository-visible research projections work?",
        "How should research projections stay editable without flattening structured child records?",
      )
      .replace(
        "## Linked Work\n\n_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._\n\n- initiative:init-001\n- spec:workspace-projections-for-canonical-loom-records\n- ticket:pl-0117\n\n## Hypotheses",
        "## Hypotheses",
      );

    const update = reconcileResearchProjection(current, edited);

    expect(update).toMatchObject({
      title: "Workspace projection research",
      question: "How should research projections stay editable without flattening structured child records?",
      keywords: ["projection", "research"],
      openQuestions: ["Should artifacts ever become first-class editable files?"],
    });
    expect(update).not.toHaveProperty("ticketIds");
    expect(update).not.toHaveProperty("specChangeIds");
    expect(update).not.toHaveProperty("initiativeIds");
  });
});
