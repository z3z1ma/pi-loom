import { describe, expect, it } from "vitest";
import { buildPlanDashboard } from "../extensions/domain/dashboard.js";
import type { PlanState } from "../extensions/domain/models.js";

describe("plan dashboard", () => {
  it("keeps canonical refs and omits volatile timestamps", () => {
    const state: PlanState = {
      planId: "planning-layer-rollout",
      title: "Planning layer rollout",
      status: "active",
      createdAt: "2026-03-15T12:00:00.000Z",
      updatedAt: "2026-03-15T12:35:00.000Z",
      summary: "Coordinate the planning layer rollout.",
      purpose: "Bridge design into ticketed execution.",
      contextAndOrientation: "Stay detailed at the execution-strategy layer and ticket-linked.",
      milestones: "Ship the store, then verify the command surface.",
      planOfWork: "Ship the store, then the command surface.",
      concreteSteps: "Land implementation and review tickets.",
      validation: "Run targeted plan package tests.",
      idempotenceAndRecovery: "Re-running the targeted tests is safe.",
      artifactsAndNotes: "Record the most relevant test output snippets.",
      interfacesAndDependencies: "Keep the store and renderer signatures stable.",
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
      progress: [{ timestamp: "2026-03-15T12:35:00.000Z", status: "pending", text: "Land implementation." }],
      discoveries: [],
      decisions: [],
      revisionNotes: [
        {
          timestamp: "2026-03-15T12:35:00.000Z",
          change: "Created workplan scaffold.",
          reason: "Establish durable execution strategy.",
        },
      ],
      packetSummary: "spec:spec-change-001; 1 linked ticket(s)",
    };

    const dashboard = buildPlanDashboard(state, [
        {
          ticketId: "ticket-001",
          role: "implementation",
          order: 1,
          status: "ready",
          title: "Implement plan store",
          ref: "ticket:ticket-001",
        },
        {
          ticketId: "ticket-999",
          role: "review",
          order: 2,
          status: "missing",
          title: "Missing ticket",
          ref: "ticket:ticket-999",
        },
      ]);

    expect(dashboard).toEqual({
      plan: {
        id: "planning-layer-rollout",
        title: "Planning layer rollout",
        status: "active",
        updatedAt: "2026-03-15T12:35:00.000Z",
        sourceKind: "spec",
        sourceRef: "spec-change-001",
        linkedTicketCount: 2,
        summary: "Coordinate the planning layer rollout.",
        ref: "plan:planning-layer-rollout",
      },
      packetRef: "plan:planning-layer-rollout:packet",
      planRef: "plan:planning-layer-rollout:document",
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
          ref: "ticket:ticket-001",
        },
        {
          ticketId: "ticket-999",
          role: "review",
          order: 2,
          status: "missing",
          title: "Missing ticket",
          ref: "ticket:ticket-999",
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

  it("uses the resolved linked-ticket snapshot instead of stale state counts or live references", () => {
    const state: PlanState = {
      planId: "planning-layer-rollout",
      title: "Planning layer rollout",
      status: "active",
      createdAt: "2026-03-15T12:00:00.000Z",
      updatedAt: "2026-03-15T12:35:00.000Z",
      summary: "Coordinate the planning layer rollout.",
      purpose: "Bridge design into ticketed execution.",
      contextAndOrientation: "Stay detailed at the execution-strategy layer and ticket-linked.",
      milestones: "Ship the store, then verify the command surface.",
      planOfWork: "Ship the store, then the command surface.",
      concreteSteps: "Land implementation and review tickets.",
      validation: "Run targeted plan package tests.",
      idempotenceAndRecovery: "Re-running the targeted tests is safe.",
      artifactsAndNotes: "Record the most relevant test output snippets.",
      interfacesAndDependencies: "Keep the store and renderer signatures stable.",
      risksAndQuestions: "Avoid dashboard churn.",
      outcomesAndRetrospective: "",
      scopePaths: ["packages/pi-plans"],
      sourceTarget: { kind: "spec", ref: "spec-change-001" },
      contextRefs: {
        roadmapItemIds: [],
        initiativeIds: ["initiative-001"],
        researchIds: [],
        specChangeIds: ["spec-change-001"],
        ticketIds: ["ticket-001"],
        critiqueIds: [],
        docIds: [],
      },
      linkedTickets: [{ ticketId: "ticket-001", role: "implementation", order: 1 }],
      progress: [{ timestamp: "2026-03-15T12:35:00.000Z", status: "pending", text: "Land implementation." }],
      discoveries: [],
      decisions: [],
      revisionNotes: [
        {
          timestamp: "2026-03-15T12:35:00.000Z",
          change: "Created workplan scaffold.",
          reason: "Establish durable execution strategy.",
        },
      ],
      packetSummary: "spec:spec-change-001; 1 linked ticket(s)",
    };
    const linkedTickets = [
      {
        ticketId: "ticket-001",
        role: "implementation",
        order: 1,
        status: "ready",
        title: "Implement plan store",
        ref: "ticket:ticket-001",
      },
      {
        ticketId: "ticket-002",
        role: "review",
        order: 2,
        status: "closed",
        title: "Review plan package",
        ref: "ticket:ticket-002",
      },
    ];

    const dashboard = buildPlanDashboard(state, linkedTickets);

    const firstLinkedTicket = linkedTickets[0];
    expect(firstLinkedTicket).toBeDefined();
    if (!firstLinkedTicket) {
      throw new Error("Expected first linked ticket");
    }
    firstLinkedTicket.status = "missing";
    state.contextRefs.ticketIds.push("ticket-999");

    expect(dashboard.plan.linkedTicketCount).toBe(2);
    expect(dashboard.counts).toEqual({
      tickets: 2,
      byStatus: {
        ready: 1,
        closed: 1,
      },
    });
    expect(dashboard.linkedTickets[0]).toMatchObject({
      ticketId: "ticket-001",
      status: "ready",
    });
    expect(dashboard.contextRefs.ticketIds).toEqual(["ticket-001"]);
  });
});
