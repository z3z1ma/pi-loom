import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConstitutionalStore } from "@pi-loom/pi-constitution/extensions/domain/store.js";
import { createCritiqueStore } from "@pi-loom/pi-critique/extensions/domain/store.js";
import { createInitiativeStore } from "@pi-loom/pi-initiatives/extensions/domain/store.js";
import { createResearchStore } from "@pi-loom/pi-research/extensions/domain/store.js";
import { createSpecStore } from "@pi-loom/pi-specs/extensions/domain/store.js";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    const critiqueStore = createCritiqueStore(workspace);
    const initiativeStore = createInitiativeStore(workspace);
    const researchStore = createResearchStore(workspace);
    const specStore = createSpecStore(workspace);
    const ticketStore = createTicketStore(workspace);
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
    const spec = await specStore.createChange({
      title: "Add docs layer",
      summary: "Persist documentation packets, docs, and revision history.",
      initiativeIds: [initiative.state.initiativeId],
      researchIds: [research.state.researchId],
    });
    await specStore.updatePlan(spec.state.changeId, {
      designNotes: "Compile packets from linked context and maintain focused docs instead of one giant markdown file.",
      capabilities: [
        {
          title: "Focused docs corpus",
          summary: "Store durable overview, guide, concept, and operations docs.",
          requirements: [
            "Update docs only after completed code changes materially affect understanding.",
            "Run docs maintenance through a fresh process similar to critique.",
          ],
          acceptance: ["Docs remain high-level and explanatory rather than API reference material."],
          scenarios: ["A guide is refreshed after a workflow changes."],
        },
      ],
    });

    vi.setSystemTime(new Date("2026-03-15T11:20:00.000Z"));
    const ticket = await ticketStore.createTicketAsync({
      title: "Implement docs package",
      summary: "Persist docs state, packet, rendered document, revisions, and dashboard artifacts.",
      initiativeIds: [initiative.state.initiativeId],
      researchIds: [research.state.researchId],
      specChange: spec.state.changeId,
    });
    await initiativeStore.linkTicket(initiative.state.initiativeId, ticket.summary.id);
    await researchStore.linkTicket(research.state.researchId, ticket.summary.id);

    vi.setSystemTime(new Date("2026-03-15T11:25:00.000Z"));
    const critique = await critiqueStore.createCritiqueAsync({
      title: "Critique docs package",
      target: { kind: "ticket", ref: ticket.summary.id, path: "packages/pi-docs/extensions/domain/store.ts" },
      focusAreas: ["architecture", "docs"],
      reviewQuestion: "Does the docs package keep documentation distinct from critique and API reference material?",
      contextRefs: { roadmapItemIds: [roadmapId] },
    });
    await critiqueStore.recordRunAsync(critique.state.critiqueId, {
      kind: "docs",
      verdict: "pass",
      summary: "The docs layer remains distinct from critique and focused on high-level explanatory material.",
    });

    vi.setSystemTime(new Date("2026-03-15T11:30:00.000Z"));
    const doc = await docsStore.createDoc({
      title: "Documentation memory system",
      docType: "overview",
      summary: "Explain the durable documentation layer and when it should be updated.",
      sourceTarget: { kind: "spec", ref: spec.state.changeId },
      contextRefs: {
        roadmapItemIds: [roadmapId],
        initiativeIds: [initiative.state.initiativeId],
        researchIds: [research.state.researchId],
        specChangeIds: [spec.state.changeId],
        ticketIds: [ticket.summary.id],
        critiqueIds: [critique.state.critiqueId],
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
    expect(doc.packet).toContain(spec.state.changeId);
    expect(doc.packet).toContain(ticket.summary.id);
    expect(doc.packet).toContain(critique.state.critiqueId);
    expect(doc.packet).toContain("Do not generate API reference docs");
    expect(doc.packet).toContain("Likely Sections To Update");

    vi.setSystemTime(new Date("2026-03-15T11:35:00.000Z"));
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

    const reread = await docsStore.readDoc(doc.state.docId);
    expect(reread.revisions).toEqual(revised.revisions);
    expect(reread.document).toBe(revised.document);
    expect(reread.packet).toBe(revised.packet);
  }, 120000);
});
