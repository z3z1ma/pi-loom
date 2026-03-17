import type { RoadmapItem } from "@pi-loom/pi-constitution/extensions/domain/models.js";
import { createConstitutionalStore } from "@pi-loom/pi-constitution/extensions/domain/store.js";
import type { ResearchState } from "@pi-loom/pi-research/extensions/domain/models.js";
import { createResearchStore } from "@pi-loom/pi-research/extensions/domain/store.js";
import { SPEC_STATUSES } from "@pi-loom/pi-specs/extensions/domain/models.js";
import { createSpecStore } from "@pi-loom/pi-specs/extensions/domain/store.js";
import { findEntityByDisplayId } from "@pi-loom/pi-storage/storage/entities.js";
import { openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import { TICKET_STATUSES, type TicketSummary } from "@pi-loom/pi-ticketing/extensions/domain/models.js";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import type {
  InitiativeDashboard,
  InitiativeDashboardMilestone,
  InitiativeMilestone,
  InitiativeMilestoneHealth,
  InitiativeState,
} from "./models.js";
import { normalizeStringList } from "./normalize.js";

type InitiativeAwareSpecSummary = Awaited<ReturnType<ReturnType<typeof createSpecStore>["listChanges"]>>[number];
type InitiativeAwareTicketSummary = Awaited<
  ReturnType<ReturnType<typeof createTicketStore>["listTicketsAsync"]>
>[number];

function isUnknownReference(error: unknown, prefix: string): boolean {
  return error instanceof Error && error.message.startsWith(prefix);
}

function zeroCounts<T extends string>(values: readonly T[]): Record<T, number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
}

async function readLinkedRoadmap(
  cwd: string,
  roadmapRefs: string[],
): Promise<{ items: RoadmapItem[]; missingRefs: string[] }> {
  const constitutionalStore = createConstitutionalStore(cwd);
  const roadmapItems = await constitutionalStore.listRoadmapItems({});
  const roadmapById = new Map(roadmapItems.map((item) => [item.id, item]));
  const normalizedRefs = normalizeStringList(roadmapRefs);
  const items: RoadmapItem[] = [];
  const missingRefs: string[] = [];
  for (const roadmapRef of normalizedRefs) {
    const item = roadmapById.get(roadmapRef);
    if (!item) {
      missingRefs.push(roadmapRef);
      continue;
    }
    items.push(item);
  }
  return {
    items: items.sort((left, right) => left.id.localeCompare(right.id)),
    missingRefs: normalizeStringList(missingRefs),
  };
}

