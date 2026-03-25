import type { LoomRepositoryQualifier } from "#storage/repository-qualifier.js";
import type { PlanOverview, PlanOverviewTicket, PlanState, PlanSummary } from "./models.js";

export function getPlanRef(state: PlanState): string {
  return `plan:${state.planId}`;
}

export function getPlanPacketRef(state: PlanState): string {
  return `${getPlanRef(state)}:packet`;
}

export function getPlanDocumentRef(state: PlanState): string {
  return `${getPlanRef(state)}:document`;
}

export function getPlanTicketRef(ticketId: string): string {
  return `ticket:${ticketId}`;
}

export function summarizePlan(state: PlanState, repository: LoomRepositoryQualifier | null = null): PlanSummary {
  return {
    id: state.planId,
    title: state.title,
    status: state.status,
    updatedAt: state.updatedAt,
    repository,
    sourceKind: state.sourceTarget.kind,
    sourceRef: state.sourceTarget.ref,
    linkedTicketCount: state.linkedTickets.length,
    summary: state.summary,
    ref: getPlanRef(state),
  };
}

export function buildPlanOverview(
  state: PlanState,
  linkedTickets: PlanOverviewTicket[],
  repository: LoomRepositoryQualifier | null = null,
): PlanOverview {
  const linkedTicketSnapshot = linkedTickets.map((ticket) => ({ ...ticket }));
  const byStatus = linkedTicketSnapshot.reduce<Record<string, number>>((acc, ticket) => {
    acc[ticket.status] = (acc[ticket.status] ?? 0) + 1;
    return acc;
  }, {});
  return {
    plan: {
      ...summarizePlan(state, repository),
      linkedTicketCount: linkedTicketSnapshot.length,
    },
    packetRef: getPlanPacketRef(state),
    planRef: getPlanDocumentRef(state),
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
