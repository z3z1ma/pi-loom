import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitiativeStore } from "../../pi-initiatives/extensions/domain/store.js";
import { createSpecStore } from "../../pi-specs/extensions/domain/store.js";
import { createTicketStore } from "../../pi-ticketing/extensions/domain/store.js";
import { createResearchStore } from "../extensions/domain/store.js";

async function replaceResearchEntityWithFilesystemImport(
  workspace: string,
  researchId: string,
  filesByPath: Record<string, string>,
): Promise<void> {
  const [{ findEntityByDisplayId, upsertEntityByDisplayId }, { openWorkspaceStorage }] = await Promise.all([
    import("../../pi-storage/storage/entities.js"),
    import("../../pi-storage/storage/workspace.js"),
  ]);
  const { storage, identity } = await openWorkspaceStorage(workspace);
  const entity = await findEntityByDisplayId(storage, identity.space.id, "research", researchId);
  expect(entity).toBeTruthy();
  if (!entity) {
    throw new Error(`Expected research entity ${researchId} to exist`);
  }
  await upsertEntityByDisplayId(storage, {
    kind: entity.kind,
    spaceId: entity.spaceId,
    owningRepositoryId: entity.owningRepositoryId,
    displayId: entity.displayId,
    title: entity.title,
    summary: entity.summary,
    status: entity.status,
    version: entity.version + 1,
    tags: entity.tags,
    pathScopes: entity.pathScopes,
    attributes: { importedFrom: "filesystem", filesByPath },
    createdAt: entity.createdAt,
    updatedAt: new Date().toISOString(),
  });
}

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
    const ticket = ticketStore.createTicket({ title: "Build theme toggle" });

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

    expect(existsSync(join(workspace, ".loom", "research", "evaluate-theme-architecture", "state.json"))).toBe(true);
    expect(existsSync(join(workspace, ".loom", "research", "evaluate-theme-architecture", "research.md"))).toBe(true);
    expect(existsSync(join(workspace, ".loom", "research", "evaluate-theme-architecture", "dashboard.json"))).toBe(
      false,
    );
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
    expect(
      existsSync(join(workspace, ".loom", "research", "evaluate-theme-architecture", "experiments", "artifact-001.md")),
    ).toBe(true);
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
    expect(initiativeStore.readInitiativeProjection("theme-modernization").state.researchIds).toEqual([
      "evaluate-theme-architecture",
    ]);
    expect(specStore.readChangeProjection("add-dark-mode").state.researchIds).toEqual(["evaluate-theme-architecture"]);
    expect(ticketStore.readTicket(ticket.summary.id).summary.researchIds).toEqual(["evaluate-theme-architecture"]);

    const hypothesisLog = readFileSync(
      join(workspace, ".loom", "research", "evaluate-theme-architecture", "hypotheses.jsonl"),
      "utf-8",
    );
    expect(hypothesisLog.trim().split(/\r?\n/)).toHaveLength(3);
    expect(hypothesisLog).toContain('"status":"rejected"');

    expect(withArtifact.dashboard.hypotheses.counts.supported).toBe(1);
    expect(withArtifact.dashboard.artifacts.counts.experiment).toBe(1);
    expect(withArtifact.dashboard).not.toHaveProperty("generatedAt");
  }, 30000);

  it("skips malformed research directories while listing valid records", async () => {
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

    const malformedDir = join(workspace, ".loom", "research", "broken-record");
    mkdirSync(malformedDir, { recursive: true });
    writeFileSync(join(malformedDir, "research.md"), "incomplete projection\n", "utf-8");

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

  it("repairs filesystem-imported entities into canonical storage during list reads", async () => {
    const store = createResearchStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T10:00:00.000Z"));
    await store.createResearch({
      title: "Filesystem imported research",
      question: "Can canonical list reads repair imported snapshots?",
      keywords: ["repair"],
    });
    await store.recordHypothesis("filesystem-imported-research", {
      statement: "Canonical list reads should recover imported records.",
      status: "supported",
      confidence: "high",
    });

    const researchDir = join(workspace, ".loom", "research", "filesystem-imported-research");
    await replaceResearchEntityWithFilesystemImport(workspace, "filesystem-imported-research", {
      ".loom/research/filesystem-imported-research/state.json": readFileSync(join(researchDir, "state.json"), "utf-8"),
      ".loom/research/filesystem-imported-research/research.md": readFileSync(join(researchDir, "research.md"), "utf-8"),
      ".loom/research/filesystem-imported-research/hypotheses.jsonl": readFileSync(
        join(researchDir, "hypotheses.jsonl"),
        "utf-8",
      ),
      ".loom/research/filesystem-imported-research/artifacts.json": readFileSync(
        join(researchDir, "artifacts.json"),
        "utf-8",
      ),
    });
    rmSync(researchDir, { recursive: true, force: true });

    await expect(store.listResearch({ includeArchived: true })).resolves.toEqual([
      expect.objectContaining({
        id: "filesystem-imported-research",
        hypothesisCount: 1,
        path: ".loom/research/filesystem-imported-research",
      }),
    ]);
    expect(existsSync(join(researchDir, "state.json"))).toBe(true);

    const [{ findEntityByDisplayId }, { openWorkspaceStorage }] = await Promise.all([
      import("../../pi-storage/storage/entities.js"),
      import("../../pi-storage/storage/workspace.js"),
    ]);
    const { storage, identity } = await openWorkspaceStorage(workspace);
    const entity = await findEntityByDisplayId(storage, identity.space.id, "research", "filesystem-imported-research");
    expect(entity?.attributes).toMatchObject({
      state: expect.objectContaining({ researchId: "filesystem-imported-research" }),
      hypotheses: [expect.objectContaining({ id: "hyp-001" })],
    });
  });
});