async function readLinkedResearch(cwd: string, researchIds: string[]) {
  const { storage, identity } = await openWorkspaceStorage(cwd);
  const linkedResearch = await Promise.all(
    normalizeStringList(researchIds).map(async (researchId) => {
      const entity = await findEntityByDisplayId(storage, identity.space.id, "research", researchId);
      if (!entity) {
        return null;
      }
      const attributes = entity.attributes as Record<string, unknown> | undefined;
      if (attributes && "state" in attributes) {
        const state = attributes.state as ResearchState;
        return {
          id: state.researchId,
          title: state.title,
          status: state.status,
          updatedAt: state.updatedAt,
          path: `.loom/research/${state.researchId}`,
        };
      }
      try {
        const record = await createResearchStore(cwd).readResearch(researchId);
        return {
          id: record.state.researchId,
          title: record.state.title,
          status: record.state.status,
          updatedAt: record.state.updatedAt,
          path: record.summary.path,
        };
      } catch (error) {
        if (isUnknownReference(error, "Unknown research:")) {
          return null;
        }
        throw error;
      }
    }),
  );
  return linkedResearch
    .filter((summary): summary is NonNullable<typeof summary> => summary !== null)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function milestoneHealth(milestone: InitiativeMilestone, linkedTickets: TicketSummary[]): InitiativeMilestoneHealth {
  if (milestone.status === "completed") {
    return "complete";
  }
  if (milestone.status === "blocked") {
    return "at_risk";
  }
  if (linkedTickets.some((ticket) => ticket.status === "blocked")) {
    return "at_risk";
  }
  if (milestone.status === "in_progress") {
    return "active";
  }
  if (linkedTickets.length > 0 && linkedTickets.every((ticket) => ticket.status === "closed")) {
    return "complete";
  }
  return "pending";
}

function buildMilestoneDashboard(
  milestone: InitiativeMilestone,
  ticketsById: Map<string, TicketSummary>,
): InitiativeDashboardMilestone {
  const linkedTickets = milestone.ticketIds
    .map((ticketId) => ticketsById.get(ticketId))
    .filter((ticket): ticket is TicketSummary => ticket !== undefined);
  return {
    id: milestone.id,
    title: milestone.title,
    status: milestone.status,
    health: milestoneHealth(milestone, linkedTickets),
    description: milestone.description,
    specChangeIds: [...milestone.specChangeIds],
    ticketIds: [...milestone.ticketIds],
    linkedOpenTicketCount: linkedTickets.filter((ticket) => ticket.status !== "closed").length,
    linkedCompletedTicketCount: linkedTickets.filter((ticket) => ticket.status === "closed").length,
  };
}

function buildDashboardFromRelatedState(
  state: InitiativeState,
  linkedRoadmap: { items: RoadmapItem[]; missingRefs: string[] },
  allRoadmapItems: RoadmapItem[],
  linkedResearch: InitiativeDashboard["linkedResearch"]["items"],
  allSpecs: InitiativeAwareSpecSummary[],
  allTickets: InitiativeAwareTicketSummary[],
  linkedSpecsInput: InitiativeAwareSpecSummary[] = allSpecs.filter((summary) =>
    state.specChangeIds.includes(summary.id),
  ),
  linkedTicketsInput: InitiativeAwareTicketSummary[] = allTickets.filter((summary) =>
    state.ticketIds.includes(summary.id),
  ),
): InitiativeDashboard {
  const linkedSpecs = linkedSpecsInput;
  const missingSpecIds = state.specChangeIds.filter((id) => !linkedSpecs.some((summary) => summary.id === id));
  const specCounts = zeroCounts(SPEC_STATUSES);
  for (const spec of linkedSpecs) {
    specCounts[spec.status] += 1;
  }

  const linkedTickets = linkedTicketsInput;
  const missingTicketIds = state.ticketIds.filter((id) => !linkedTickets.some((summary) => summary.id === id));
  const ticketCounts = zeroCounts(TICKET_STATUSES);
  for (const ticket of linkedTickets) {
    ticketCounts[ticket.status] += 1;
  }
  const ticketsById = new Map(linkedTickets.map((ticket) => [ticket.id, ticket]));

  const unlinkedSpecIds = normalizeStringList([
    ...allSpecs
      .filter((summary) => summary.initiativeIds.includes(state.initiativeId))
      .map((summary) => summary.id)
      .filter((id) => !state.specChangeIds.includes(id)),
    ...missingSpecIds,
  ]);
  const unlinkedTicketIds = normalizeStringList([
    ...allTickets
      .filter((summary) => summary.initiativeIds.includes(state.initiativeId))
      .map((summary) => summary.id)
      .filter((id) => !state.ticketIds.includes(id)),
    ...missingTicketIds,
  ]);
  const unlinkedRoadmapRefs = normalizeStringList([
    ...allRoadmapItems
      .filter((item) => item.initiativeIds.includes(state.initiativeId))
      .map((item) => item.id)
      .filter((id) => !state.roadmapRefs.includes(id)),
    ...linkedRoadmap.missingRefs,
  ]);

  return {
    initiative: {
      id: state.initiativeId,
      title: state.title,
      status: state.status,
      objective: state.objective,
      statusSummary: state.statusSummary,
      targetWindow: state.targetWindow,
      owners: [...state.owners],
      tags: [...state.tags],
      capabilityIds: [...state.capabilityIds],
      roadmapRefs: [...state.roadmapRefs],
      updatedAt: state.updatedAt,
    },
    linkedRoadmap: {
      total: linkedRoadmap.items.length,
      items: linkedRoadmap.items.map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        horizon: item.horizon,
        summary: item.summary,
        updatedAt: item.updatedAt,
      })),
    },
    linkedResearch: {
      total: linkedResearch.length,
      items: linkedResearch,
    },
    linkedSpecs: {
      total: linkedSpecs.length,
      counts: specCounts,
      items: linkedSpecs,
    },
    linkedTickets: {
      total: linkedTickets.length,
      counts: ticketCounts,
      ready: ticketCounts.ready,
      blocked: ticketCounts.blocked,
      inProgress: ticketCounts.in_progress,
      review: ticketCounts.review,
      closed: ticketCounts.closed,
      items: linkedTickets,
    },
    milestones: state.milestones.map((milestone) => buildMilestoneDashboard(milestone, ticketsById)),
    openRisks: [...state.risks],
    unlinkedReferences: {
      roadmapRefs: unlinkedRoadmapRefs,
      specChangeIds: unlinkedSpecIds,
      ticketIds: unlinkedTicketIds,
    },
  };
}

export async function buildInitiativeDashboard(cwd: string, state: InitiativeState): Promise<InitiativeDashboard> {
  const constitutionalStore = createConstitutionalStore(cwd);
  const specStore = createSpecStore(cwd);
  const ticketStore = createTicketStore(cwd);
  const [linkedRoadmap, linkedResearch, allRoadmapItems, allSpecs, allTickets] = await Promise.all([
    readLinkedRoadmap(cwd, state.roadmapRefs),
    readLinkedResearch(cwd, state.researchIds),
    constitutionalStore.listRoadmapItems({}),
    specStore.listChanges({ includeArchived: true }),
    ticketStore.listTicketsAsync({ includeClosed: true }),
  ]);

  return buildDashboardFromRelatedState(state, linkedRoadmap, allRoadmapItems, linkedResearch, allSpecs, allTickets);
}
