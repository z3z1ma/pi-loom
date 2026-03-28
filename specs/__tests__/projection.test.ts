import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportSpecProjections, reconcileSpecProjections } from "../domain/projection.js";
import { createSpecStore } from "../domain/store.js";

describe("spec workspace projections", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-spec-projection-"));
    process.env.PI_LOOM_ROOT = join(workspace, ".pi-loom-test");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.PI_LOOM_ROOT;
    rmSync(workspace, { recursive: true, force: true });
  });

  async function seedMutableSpec() {
    const store = createSpecStore(workspace);
    vi.setSystemTime(new Date("2026-03-26T12:00:00.000Z"));
    const created = await store.createChange({
      title: "Workspace projections",
      summary: "Expose readable projections.",
    });
    await store.recordClarification(created.state.changeId, "Should generated sections stay read-only?", "Yes.");
    await store.updatePlan(created.state.changeId, {
      designNotes: "Render proposal and design surfaces through the shared substrate.",
      capabilities: [
        {
          title: "Projection export",
          summary: "Write deterministic markdown projections.",
          requirements: ["Export proposal and design content"],
          acceptance: ["Re-export without edits is byte stable."],
          scenarios: ["Operator reviews a mutable spec from .loom/specs."],
        },
      ],
    });
    return store;
  }

  it("exports deterministic spec projections and reconciles editable narrative sections", async () => {
    const store = await seedMutableSpec();

    const first = await exportSpecProjections(workspace);
    const second = await exportSpecProjections(workspace);
    expect(first.manifest).toEqual(second.manifest);

    const proposalPath = join(workspace, ".loom", "specs", "workspace-projections", "proposal.md");
    const designPath = join(workspace, ".loom", "specs", "workspace-projections", "design.md");
    writeFileSync(
      proposalPath,
      readFileSync(proposalPath, "utf-8").replace(
        "Expose readable projections.",
        "Expose readable projections that reconcile back into canonical storage.",
      ),
      "utf-8",
    );
    writeFileSync(
      designPath,
      readFileSync(designPath, "utf-8").replace(
        "Render proposal and design surfaces through the shared substrate.",
        "Render proposal and design surfaces through the shared substrate while protecting generated sections.",
      ),
      "utf-8",
    );

    await reconcileSpecProjections(workspace);
    const updated = await store.readChange("workspace-projections");
    expect(updated.state.proposalSummary).toBe(
      "Expose readable projections that reconcile back into canonical storage.",
    );
    expect(updated.state.designNotes).toBe(
      "Render proposal and design surfaces through the shared substrate while protecting generated sections.",
    );
    expect(updated.state.requirements[0]?.text).toBe("Export proposal and design content");
  });

  it("rejects edits to generated spec sections", async () => {
    await seedMutableSpec();
    await exportSpecProjections(workspace);

    const proposalPath = join(workspace, ".loom", "specs", "workspace-projections", "proposal.md");
    writeFileSync(
      proposalPath,
      readFileSync(proposalPath, "utf-8").replace(
        "- req-001: Export proposal and design content",
        "- req-001: Export mutable and generated content together",
      ),
      "utf-8",
    );

    await expect(reconcileSpecProjections(workspace)).rejects.toThrow(
      "Projection specs/workspace-projections/proposal.md does not allow edits in generated section Requirements.",
    );
  });

  it("rejects edits to finalized spec projections", async () => {
    const store = await seedMutableSpec();
    vi.setSystemTime(new Date("2026-03-26T12:05:00.000Z"));
    await store.finalizeChange("workspace-projections");
    await exportSpecProjections(workspace);

    const proposalPath = join(workspace, ".loom", "specs", "workspace-projections", "proposal.md");
    writeFileSync(
      proposalPath,
      readFileSync(proposalPath, "utf-8").replace(
        "Expose readable projections.",
        "Attempt to mutate finalized spec content.",
      ),
      "utf-8",
    );

    await expect(reconcileSpecProjections(workspace)).rejects.toThrow(
      "Projection specs/workspace-projections/proposal.md is read-only because spec workspace-projections is finalized.",
    );
  });

  it("omits archived specs from projections and prunes their files", async () => {
    const store = await seedMutableSpec();
    await exportSpecProjections(workspace);

    const proposalPath = join(workspace, ".loom", "specs", "workspace-projections", "proposal.md");
    const designPath = join(workspace, ".loom", "specs", "workspace-projections", "design.md");

    vi.setSystemTime(new Date("2026-03-26T12:05:00.000Z"));
    await store.finalizeChange("workspace-projections");
    vi.setSystemTime(new Date("2026-03-26T12:06:00.000Z"));
    await store.archiveChange("workspace-projections");

    const exported = await exportSpecProjections(workspace);
    expect(exported.records).toEqual([]);
    expect(exported.files).toEqual([]);
    expect(exported.prunedRelativePaths).toEqual([
      "workspace-projections/design.md",
      "workspace-projections/proposal.md",
    ]);
    expect(exported.manifest.entries).toEqual([]);
    expect(() => readFileSync(proposalPath, "utf-8")).toThrow();
    expect(() => readFileSync(designPath, "utf-8")).toThrow();
  });

  it("omits deleted mutable specs from projections and prunes their files", async () => {
    const store = await seedMutableSpec();
    await exportSpecProjections(workspace);

    const proposalPath = join(workspace, ".loom", "specs", "workspace-projections", "proposal.md");
    const designPath = join(workspace, ".loom", "specs", "workspace-projections", "design.md");

    await store.deleteChange("workspace-projections");

    const exported = await exportSpecProjections(workspace);
    expect(exported.records).toEqual([]);
    expect(exported.files).toEqual([]);
    expect(exported.prunedRelativePaths).toEqual([
      "workspace-projections/design.md",
      "workspace-projections/proposal.md",
    ]);
    expect(exported.manifest.entries).toEqual([]);
    expect(() => readFileSync(proposalPath, "utf-8")).toThrow();
    expect(() => readFileSync(designPath, "utf-8")).toThrow();
  });
});
