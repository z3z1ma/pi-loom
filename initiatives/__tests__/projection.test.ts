import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConstitutionalStore } from "#constitution/domain/store.js";
import { createResearchStore } from "#research/domain/store.js";
import { createSpecStore } from "#specs/domain/store.js";
import { createTicketStore } from "#ticketing/domain/store.js";
import { exportInitiativeProjections, reconcileInitiativeProjections } from "../domain/projection.js";
import { createInitiativeStore } from "../domain/store.js";

describe("initiative workspace projections", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-initiative-projection-"));
    process.env.PI_LOOM_ROOT = join(workspace, ".pi-loom-test");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.PI_LOOM_ROOT;
    rmSync(workspace, { recursive: true, force: true });
  });

  async function seedInitiative() {
    const constitutionStore = createConstitutionalStore(workspace);
    const researchStore = createResearchStore(workspace);
    const specStore = createSpecStore(workspace);
    const ticketStore = createTicketStore(workspace);
    const initiativeStore = createInitiativeStore(workspace);

    vi.setSystemTime(new Date("2026-03-26T11:00:00.000Z"));
    await constitutionStore.initLedger({ title: "Pi Loom" });
    await constitutionStore.upsertRoadmapItem({
      title: "Projection rollout",
      status: "active",
      horizon: "now",
      summary: "Ship workspace projections.",
      rationale: "Operators need readable projections.",
    });
    const research = await researchStore.createResearch({ title: "Projection investigation" });
    const spec = await specStore.createChange({
      title: "Workspace projections",
      summary: "Expose readable projections.",
    });
    const ticket = await ticketStore.createTicketAsync({ title: "Implement projection exporter" });
    const initiative = await initiativeStore.createInitiative({
      title: "Projection adoption",
      objective: "Roll out workspace projections without losing canonical truth.",
      outcomes: ["Readable markdown exports"],
      scope: ["Constitution family", "Spec family"],
      nonGoals: ["Ad hoc markdown as source of truth"],
      successMetrics: ["Operators can review exports before reconcile"],
      risks: ["Generated fields might be edited accidentally"],
      statusSummary: "Initial rollout planning is active.",
      researchIds: [research.state.researchId],
      specChangeIds: [spec.state.changeId],
      ticketIds: [ticket.summary.id],
      roadmapRefs: ["item-001"],
      milestones: [
        {
          title: "Land first exporter",
          status: "planned",
          description: "Ship a deterministic family export.",
          specChangeIds: [spec.state.changeId],
          ticketIds: [ticket.summary.id],
        },
      ],
    });

    return { initiativeStore, initiative };
  }

  it("exports deterministic initiative markdown and reconciles approved strategic edits", async () => {
    const { initiativeStore, initiative } = await seedInitiative();

    const first = await exportInitiativeProjections(workspace);
    const second = await exportInitiativeProjections(workspace);
    expect(first.manifest).toEqual(second.manifest);
    expect(first.files).toHaveLength(1);

    const projectionPath = join(workspace, ".loom", "initiatives", `${initiative.state.initiativeId}.md`);
    writeFileSync(
      projectionPath,
      readFileSync(projectionPath, "utf-8")
        .replace(
          "Roll out workspace projections without losing canonical truth.",
          "Roll out workspace projections without weakening canonical truth.",
        )
        .replace("- Readable markdown exports", "- Readable markdown exports with reconcile safety")
        .replace(
          "Initial rollout planning is active.",
          "Initial rollout planning is active and the first family is underway.",
        )
        .replace("- milestone-001: Land first exporter [planned]", "- milestone-001: Land first exporter [in_progress]")
        .replace(
          "  Description: Ship a deterministic family export.",
          "  Description: Ship a deterministic family export and verify reconcile safety.",
        ),
      "utf-8",
    );

    await reconcileInitiativeProjections(workspace);
    const updated = await initiativeStore.readInitiative(initiative.state.initiativeId);
    expect(updated.state.objective).toBe("Roll out workspace projections without weakening canonical truth.");
    expect(updated.state.outcomes).toEqual(["Readable markdown exports with reconcile safety"]);
    expect(updated.state.statusSummary).toBe("Initial rollout planning is active and the first family is underway.");
    expect(updated.state.milestones[0]).toMatchObject({
      title: "Land first exporter",
      status: "in_progress",
      description: "Ship a deterministic family export and verify reconcile safety.",
    });
    expect(updated.state.milestones[0]?.specChangeIds).toEqual(["workspace-projections"]);
    expect(updated.state.milestones[0]?.ticketIds).toEqual([updated.state.ticketIds[0]]);
  });

  it("rejects edits to generated milestone linkage fields", async () => {
    const { initiativeStore, initiative } = await seedInitiative();
    await exportInitiativeProjections(workspace);

    const projectionPath = join(workspace, ".loom", "initiatives", `${initiative.state.initiativeId}.md`);
    writeFileSync(
      projectionPath,
      readFileSync(projectionPath, "utf-8").replace(
        `  Specs: workspace-projections`,
        `  Specs: workspace-projections, unauthorized-link`,
      ),
      "utf-8",
    );

    await expect(reconcileInitiativeProjections(workspace)).rejects.toThrow(
      `Projection initiatives/${initiative.state.initiativeId}.md does not allow editing generated milestone links for milestone-001.`,
    );
    expect(
      (await initiativeStore.readInitiative(initiative.state.initiativeId)).state.milestones[0]?.specChangeIds,
    ).toEqual(["workspace-projections"]);
  });
});
