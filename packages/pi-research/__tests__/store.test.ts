import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitiativeStore } from "../../pi-initiatives/extensions/domain/store.js";
import { createSpecStore } from "../../pi-specs/extensions/domain/store.js";
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
      path: ".loom/research/evaluate-theme-architecture",
    });
    await expect(store.listResearch()).resolves.toEqual([
      expect.objectContaining({
        id: "evaluate-theme-architecture",
        path: ".loom/research/evaluate-theme-architecture",
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
        path: ".loom/research/evaluate-theme-architecture/experiments/artifact-001.md",
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
        id: "alpha-research",
        path: ".loom/research/alpha-research",
      }),
      expect.objectContaining({
        id: "zulu-research",
        path: ".loom/research/zulu-research",
      }),
    ]);
  });

});
