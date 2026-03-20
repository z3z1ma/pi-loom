import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitiativeStore } from "../../pi-initiatives/extensions/domain/store.js";
import { createSpecStore } from "../../pi-specs/extensions/domain/store.js";
import { findEntityByDisplayId } from "../../pi-storage/storage/entities.js";
import { openWorkspaceStorage } from "../../pi-storage/storage/workspace.js";
import { createTicketStore } from "../../pi-ticketing/extensions/domain/store.js";
import { createResearchStore } from "../extensions/domain/store.js";

describe("research store", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-research-store-"));
    process.env.PI_LOOM_ROOT = join(workspace, ".pi-loom-test");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.PI_LOOM_ROOT;
    rmSync(workspace, { recursive: true, force: true });
  });

  it("persists durable research state, append-only hypotheses, artifacts, dashboards, and maps", async () => {
    const store = createResearchStore(workspace);
    const initiativeStore = createInitiativeStore(workspace);
    const specStore = createSpecStore(workspace);
    const ticketStore = createTicketStore(workspace);

    await initiativeStore.createInitiative({ title: "Theme modernization" });
    await specStore.createChange({ title: "Add dark mode", summary: "Support a dark theme." });
    const ticket = await ticketStore.createTicketAsync({ title: "Build theme toggle" });

    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));
    const created = await store.createResearch({
      title: "Evaluate theme architecture",
      question: "Should theme state live in a shared runtime service?",
      objective: "Decide how theme state should be modeled.",
      scope: ["theme state", "persistence"],
      methodology: ["source review", "prototype"],
      keywords: ["theme", "architecture"],
      openQuestions: ["How should SSR hydration work?"],
    });

    expect(created.summary).toMatchObject({
      id: "evaluate-theme-architecture",
      hypothesisCount: 0,
      artifactCount: 0,
      ref: "research:evaluate-theme-architecture",
    });
    await expect(store.listResearch()).resolves.toEqual([
      expect.objectContaining({
        id: "evaluate-theme-architecture",
        ref: "research:evaluate-theme-architecture",
      }),
    ]);

    vi.setSystemTime(new Date("2026-03-15T12:05:00.000Z"));
    await store.recordHypothesis("evaluate-theme-architecture", {
      statement: "A shared service reduces duplicated persistence logic.",
      evidence: ["Current code duplicates storage reads."],
      confidence: "medium",
    });
    await store.recordHypothesis("evaluate-theme-architecture", {
      id: "hyp-001",
      statement: "A shared service reduces duplicated persistence logic.",
      evidence: ["Current code duplicates storage reads."],
      results: ["Prototype removed duplicate logic in two call sites."],
      status: "supported",
      confidence: "high",
    });
    await store.recordHypothesis("evaluate-theme-architecture", {
      statement: "Per-component state is simpler.",
      status: "rejected",
      confidence: "low",
      results: ["Prototype increased hydration bugs."],
    });

    vi.setSystemTime(new Date("2026-03-15T12:10:00.000Z"));
    const withArtifact = await store.recordArtifact("evaluate-theme-architecture", {
      kind: "experiment",
      title: "Shared service prototype",
      summary: "Prototype centralizes theme reads and writes.",
      body: "The prototype collapses duplicated persistence logic into one module.",
      linkedHypothesisIds: ["hyp-001"],
      sourceUri: "https://example.com/prototype",
      tags: ["prototype"],
    });

    expect(withArtifact.hypotheses).toHaveLength(2);
    expect(withArtifact.hypothesisHistory).toHaveLength(3);
    expect(withArtifact.hypotheses.find((hypothesis) => hypothesis.id === "hyp-001")).toMatchObject({
      status: "supported",
      confidence: "high",
    });
    expect(withArtifact.hypotheses.find((hypothesis) => hypothesis.id === "hyp-002")).toMatchObject({
      status: "rejected",
    });
    expect(withArtifact.artifacts).toEqual([
      expect.objectContaining({
        id: "artifact-001",
        kind: "experiment",
        linkedHypothesisIds: ["hyp-001"],
        artifactRef: "research:evaluate-theme-architecture:artifact:experiment:artifact-001",
      }),
    ]);
    expect(withArtifact.dashboard).toMatchObject({
      hypotheses: { counts: { supported: 1, rejected: 1 } },
      artifacts: { counts: { experiment: 1 } },
      openQuestions: ["How should SSR hydration work?"],
    });
    expect(withArtifact.dashboard).not.toHaveProperty("generatedAt");
    expect(withArtifact.map.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "evaluate-theme-architecture", to: "hyp-001", relation: "tracks_hypothesis" }),
        expect.objectContaining({ from: "artifact-001", to: "hyp-001", relation: "supports_hypothesis" }),
      ]),
    );

    const { storage, identity } = await openWorkspaceStorage(workspace);
    const researchEntity = await findEntityByDisplayId(
      storage,
      identity.space.id,
      "research",
      "evaluate-theme-architecture",
    );
    expect(researchEntity).toBeTruthy();
    if (!researchEntity) {
      throw new Error("Expected research entity to exist");
    }
    expect(researchEntity.attributes).not.toHaveProperty("artifacts");

    expect(await storage.listEntities(identity.space.id, "artifact")).toEqual([
      expect.objectContaining({
        displayId: "research:evaluate-theme-architecture:artifact:experiment:artifact-001",
        attributes: expect.objectContaining({
          projectionOwner: "research-store:artifacts",
          artifactType: "research-artifact",
          payload: expect.objectContaining({
            id: "artifact-001",
            summary: "Prototype centralizes theme reads and writes.",
            body: "The prototype collapses duplicated persistence logic into one module.",
            sourceUri: "https://example.com/prototype",
          }),
        }),
      }),
    ]);

    expect(await storage.listEvents(researchEntity.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "updated",
          payload: expect.objectContaining({
            change: "research_hypothesis_recorded",
            action: "created",
            hypothesisId: "hyp-001",
          }),
        }),
        expect.objectContaining({
          kind: "updated",
          payload: expect.objectContaining({
            change: "research_hypothesis_recorded",
            action: "updated",
            hypothesisId: "hyp-001",
          }),
        }),
        expect.objectContaining({
          kind: "updated",
          payload: expect.objectContaining({
            change: "research_hypothesis_recorded",
            action: "created",
            hypothesisId: "hyp-002",
          }),
        }),
        expect.objectContaining({
          kind: "updated",
          payload: expect.objectContaining({
            change: "research_artifact_recorded",
            action: "created",
            artifactId: "artifact-001",
            artifactKind: "experiment",
          }),
        }),
      ]),
    );

    const linked = await store.updateResearch("evaluate-theme-architecture", {
      initiativeIds: ["theme-modernization"],
      specChangeIds: ["add-dark-mode"],
      ticketIds: [ticket.summary.id],
    });
    expect(linked.dashboard).toMatchObject({
      linkedInitiatives: { total: 1, items: [expect.objectContaining({ id: "theme-modernization" })] },
      linkedSpecs: { total: 1, items: [expect.objectContaining({ id: "add-dark-mode" })] },
      linkedTickets: { total: 1, items: [expect.objectContaining({ id: ticket.summary.id })] },
    });
    expect((await initiativeStore.readInitiative("theme-modernization")).state.researchIds).toEqual([
      "evaluate-theme-architecture",
    ]);
    expect((await specStore.readChange("add-dark-mode")).state.researchIds).toEqual(["evaluate-theme-architecture"]);
    expect((await ticketStore.readTicketAsync(ticket.summary.id)).summary.researchIds).toEqual([
      "evaluate-theme-architecture",
    ]);

    expect(linked.hypothesisHistory).toHaveLength(3);
    expect(linked.hypothesisHistory).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "hyp-002", status: "rejected" })]),
    );

    expect(withArtifact.dashboard.hypotheses.counts.supported).toBe(1);
    expect(withArtifact.dashboard.artifacts.counts.experiment).toBe(1);
    expect(withArtifact.dashboard).not.toHaveProperty("generatedAt");
  }, 30000);

  it("lists canonical research records without relying on repo files", async () => {
    const store = createResearchStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T09:00:00.000Z"));
    await store.createResearch({
      title: "Alpha research",
      question: "What should alpha validate?",
    });

    vi.setSystemTime(new Date("2026-03-15T09:05:00.000Z"));
    await store.createResearch({
      title: "Zulu research",
      question: "What should zulu validate?",
    });

    await expect(store.listResearch()).resolves.toEqual([
      expect.objectContaining({
        id: "zulu-research",
        ref: "research:zulu-research",
      }),
      expect.objectContaining({
        id: "alpha-research",
        ref: "research:alpha-research",
      }),
    ]);
  });

  it("rebuilds research artifacts from canonical artifact entities without leaving stale ids", async () => {
    const store = createResearchStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T10:00:00.000Z"));
    await store.createResearch({
      title: "Evaluate cache invalidation",
      question: "How should cache invalidation be coordinated?",
    });
    await store.recordArtifact("evaluate-cache-invalidation", {
      kind: "note",
      title: "Invalidation notes",
      summary: "Candidate invalidation rules.",
      body: "Detailed notes that only live in the canonical artifact payload.",
    });

    const { storage, identity } = await openWorkspaceStorage(workspace);
    const [artifactEntity] = await storage.listEntities(identity.space.id, "artifact");
    expect(artifactEntity).toBeTruthy();
    if (!artifactEntity) {
      throw new Error("Expected artifact projection to exist");
    }
    await storage.removeEntity(artifactEntity.id);

    const rebuilt = await store.readResearch("evaluate-cache-invalidation");
    expect(rebuilt.artifacts).toEqual([]);
    expect(rebuilt.state.artifactIds).toEqual([]);
    expect(rebuilt.dashboard.artifacts.total).toBe(0);
    expect(Object.values(rebuilt.map.nodes).some((node) => node.kind === "artifact")).toBe(false);
  });
});
