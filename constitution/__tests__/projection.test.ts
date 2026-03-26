import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportConstitutionProjections, reconcileConstitutionProjections } from "../domain/projection.js";
import { createConstitutionalStore } from "../domain/store.js";

describe("constitution workspace projections", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-constitution-projection-"));
    process.env.PI_LOOM_ROOT = join(workspace, ".pi-loom-test");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.PI_LOOM_ROOT;
    rmSync(workspace, { recursive: true, force: true });
  });

  async function seedConstitution() {
    const store = createConstitutionalStore(workspace);
    vi.setSystemTime(new Date("2026-03-26T10:00:00.000Z"));
    await store.initLedger({ title: "Pi Loom" });
    await store.updateVision({
      visionSummary: "Keep durable truth available between sessions.",
      visionNarrative: "Canonical state should outlive any individual transcript or worker runtime.",
    });
    await store.setPrinciples([
      {
        title: "Truthful interfaces",
        summary: "Derived surfaces must describe canonical reality.",
        rationale: "Human edits should fail closed when they touch generated data.",
      },
    ]);
    await store.setConstraints([
      {
        title: "SQLite is canonical",
        summary: "Workspace projections are derived review surfaces.",
        rationale: "Editing markdown must reconcile back into canonical storage explicitly.",
      },
    ]);
    vi.setSystemTime(new Date("2026-03-26T10:05:00.000Z"));
    await store.updateRoadmap({
      strategicDirectionSummary: "Project stable memory layers into workspace-visible markdown.",
      currentFocus: ["Export constitution family", "Protect generated roadmap sections"],
    });
    await store.upsertRoadmapItem({
      title: "Projection rollout",
      status: "active",
      horizon: "now",
      summary: "Ship the first workspace projection families.",
      rationale: "Operators need readable files without losing canonical truth.",
      initiativeIds: ["projection-rollout"],
      researchIds: ["projection-research"],
      specChangeIds: ["workspace-projections"],
    });
    await store.recordDecision(
      "Should roadmap decisions stay generated?",
      "Yes. Decision history remains canonical-only and projection edits must not rewrite it.",
      "roadmap_update",
      ["roadmap.md"],
    );
    return store;
  }

  it("exports deterministic files and reconciles approved constitution edits", async () => {
    const store = await seedConstitution();

    const first = await exportConstitutionProjections(workspace);
    const second = await exportConstitutionProjections(workspace);
    const manifestPath = join(workspace, ".loom", "constitution", "manifest.json");
    const visionPath = join(workspace, ".loom", "constitution", "vision.md");
    const roadmapPath = join(workspace, ".loom", "constitution", "roadmap.md");

    expect(readFileSync(manifestPath, "utf-8")).toBe(readFileSync(manifestPath, "utf-8"));
    expect(first.manifest).toEqual(second.manifest);
    expect(readFileSync(visionPath, "utf-8")).toContain("## Vision Summary");

    writeFileSync(
      visionPath,
      readFileSync(visionPath, "utf-8")
        .replace(
          "Keep durable truth available between sessions.",
          "Keep durable truth readable and editable in the workspace.",
        )
        .replace(
          "Canonical state should outlive any individual transcript or worker runtime.",
          "Canonical state should remain authoritative while workspace files carry the approved narrative.",
        ),
      "utf-8",
    );
    writeFileSync(
      roadmapPath,
      readFileSync(roadmapPath, "utf-8")
        .replace(
          "Project stable memory layers into workspace-visible markdown.",
          "Project stable memory layers into workspace-visible markdown without letting markdown become canonical.",
        )
        .replace("- Export constitution family", "- Export constitution family safely")
        .replace("- Protect generated roadmap sections", "- Protect generated roadmap sections during reconcile"),
      "utf-8",
    );

    await reconcileConstitutionProjections(workspace);
    const updated = await store.readConstitution();
    expect(updated.state.visionSummary).toBe("Keep durable truth readable and editable in the workspace.");
    expect(updated.state.visionNarrative).toBe(
      "Canonical state should remain authoritative while workspace files carry the approved narrative.",
    );
    expect(updated.state.strategicDirectionSummary).toBe(
      "Project stable memory layers into workspace-visible markdown without letting markdown become canonical.",
    );
    expect(updated.state.currentFocus).toEqual([
      "Export constitution family safely",
      "Protect generated roadmap sections during reconcile",
    ]);
    expect(updated.decisions).toHaveLength(1);

    const reexported = await exportConstitutionProjections(workspace);
    expect(reexported.manifest.entries).toHaveLength(4);
    expect(readFileSync(visionPath, "utf-8")).toContain("Keep durable truth readable and editable in the workspace.");
  });

  it("rejects edits to generated roadmap sections", async () => {
    const store = await seedConstitution();
    await exportConstitutionProjections(workspace);

    const roadmapPath = join(workspace, ".loom", "constitution", "roadmap.md");
    writeFileSync(
      roadmapPath,
      readFileSync(roadmapPath, "utf-8").replace("Projection rollout", "Projection rollout rewritten from markdown"),
      "utf-8",
    );

    await expect(reconcileConstitutionProjections(workspace)).rejects.toThrow(
      "Projection constitution/roadmap.md does not allow edits in generated section Now.",
    );
    expect((await store.readConstitution()).state.roadmapItems[0]?.title).toBe("Projection rollout");
  });
});
