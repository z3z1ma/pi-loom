import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findEntityByDisplayId, openWorkspaceStorage } from "../../pi-storage/storage/workspace.js";
import { createConstitutionalStore } from "../extensions/domain/store.js";

describe("ConstitutionalStore durable memory", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "pi-constitution-store-"));
    process.env.PI_LOOM_ROOT = path.join(workspace, ".pi-loom-test");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.PI_LOOM_ROOT;
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("initializes canonical artifacts, compiles the brief, and persists roadmap items separately from stable principles", async () => {
    const store = createConstitutionalStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));
    const initialized = await store.initLedger({ title: "Pi Loom" });
    expect(initialized.root).toBe(path.join(workspace, ".loom", "constitution"));
    const initialRecord = await store.readConstitution();
    expect(initialRecord.state.title).toBe("Pi Loom");
    expect(initialRecord.state.artifactPaths.root).toBe(initialized.root);
    expect(initialRecord.brief).toContain("# Pi Loom Constitutional Brief");

    const { storage, identity } = await openWorkspaceStorage(workspace);
    const constitutionEntity = await findEntityByDisplayId(storage, identity.space.id, "constitution", "constitution");
    expect(constitutionEntity).toBeTruthy();
    expect(fs.existsSync(path.join(process.env.PI_LOOM_ROOT as string, "catalog.sqlite"))).toBe(true);

    const vision = await store.updateVision({
      visionSummary: "Build an AI-native coordination system for long-horizon engineering work.",
      visionNarrative:
        "Pi Loom should preserve governing intent, durable memory, and strategic sequencing across many turns.",
    });
    expect(vision.state.completeness.vision).toBe(true);

    const principles = await store.setPrinciples([
      {
        title: "Truthful interfaces",
        summary: "System layers must tell downstream consumers what actually happened.",
        rationale: "Plausible-looking state is worse than explicit failure in long-horizon systems.",
      },
    ]);
    expect(principles.state.principles).toHaveLength(1);
    expect(principles.state.principles[0]?.id).toBe("principle-001");

    const constraints = await store.setConstraints([
      {
        title: "Local durability first",
        summary: "Project-defining context must survive chat and agent turnover in repo-visible files.",
        rationale: "Transient chat cannot be the only copy of strategic truth.",
      },
    ]);
    expect(constraints.state.constraints).toHaveLength(1);
    expect(constraints.state.constraints[0]?.id).toBe("constraint-001");

    vi.setSystemTime(new Date("2026-03-15T12:05:00.000Z"));
    const roadmap = await store.updateRoadmap({
      strategicDirectionSummary: "Establish constitutional memory before deepening lower-layer strategic planning.",
      currentFocus: ["Create constitutional package", "Link initiatives to roadmap items"],
    });
    expect(roadmap.state.completeness.roadmap).toBe(true);

    vi.setSystemTime(new Date("2026-03-15T12:10:00.000Z"));
    const withItem = await store.upsertRoadmapItem({
      title: "Ship constitutional memory",
      status: "active",
      horizon: "now",
      summary: "Introduce a first-class constitutional layer with compiled prompt context.",
      rationale: "Project identity and roadmap truth should outlive any single conversation.",
      initiativeIds: ["constitutional-foundation"],
      researchIds: ["constitutional-memory-research"],
      specChangeIds: ["add-constitutional-layer"],
    });
    expect(withItem.state.roadmapItems).toHaveLength(1);
    expect(withItem.state.roadmapItems[0]?.id).toBe("item-001");
    expect(withItem.state.initiativeIds).toEqual(["constitutional-foundation"]);
    expect(withItem.state.researchIds).toEqual(["constitutional-memory-research"]);
    expect(withItem.state.specChangeIds).toEqual(["add-constitutional-layer"]);
    expect(withItem.roadmap).toContain("Ship constitutional memory");
    expect(withItem.roadmap).toContain("constitutional-foundation");

    const linked = await store.linkInitiative("item-001", "initiative-roadmap-sync");
    expect(linked.state.roadmapItems[0]?.initiativeIds).toEqual([
      "constitutional-foundation",
      "initiative-roadmap-sync",
    ]);

    vi.setSystemTime(new Date("2026-03-15T12:15:00.000Z"));
    const withDecision = await store.recordDecision(
      "Should roadmap items remain separate from stable principles?",
      "Yes. Mutable sequencing belongs in roadmap items so principles can remain durable.",
      "roadmap_update",
      ["roadmap.md", "brief.md"],
    );
    expect(withDecision.decisions).toHaveLength(1);
    expect(withDecision.dashboard.roadmap.activeItemIds).toEqual(["item-001"]);
    expect(withDecision.dashboard.linkedWork.initiativeIds).toEqual([
      "constitutional-foundation",
      "initiative-roadmap-sync",
    ]);
    expect(withDecision.brief).toContain("# Pi Loom Constitutional Brief");
    expect(withDecision.brief).toContain("Build an AI-native coordination system for long-horizon engineering work.");
    expect(withDecision.brief).toContain("Truthful interfaces");
    expect(withDecision.brief).toContain("Ship constitutional memory");
    expect(withDecision.roadmap).toContain("item-001 [now/active] Ship constitutional memory");
    expect(withDecision.roadmap).toContain("Ship constitutional memory");
    expect(withDecision.roadmap).toContain("constitutional-foundation");

    const persistedEntity = await findEntityByDisplayId(storage, identity.space.id, "constitution", "constitution");
    expect(persistedEntity?.version).toBeGreaterThan(1);
    expect(await storage.listEvents(persistedEntity?.id ?? "missing")).toEqual([
      expect.objectContaining({ kind: "decision_recorded" }),
    ]);

    expect(
      await store.readRoadmapItem(path.join(workspace, ".loom", "constitution", "roadmap", "item-001.md")),
    ).toMatchObject({
      id: "item-001",
      title: "Ship constitutional memory",
    });
    expect(await store.validateRoadmapRefs([path.join("nested", "item-001.md"), "item-001"])).toEqual(["item-001"]);
  }, 15000);
});
