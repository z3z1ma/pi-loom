import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConstitutionalStore } from "#constitution/extensions/domain/store.js";
import { createResearchStore } from "#research/extensions/domain/store.js";
import { createSpecStore } from "#specs/extensions/domain/store.js";
import { createTicketStore } from "#ticketing/extensions/domain/store.js";
import { createInitiativeStore } from "../extensions/domain/store.js";

describe("initiative dashboard", () => {
  let workspace: string;

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
    const blocker = await ticketStore.createTicketAsync({ title: "Map legacy metrics" });
    const closer = await ticketStore.createTicketAsync({ title: "Backfill dashboards" });
    await ticketStore.closeTicketAsync(closer.summary.id, "Dashboard smoke checks passed.");

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
        items: expect.arrayContaining([expect.objectContaining({ id: "investigate-observability-gaps" })]),
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
    expect((await constitutionalStore.readRoadmapItem("item-001")).initiativeIds).toEqual(["observability-program"]);

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
    const ticket = await ticketStore.createTicketAsync({ title: "Temporary ticket" });

    await initiativeStore.createInitiative({
      title: "Roadmap resilience",
      objective: "Keep dashboard reads truthful when linked artifacts disappear.",
      specChangeIds: [spec.summary.id],
      ticketIds: [ticket.summary.id],
      roadmapRefs: ["item-001"],
    });

    const [{ findEntityByDisplayId, upsertEntityByDisplayId }, { openWorkspaceStorage }] = await Promise.all([
      import("#storage/entities.js"),
      import("#storage/workspace.js"),
    ]);
    const { storage, identity } = await openWorkspaceStorage(workspace);
    const initiativeEntity = await findEntityByDisplayId(
      storage,
      identity.space.id,
      "initiative",
      "roadmap-resilience",
    );
    const constitutionEntity = await findEntityByDisplayId(storage, identity.space.id, "constitution", "constitution");
    expect(initiativeEntity).toBeTruthy();
    expect(constitutionEntity).toBeTruthy();
    if (!initiativeEntity || !constitutionEntity) {
      throw new Error("Expected initiative and constitution entities to exist");
    }
    await upsertEntityByDisplayId(storage, {
      kind: initiativeEntity.kind,
      spaceId: initiativeEntity.spaceId,
      owningRepositoryId: initiativeEntity.owningRepositoryId,
      displayId: initiativeEntity.displayId ?? initiativeEntity.id,
      title: initiativeEntity.title,
      summary: initiativeEntity.summary,
      status: initiativeEntity.status,
      version: initiativeEntity.version + 1,
      tags: initiativeEntity.tags,
      attributes: {
        ...(initiativeEntity.attributes as Record<string, unknown>),
        state: {
          ...((initiativeEntity.attributes as { state: Record<string, unknown> }).state ?? {}),
          specChangeIds: ["missing-spec"],
          ticketIds: ["missing-ticket"],
          roadmapRefs: ["item-404"],
        },
      },
      createdAt: initiativeEntity.createdAt,
      updatedAt: new Date().toISOString(),
    });
    await upsertEntityByDisplayId(storage, {
      kind: constitutionEntity.kind,
      spaceId: constitutionEntity.spaceId,
      owningRepositoryId: constitutionEntity.owningRepositoryId,
      displayId: constitutionEntity.displayId ?? constitutionEntity.id,
      title: constitutionEntity.title,
      summary: constitutionEntity.summary,
      status: constitutionEntity.status,
      version: constitutionEntity.version + 1,
      tags: constitutionEntity.tags,
      attributes: {
        ...(constitutionEntity.attributes as Record<string, unknown>),
        state: {
          ...((constitutionEntity.attributes as { state: Record<string, unknown> }).state ?? {}),
          roadmapItems: [],
        },
      },
      createdAt: constitutionEntity.createdAt,
      updatedAt: new Date().toISOString(),
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
