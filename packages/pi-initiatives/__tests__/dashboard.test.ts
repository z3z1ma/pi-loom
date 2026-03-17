import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConstitutionalStore } from "../../pi-constitution/extensions/domain/store.js";
import { createResearchStore } from "../../pi-research/extensions/domain/store.js";
import { createSpecStore } from "../../pi-specs/extensions/domain/store.js";
import { createTicketStore } from "../../pi-ticketing/extensions/domain/store.js";
import { createInitiativeStore } from "../extensions/domain/store.js";

describe("initiative dashboard", () => {
  let workspace: string;

  async function replaceEntityWithFilesystemImport(
    kind: string,
    displayId: string,
    filesByPath: Record<string, string>,
  ): Promise<void> {
    const [{ findEntityByDisplayId, upsertEntityByDisplayId }, { openWorkspaceStorage }] = await Promise.all([
      import("../../pi-storage/storage/entities.js"),
      import("../../pi-storage/storage/workspace.js"),
    ]);
    const { storage, identity } = await openWorkspaceStorage(workspace);
    const entity = await findEntityByDisplayId(storage, identity.space.id, kind, displayId);
    expect(entity).toBeTruthy();
    if (!entity) {
      throw new Error(`Expected ${kind} entity ${displayId} to exist`);
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

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-initiatives-dashboard-"));
    process.env.PI_LOOM_ROOT = join(workspace, ".pi-loom-test");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.PI_LOOM_ROOT;
    rmSync(workspace, { recursive: true, force: true });
  });

  it("returns stable machine-usable summaries for linked specs, tickets, and milestones", async () => {
    const constitutionalStore = createConstitutionalStore(workspace);
    const specStore = createSpecStore(workspace);
    const ticketStore = createTicketStore(workspace);
    const researchStore = createResearchStore(workspace);
    const initiativeStore = createInitiativeStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T13:00:00.000Z"));
    await constitutionalStore.upsertRoadmapItem({
      title: "Establish observability memory",
      status: "active",
      horizon: "now",
      summary: "Make constitutional roadmap links visible inside initiative dashboards.",
    });
    await researchStore.createResearch({ title: "Investigate observability gaps" });
    const planned = await specStore.createChange({
      title: "Add observability wall",
      summary: "Expose runtime health.",
    });
    const blocker = ticketStore.createTicket({ title: "Map legacy metrics" });
    const closer = ticketStore.createTicket({ title: "Backfill dashboards" });
    ticketStore.closeTicket(closer.summary.id, "Dashboard smoke checks passed.");

    await initiativeStore.createInitiative({
      title: "Observability program",
      objective: "Provide a coherent visibility surface across the platform.",
      risks: ["Legacy metrics may be incomplete"],
      specChangeIds: [planned.summary.id],
      ticketIds: [blocker.summary.id, closer.summary.id],
      roadmapRefs: ["item-001"],
      milestones: [
        {
          title: "Baseline visibility",
          status: "in_progress",
          ticketIds: [blocker.summary.id, closer.summary.id],
        },
      ],
    });
    await researchStore.linkInitiative("investigate-observability-gaps", "observability-program");
    const initiative = await initiativeStore.readInitiative("observability-program");

    expect(initiative.dashboard).toMatchObject({
      initiative: { id: "observability-program", status: "proposed" },
      linkedRoadmap: {
        total: 1,
        items: [
          expect.objectContaining({
            id: "item-001",
            title: "Establish observability memory",
            status: "active",
            horizon: "now",
          }),
        ],
      },
      linkedResearch: {
        total: 1,
        items: [expect.objectContaining({ id: "investigate-observability-gaps" })],
      },
      linkedSpecs: {
        total: 1,
        counts: expect.objectContaining({ proposed: 1 }),
      },
      linkedTickets: {
        total: 2,
        ready: 1,
        closed: 1,
        counts: expect.objectContaining({ ready: 1, closed: 1 }),
      },
      milestones: [
        expect.objectContaining({
          status: "in_progress",
          health: "active",
          linkedOpenTicketCount: 1,
          linkedCompletedTicketCount: 1,
        }),
      ],
      openRisks: ["Legacy metrics may be incomplete"],
      unlinkedReferences: { roadmapRefs: [], specChangeIds: [], ticketIds: [] },
    });
    expect(initiative.state.researchIds).toEqual(["investigate-observability-gaps"]);
    expect(constitutionalStore.readRoadmapItemProjection("item-001").initiativeIds).toEqual(["observability-program"]);

    expect(initiative.dashboard.linkedRoadmap.total).toBe(1);
    expect(initiative.dashboard.linkedResearch.total).toBe(1);
    expect(initiative.dashboard.linkedTickets.ready).toBe(1);
    expect(initiative.dashboard.linkedTickets.closed).toBe(1);
  }, 30000);

  it("surfaces stale linked references instead of crashing the dashboard", async () => {
    const constitutionalStore = createConstitutionalStore(workspace);
    const specStore = createSpecStore(workspace);
    const ticketStore = createTicketStore(workspace);
    const initiativeStore = createInitiativeStore(workspace);

    await constitutionalStore.upsertRoadmapItem({
      title: "Temporary roadmap item",
      status: "active",
      horizon: "next",
      summary: "This link will go stale.",
    });
    const spec = await specStore.createChange({ title: "Temporary spec", summary: "This link will go stale." });
    const ticket = ticketStore.createTicket({ title: "Temporary ticket" });

    await initiativeStore.createInitiative({
      title: "Roadmap resilience",
      objective: "Keep dashboard reads truthful when linked artifacts disappear.",
      specChangeIds: [spec.summary.id],
      ticketIds: [ticket.summary.id],
      roadmapRefs: ["item-001"],
    });

    const initiativeDir = join(workspace, ".loom", "initiatives", "roadmap-resilience");
    const statePath = join(initiativeDir, "state.json");
    const state = JSON.parse(readFileSync(statePath, "utf-8")) as {
      specChangeIds: string[];
      ticketIds: string[];
      roadmapRefs: string[];
    } & Record<string, unknown>;
    state.specChangeIds = ["missing-spec"];
    state.ticketIds = ["missing-ticket"];
    state.roadmapRefs = ["item-404"];

    const constitutionalDir = join(workspace, ".loom", "constitution");
    const constitutionalStatePath = join(constitutionalDir, "state.json");
    const constitutionalState = {
      ...JSON.parse(readFileSync(constitutionalStatePath, "utf-8")),
      roadmapItems: [],
    };

    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
    writeFileSync(constitutionalStatePath, `${JSON.stringify(constitutionalState, null, 2)}\n`, "utf-8");

    await replaceEntityWithFilesystemImport("initiative", "roadmap-resilience", {
      ".loom/initiatives/roadmap-resilience/state.json": readFileSync(statePath, "utf-8"),
      ".loom/initiatives/roadmap-resilience/initiative.md": readFileSync(join(initiativeDir, "initiative.md"), "utf-8"),
      ".loom/initiatives/roadmap-resilience/decisions.jsonl": readFileSync(
        join(initiativeDir, "decisions.jsonl"),
        "utf-8",
      ),
    });
    await replaceEntityWithFilesystemImport("constitution", "constitution", {
      ".loom/constitution/state.json": readFileSync(constitutionalStatePath, "utf-8"),
      ".loom/constitution/brief.md": readFileSync(join(constitutionalDir, "brief.md"), "utf-8"),
      ".loom/constitution/roadmap.md": readFileSync(join(constitutionalDir, "roadmap.md"), "utf-8"),
    });

    const initiative = await initiativeStore.readInitiative("roadmap-resilience");

    expect(initiative.state.roadmapRefs).toEqual(["item-404"]);
    expect(initiative.state.specChangeIds).toEqual(["missing-spec"]);
    expect(initiative.state.ticketIds).toEqual(["missing-ticket"]);
    expect(initiative.dashboard.linkedRoadmap).toEqual({ total: 0, items: [] });
    expect(initiative.dashboard.linkedSpecs.total).toBe(0);
    expect(initiative.dashboard.linkedTickets.total).toBe(0);
    expect(initiative.dashboard.unlinkedReferences).toEqual({
      roadmapRefs: ["item-404"],
      specChangeIds: ["missing-spec", spec.summary.id],
      ticketIds: ["missing-ticket", ticket.summary.id],
    });
  }, 30000);
});
