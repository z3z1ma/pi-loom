import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-initiatives-dashboard-"));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(workspace, { recursive: true, force: true });
  });

  it("returns stable machine-usable summaries for linked specs, tickets, and milestones", () => {
    const constitutionalStore = createConstitutionalStore(workspace);
    const specStore = createSpecStore(workspace);
    const ticketStore = createTicketStore(workspace);
    const researchStore = createResearchStore(workspace);
    const initiativeStore = createInitiativeStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T13:00:00.000Z"));
    constitutionalStore.upsertRoadmapItem({
      title: "Establish observability memory",
      status: "active",
      horizon: "now",
      summary: "Make constitutional roadmap links visible inside initiative dashboards.",
    });
    researchStore.createResearch({ title: "Investigate observability gaps" });
    const planned = specStore.createChange({ title: "Add observability wall", summary: "Expose runtime health." });
    const blocker = ticketStore.createTicket({ title: "Map legacy metrics" });
    const closer = ticketStore.createTicket({ title: "Backfill dashboards" });
    ticketStore.closeTicket(closer.summary.id, "Dashboard smoke checks passed.");

    initiativeStore.createInitiative({
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
    researchStore.linkInitiative("investigate-observability-gaps", "observability-program");
    const initiative = initiativeStore.readInitiative("observability-program");

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
    expect(constitutionalStore.readRoadmapItem("item-001").initiativeIds).toEqual(["observability-program"]);

    const dashboardJson = readFileSync(
      join(workspace, ".loom", "initiatives", "observability-program", "dashboard.json"),
      "utf-8",
    );
    expect(dashboardJson).toContain('"linkedRoadmap"');
    expect(dashboardJson).toContain('"title": "Establish observability memory"');
    expect(dashboardJson).toContain('"linkedResearch"');
    expect(dashboardJson).toContain('"ready": 1');
    expect(dashboardJson).toContain('"closed": 1');
  });
});
