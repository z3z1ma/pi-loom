import type { PlanDashboard, PlanDashboardTicket, PlanState, PlanSummary } from "./models.js";

export function summarizePlan(state: PlanState, path: string): PlanSummary {
  return {
    id: state.planId,
    title: state.title,
    status: state.status,
    updatedAt: state.updatedAt,
    sourceKind: state.sourceTarget.kind,
    sourceRef: state.sourceTarget.ref,
    linkedTicketCount: state.linkedTickets.length,
    summary: state.summary,
    path,
  };
}

export function buildPlanDashboard(
  state: PlanState,
  path: string,
  packetPath: string,
  planPath: string,
  linkedTickets: PlanDashboardTicket[],
): PlanDashboard {
  const linkedTicketSnapshot = linkedTickets.map((ticket) => ({ ...ticket }));
  const byStatus = linkedTicketSnapshot.reduce<Record<string, number>>((acc, ticket) => {
    acc[ticket.status] = (acc[ticket.status] ?? 0) + 1;
    return acc;
  }, {});
  return {
    plan: {
      ...summarizePlan(state, path),
      linkedTicketCount: linkedTicketSnapshot.length,
    },
    packetPath,
    planPath,
    sourceTarget: { ...state.sourceTarget },
    contextRefs: {
      roadmapItemIds: [...state.contextRefs.roadmapItemIds],
      initiativeIds: [...state.contextRefs.initiativeIds],
      researchIds: [...state.contextRefs.researchIds],
      specChangeIds: [...state.contextRefs.specChangeIds],
      ticketIds: [...state.contextRefs.ticketIds],
      critiqueIds: [...state.contextRefs.critiqueIds],
      docIds: [...state.contextRefs.docIds],
    },
    scopePaths: [...state.scopePaths],
    linkedTickets: linkedTicketSnapshot,
    counts: {
      tickets: linkedTicketSnapshot.length,
      byStatus,
    },
  };
}
