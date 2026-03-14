import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConstitutionalStore } from "../extensions/domain/store.js";

describe("ConstitutionalStore durable memory", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "pi-constitution-store-"));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("initializes canonical artifacts, compiles the brief, and persists roadmap items separately from stable principles", () => {
    const store = createConstitutionalStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));
    const initialized = store.initLedger({ title: "Pi Loom" });
    expect(initialized.root).toBe(path.join(workspace, ".loom", "constitution"));
    expect(fs.existsSync(path.join(workspace, ".loom", "constitution", "state.json"))).toBe(true);
    expect(fs.existsSync(path.join(workspace, ".loom", "constitution", "brief.md"))).toBe(true);
    expect(fs.existsSync(path.join(workspace, ".loom", "constitution", "vision.md"))).toBe(true);
    expect(fs.existsSync(path.join(workspace, ".loom", "constitution", "principles.md"))).toBe(true);
    expect(fs.existsSync(path.join(workspace, ".loom", "constitution", "constraints.md"))).toBe(true);
    expect(fs.existsSync(path.join(workspace, ".loom", "constitution", "roadmap.md"))).toBe(true);
    expect(fs.existsSync(path.join(workspace, ".loom", "constitution", "decisions.jsonl"))).toBe(true);

    const vision = store.updateVision({
      visionSummary: "Build an AI-native coordination system for long-horizon engineering work.",
      visionNarrative:
        "Pi Loom should preserve governing intent, durable memory, and strategic sequencing across many turns.",
    });
    expect(vision.state.completeness.vision).toBe(true);

    const principles = store.setPrinciples([
      {
        title: "Truthful interfaces",
        summary: "System layers must tell downstream consumers what actually happened.",
        rationale: "Plausible-looking state is worse than explicit failure in long-horizon systems.",
      },
    ]);
    expect(principles.state.principles).toHaveLength(1);
    expect(principles.state.principles[0]?.id).toBe("principle-001");

    const constraints = store.setConstraints([
      {
        title: "Local durability first",
        summary: "Project-defining context must survive chat and agent turnover in repo-visible files.",
        rationale: "Transient chat cannot be the only copy of strategic truth.",
      },
    ]);
    expect(constraints.state.constraints).toHaveLength(1);
    expect(constraints.state.constraints[0]?.id).toBe("constraint-001");

    vi.setSystemTime(new Date("2026-03-15T12:05:00.000Z"));
    const roadmap = store.updateRoadmap({
      strategicDirectionSummary: "Establish constitutional memory before deepening lower-layer strategic planning.",
      currentFocus: ["Create constitutional package", "Link initiatives to roadmap items"],
    });
    expect(roadmap.state.completeness.roadmap).toBe(true);

    vi.setSystemTime(new Date("2026-03-15T12:10:00.000Z"));
    const withItem = store.upsertRoadmapItem({
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
    expect(fs.existsSync(path.join(workspace, ".loom", "constitution", "roadmap", "item-001.md"))).toBe(true);

    const linked = store.linkInitiative("item-001", "initiative-roadmap-sync");
    expect(linked.state.roadmapItems[0]?.initiativeIds).toEqual([
      "constitutional-foundation",
      "initiative-roadmap-sync",
    ]);

    vi.setSystemTime(new Date("2026-03-15T12:15:00.000Z"));
    const withDecision = store.recordDecision(
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

    const brief = fs.readFileSync(path.join(workspace, ".loom", "constitution", "brief.md"), "utf-8");
    expect(brief).toContain("# Pi Loom Constitutional Brief");
    expect(brief).toContain("Build an AI-native coordination system for long-horizon engineering work.");
    expect(brief).toContain("Truthful interfaces");
    expect(brief).toContain("Ship constitutional memory");

    const roadmapItem = fs.readFileSync(
      path.join(workspace, ".loom", "constitution", "roadmap", "item-001.md"),
      "utf-8",
    );
    expect(roadmapItem).toContain("status: active");
    expect(roadmapItem).toContain("Ship constitutional memory");
    expect(roadmapItem).toContain("constitutional-foundation");
  });
});
