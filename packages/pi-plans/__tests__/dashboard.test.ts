import { describe, expect, it } from "vitest";
import { buildPlanDashboard } from "../extensions/domain/dashboard.js";
import type { PlanState } from "../extensions/domain/models.js";

describe("plan dashboard", () => {
  it("keeps repo-relative artifact paths and omits volatile timestamps", () => {
    const state: PlanState = {
      planId: "planning-layer-rollout",
      title: "Planning layer rollout",
      status: "active",
      createdAt: "2026-03-15T12:00:00.000Z",
      updatedAt: "2026-03-15T12:35:00.000Z",
      summary: "Coordinate the planning layer rollout.",
      purpose: "Bridge design into ticketed execution.",
      contextAndOrientation: "Stay detailed at the execution-strategy layer and ticket-linked.",
      planOfWork: "Ship the store, then the command surface.",
      concreteSteps: "Land implementation and review tickets.",
      validation: "Run targeted plan package tests.",
      risksAndQuestions: "Avoid dashboard churn.",
      outcomesAndRetrospective: "",
      scopePaths: ["packages/pi-plans", "README.md"],
      sourceTarget: { kind: "spec", ref: "spec-change-001" },
      contextRefs: {
        roadmapItemIds: ["item-001"],
        initiativeIds: ["initiative-001"],
        researchIds: ["research-001"],
        specChangeIds: ["spec-change-001"],
        ticketIds: ["ticket-001"],
        critiqueIds: ["critique-001"],
        docIds: ["doc-001"],
      },
      linkedTickets: [{ ticketId: "ticket-001", role: "implementation", order: 1 }],
      discoveries: [],
      decisions: [],
      packetSummary: "spec:spec-change-001; 1 linked ticket(s)",
    };

    const dashboard = buildPlanDashboard(
      state,
      ".loom/plans/planning-layer-rollout",
      ".loom/plans/planning-layer-rollout/packet.md",
      ".loom/plans/planning-layer-rollout/plan.md",
      [
        {
          ticketId: "ticket-001",
          role: "implementation",
          order: 1,
          status: "ready",
          title: "Implement plan store",
          path: ".loom/tickets/ticket-001.md",
        },
        {
          ticketId: "ticket-999",
          role: "review",
          order: 2,
          status: "missing",
          title: "Missing ticket",
          path: null,
        },
      ],
    );

    expect(dashboard).toEqual({
      plan: {
        id: "planning-layer-rollout",
        title: "Planning layer rollout",
        status: "active",
        updatedAt: "2026-03-15T12:35:00.000Z",
        sourceKind: "spec",
        sourceRef: "spec-change-001",
        linkedTicketCount: 1,
        summary: "Coordinate the planning layer rollout.",
        path: ".loom/plans/planning-layer-rollout",
      },
      packetPath: ".loom/plans/planning-layer-rollout/packet.md",
      planPath: ".loom/plans/planning-layer-rollout/plan.md",
      sourceTarget: { kind: "spec", ref: "spec-change-001" },
      contextRefs: {
        roadmapItemIds: ["item-001"],
        initiativeIds: ["initiative-001"],
        researchIds: ["research-001"],
        specChangeIds: ["spec-change-001"],
        ticketIds: ["ticket-001"],
        critiqueIds: ["critique-001"],
        docIds: ["doc-001"],
      },
      scopePaths: ["packages/pi-plans", "README.md"],
      linkedTickets: [
        {
          ticketId: "ticket-001",
          role: "implementation",
          order: 1,
          status: "ready",
          title: "Implement plan store",
          path: ".loom/tickets/ticket-001.md",
        },
        {
          ticketId: "ticket-999",
          role: "review",
          order: 2,
          status: "missing",
          title: "Missing ticket",
          path: null,
        },
      ],
      counts: {
        tickets: 2,
        byStatus: {
          ready: 1,
          missing: 1,
        },
      },
    });
    expect(dashboard).not.toHaveProperty("generatedAt");
  });
});
