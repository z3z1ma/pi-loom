import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { RoadmapItem } from "@pi-loom/pi-constitution/extensions/domain/models.js";
import { createConstitutionalStore } from "@pi-loom/pi-constitution/extensions/domain/store.js";
import type { SpecChangeSummary } from "@pi-loom/pi-specs/extensions/domain/models.js";
import { SPEC_STATUSES } from "@pi-loom/pi-specs/extensions/domain/models.js";
import { createSpecStore } from "@pi-loom/pi-specs/extensions/domain/store.js";
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

type InitiativeAwareSpecSummary = SpecChangeSummary & { initiativeIds?: string[] };
type InitiativeAwareTicketSummary = TicketSummary & { initiativeIds?: string[] };

function relativeOrAbsolute(cwd: string, filePath: string): string {
  const relativePath = relative(cwd, filePath);
  return relativePath || filePath;
}

function zeroCounts<T extends string>(values: readonly T[]): Record<T, number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
}

function readLinkedRoadmap(cwd: string, roadmapRefs: string[]): RoadmapItem[] {
  const constitutionalStore = createConstitutionalStore(cwd);
  return roadmapRefs
    .map((roadmapRef) => constitutionalStore.readRoadmapItem(roadmapRef))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function readLinkedResearch(cwd: string, researchIds: string[]) {
  return researchIds
    .map((researchId) => {
      const statePath = join(cwd, ".loom", "research", researchId, "state.json");
      if (!existsSync(statePath)) {
        return null;
      }
      const researchDir = join(cwd, ".loom", "research", researchId);
      const state = JSON.parse(readFileSync(statePath, "utf-8")) as {
        researchId: string;
        title: string;
        status: string;
        updatedAt: string;
      };
      return {
        id: state.researchId,
        title: state.title,
        status: state.status,
        updatedAt: state.updatedAt,
        path: relativeOrAbsolute(cwd, researchDir),
      };
    })
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

export function buildInitiativeDashboard(cwd: string, state: InitiativeState): InitiativeDashboard {
  const constitutionalStore = createConstitutionalStore(cwd);
  const specStore = createSpecStore(cwd);
  const ticketStore = createTicketStore(cwd);
  const linkedRoadmap = readLinkedRoadmap(cwd, state.roadmapRefs);
  const linkedResearch = readLinkedResearch(cwd, state.researchIds);

  const allSpecs = specStore.listChanges({ includeArchived: true }) as InitiativeAwareSpecSummary[];
  const linkedSpecs = allSpecs.filter((summary) => state.specChangeIds.includes(summary.id));
  const specCounts = zeroCounts(SPEC_STATUSES);
  for (const spec of linkedSpecs) {
    specCounts[spec.status] += 1;
  }

  const allTickets = ticketStore.listTickets({ includeClosed: true }) as InitiativeAwareTicketSummary[];
  const linkedTickets = allTickets.filter((summary) => state.ticketIds.includes(summary.id));
  const ticketCounts = zeroCounts(TICKET_STATUSES);
  for (const ticket of linkedTickets) {
    ticketCounts[ticket.status] += 1;
  }
  const ticketsById = new Map(linkedTickets.map((ticket) => [ticket.id, ticket]));

  const unlinkedSpecIds = normalizeStringList(
    allSpecs
      .filter((summary) => summary.initiativeIds?.includes(state.initiativeId))
      .map((summary) => summary.id)
      .filter((id) => !state.specChangeIds.includes(id)),
  );
  const unlinkedTicketIds = normalizeStringList(
    allTickets
      .filter((summary) => summary.initiativeIds?.includes(state.initiativeId))
      .map((summary) => summary.id)
      .filter((id) => !state.ticketIds.includes(id)),
  );
  const unlinkedRoadmapRefs = normalizeStringList(
    constitutionalStore
      .listRoadmapItems()
      .filter((item) => item.initiativeIds.includes(state.initiativeId))
      .map((item) => item.id)
      .filter((id) => !state.roadmapRefs.includes(id)),
  );

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
      total: linkedRoadmap.length,
      items: linkedRoadmap.map((item) => ({
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
