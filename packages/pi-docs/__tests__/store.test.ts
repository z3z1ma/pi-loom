import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConstitutionalStore } from "@pi-loom/pi-constitution/extensions/domain/store.js";
import { createInitiativeStore } from "@pi-loom/pi-initiatives/extensions/domain/store.js";
import { createResearchStore } from "@pi-loom/pi-research/extensions/domain/store.js";
import { findEntityByDisplayId } from "@pi-loom/pi-storage/storage/entities.js";
import { openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseMarkdownArtifact } from "../extensions/domain/frontmatter.js";
import { createDocumentationStore } from "../extensions/domain/store.js";

describe("DocumentationStore durable memory", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-docs-store-"));
    process.env.PI_LOOM_ROOT = join(workspace, ".pi-loom-test");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.PI_LOOM_ROOT;
    rmSync(workspace, { recursive: true, force: true });
  });

  it("compiles documentation packets from linked context and appends durable revision history", async () => {
    const constitutionStore = createConstitutionalStore(workspace);
    const initiativeStore = createInitiativeStore(workspace);
    const researchStore = createResearchStore(workspace);
    const docsStore = createDocumentationStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T11:00:00.000Z"));
    await constitutionStore.initLedger({ title: "Pi Loom" });
    await constitutionStore.updateVision({
      title: "Pi Loom",
      visionSummary: "Build durable AI coordination memory.",
      visionNarrative: "The system should preserve execution, review, and documentation understanding durably.",
    });
    await constitutionStore.updateRoadmap({
      strategicDirectionSummary: "Keep Loom memory layers truthful as the codebase evolves.",
      currentFocus: ["Critique", "Documentation"],
    });
    const roadmap = await constitutionStore.upsertRoadmapItem({
      title: "Documentation layer",
      status: "active",
      horizon: "now",
      summary: "Add durable high-level documentation memory after completed work.",
      rationale: "Mission-critical work needs repo-visible explanations that survive beyond chat.",
    });
    const roadmapId = roadmap.state.roadmapItems[0]?.id;
    expect(roadmapId).toBeDefined();
    if (!roadmapId) {
      throw new Error("Expected roadmap item id");
    }

    vi.setSystemTime(new Date("2026-03-15T11:05:00.000Z"));
    const initiative = await initiativeStore.createInitiative({
      title: "Documentation Memory",
      objective: "Add first-class documentation memory for high-level system understanding.",
      roadmapRefs: [roadmapId],
      risks: ["Docs could drift away from completed system reality."],
    });

    vi.setSystemTime(new Date("2026-03-15T11:10:00.000Z"));
    const research = await researchStore.createResearch({
      title: "Docs maintenance semantics",
      question: "How should durable docs updates run?",
      objective: "Design a bounded fresh-maintainer packet for docs.",
      conclusions: [
        "Documentation maintenance should run after implementation is complete in a fresh maintainer context.",
      ],
      openQuestions: ["How should future top-level docs sync be wired?"],
      initiativeIds: [initiative.state.initiativeId],
    });
    initiativeStore.setResearchIds(initiative.state.initiativeId, [research.state.researchId]);

    vi.setSystemTime(new Date("2026-03-15T11:15:00.000Z"));
    const doc = await docsStore.createDoc({
      title: "Documentation memory system",
      docType: "overview",
      summary: "Explain the durable documentation layer and when it should be updated.",
      sourceTarget: { kind: "initiative", ref: initiative.state.initiativeId },
      contextRefs: {
        roadmapItemIds: [roadmapId],
        initiativeIds: [initiative.state.initiativeId],
        researchIds: [research.state.researchId],
      },
      scopePaths: ["packages/pi-docs", "README.md", "docs/loom.md"],
      guideTopics: ["documentation-memory", "fresh-updater"],
      linkedOutputPaths: ["docs/loom.md"],
      updateReason: "Add the final Loom memory layer for durable high-level docs.",
    });

    expect(doc.state.docId).toBe("documentation-memory-system");
    expect(doc.summary.ref).toBe(`documentation:${doc.state.docId}`);
    expect(doc.dashboard.packetRef).toBe(`documentation:${doc.state.docId}:packet`);
    expect(doc.dashboard.documentRef).toBe(`documentation:${doc.state.docId}:document`);
    expect(doc.document).toContain("id: documentation-memory-system");
    expect(doc.document).toContain("type: overview");
    expect(doc.packet).toContain("Keep Loom memory layers truthful as the codebase evolves.");
    expect(doc.packet).toContain(initiative.state.initiativeId);
    expect(doc.packet).toContain(research.state.researchId);
    expect(doc.packet).toContain("Do not generate API reference docs");
    expect(doc.packet).toContain("Likely Sections To Update");

    vi.setSystemTime(new Date("2026-03-15T11:20:00.000Z"));
    const revised = await docsStore.updateDoc(doc.state.docId, {
      updateReason: "Document the fresh-process updater and durable revision semantics.",
      summary: "Explains the docs packet, fresh updater, and durable revision history.",
      changedSections: ["Summary", "Update Flow", "Boundaries"],
      document: [
        "## Summary",
        "The documentation layer stores focused high-level docs in durable SQLite-backed memory and updates them after completed changes.",
        "",
        "## Update Flow",
        "A bounded packet is compiled from constitution, initiative, research, spec, ticket, and critique context before a fresh maintainer session updates the document.",
        "",
        "## Boundaries",
        "Documentation remains distinct from critique and from API reference generation.",
      ].join("\n"),
    });

    expect(revised.state.lastRevisionId).toBe("rev-001");
    expect(revised.revisions).toHaveLength(1);
    expect(revised.revisions[0]).toMatchObject({
      id: "rev-001",
      reason: "Document the fresh-process updater and durable revision semantics.",
      changedSections: ["Boundaries", "Summary", "Update Flow"],
    });
    expect(revised.dashboard.revisionCount).toBe(1);
    expect(revised.dashboard.lastRevision?.id).toBe("rev-001");
    expect(revised.dashboard.linkedOutputPaths).toEqual(["docs/loom.md"]);

    expect(revised.revisions[0]?.packetHash).toMatch(/^[a-f0-9]{64}$/);
    expect(revised.document).toContain("type: overview");
    expect(revised.document).toContain("## Update Flow");
    expect(revised.document).toContain("Documentation remains distinct from critique");

    vi.setSystemTime(new Date("2026-03-15T11:25:00.000Z"));
    const correctedContextRefsRevision = await docsStore.updateDoc(doc.state.docId, {
      summary: "Explains the docs packet, fresh updater, revision events, and durable revision history.",
      updateReason: "Refresh the summary and correct the linked context refs.",
      contextRefs: {
        initiativeIds: [initiative.state.initiativeId],
      },
      guideTopics: ["documentation-memory", "fresh-updater", "revision-events"],
    });

    expect(correctedContextRefsRevision.revisions).toHaveLength(2);
    expect(correctedContextRefsRevision.revisions[1]).toMatchObject({
      id: "rev-002",
      reason: "Refresh the summary and correct the linked context refs.",
      changedSections: [],
      summary: "Explains the docs packet, fresh updater, revision events, and durable revision history.",
    });
    expect(correctedContextRefsRevision.state.contextRefs).toEqual({
      roadmapItemIds: [],
      initiativeIds: [initiative.state.initiativeId],
      researchIds: [],
      specChangeIds: [],
      ticketIds: [],
      critiqueIds: [],
    });
    expect(correctedContextRefsRevision.revisions[1]?.linkedContextRefs).toEqual(
      correctedContextRefsRevision.state.contextRefs,
    );
    expect(
      parseMarkdownArtifact(correctedContextRefsRevision.document, correctedContextRefsRevision.dashboard.documentRef)
        .body,
    ).toBe(parseMarkdownArtifact(revised.document, revised.dashboard.documentRef).body);
    expect(correctedContextRefsRevision.dashboard.revisionCount).toBe(2);
    expect(correctedContextRefsRevision.dashboard.lastRevision?.id).toBe("rev-002");

    vi.setSystemTime(new Date("2026-03-15T11:30:00.000Z"));
    const archived = await docsStore.archiveDoc(doc.state.docId);

    expect(archived.state.status).toBe("archived");
    expect(archived.state.lastRevisionId).toBe("rev-003");
    expect(archived.revisions).toHaveLength(3);
    expect(archived.revisions[2]).toMatchObject({
      id: "rev-003",
      reason: "Archive Documentation memory system after it stops describing the active system state.",
      changedSections: [],
      linkedContextRefs: correctedContextRefsRevision.state.contextRefs,
    });
    expect(archived.dashboard.revisionCount).toBe(3);
    expect(archived.dashboard.lastRevision?.id).toBe("rev-003");
    await expect(
      docsStore.updateDoc(doc.state.docId, {
        summary: "Archived docs must not accept further updates.",
      }),
    ).rejects.toThrow("Cannot update archived documentation");

    const { storage, identity } = await openWorkspaceStorage(workspace);
    const entity = await findEntityByDisplayId(storage, identity.space.id, "documentation", doc.state.docId);
    expect(entity?.attributes).toEqual({
      snapshot: {
        state: archived.state,
        revisions: archived.revisions,
        documentBody: [
          "## Summary",
          "The documentation layer stores focused high-level docs in durable SQLite-backed memory and updates them after completed changes.",
          "",
          "## Update Flow",
          "A bounded packet is compiled from constitution, initiative, research, spec, ticket, and critique context before a fresh maintainer session updates the document.",
          "",
          "## Boundaries",
          "Documentation remains distinct from critique and from API reference generation.",
        ].join("\n"),
      },
    });
    expect(entity?.attributes).not.toEqual(expect.objectContaining({ packet: expect.anything() }));
    expect(entity?.attributes).not.toEqual(expect.objectContaining({ document: expect.anything() }));
    expect(entity?.attributes).not.toEqual(expect.objectContaining({ dashboard: expect.anything() }));

    const events = await storage.listEvents(entity?.id ?? "missing");
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "updated",
          actor: "documentation-store",
          payload: expect.objectContaining({
            change: "documentation_revision_recorded",
            revisionId: "rev-001",
            documentUpdated: true,
            changedSections: ["Boundaries", "Summary", "Update Flow"],
          }),
        }),
        expect.objectContaining({
          kind: "updated",
          actor: "documentation-store",
          payload: expect.objectContaining({
            change: "documentation_revision_recorded",
            revisionId: "rev-002",
            documentUpdated: false,
            changedSections: [],
          }),
        }),
        expect.objectContaining({
          kind: "updated",
          actor: "documentation-store",
          payload: expect.objectContaining({
            change: "documentation_revision_recorded",
            revisionId: "rev-003",
            documentUpdated: false,
            changedSections: [],
          }),
        }),
        expect.objectContaining({
          kind: "updated",
          actor: "documentation-store",
          payload: expect.objectContaining({
            change: "documentation_persisted",
            revisionCount: 3,
            lastRevisionId: "rev-003",
            status: "archived",
          }),
        }),
      ]),
    );

    const reread = await docsStore.readDoc(doc.state.docId);
    expect(reread.revisions).toEqual(archived.revisions);
    expect(reread.document).toBe(archived.document);
    expect(reread.packet).toBe(archived.packet);
    expect(reread.dashboard).toEqual(archived.dashboard);
  }, 120000);
});
