import type { InitiativeState, InitiativeSummary } from "@pi-loom/pi-initiatives/extensions/domain/models.js";
import { SPEC_STATUSES, type SpecChangeSummary } from "@pi-loom/pi-specs/extensions/domain/models.js";
import { createSpecStore } from "@pi-loom/pi-specs/extensions/domain/store.js";
import { findEntityByDisplayId } from "@pi-loom/pi-storage/storage/entities.js";
import { openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import { TICKET_STATUSES, type TicketSummary } from "@pi-loom/pi-ticketing/extensions/domain/models.js";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import type {
  HypothesisConfidence,
  ResearchArtifactKind,
  ResearchArtifactRecord,
  ResearchDashboard,
  ResearchHypothesisRecord,
  ResearchHypothesisStatus,
  ResearchState,
} from "./models.js";
import { normalizeStringList } from "./normalize.js";

function zeroCounts<T extends string>(values: readonly T[]): Record<T, number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
}

function isMissingLinkedRecord(error: unknown, kind: "initiative" | "spec" | "ticket"): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const prefixes =
    kind === "spec" ? [`Unknown ${kind}`, "Invalid change id"] : [`Unknown ${kind}`, `Invalid ${kind} id`];
  return prefixes.some((prefix) => error.message.startsWith(prefix));
}

async function resolveLinkedSummariesAsync<T extends { id: string }>(
  ids: string[],
  load: (id: string) => Promise<T>,
  kind: "initiative" | "spec" | "ticket",
): Promise<{ items: T[]; missingIds: string[] }> {
  const items: T[] = [];
  const missingIds: string[] = [];
  for (const id of normalizeStringList(ids)) {
    try {
      items.push(await load(id));
    } catch (error) {
      if (isMissingLinkedRecord(error, kind)) {
        missingIds.push(id);
        continue;
      }
      throw error;
    }
  }
  return { items, missingIds: normalizeStringList(missingIds) };
}

async function resolveInitiativeSummary(cwd: string, initiativeId: string): Promise<InitiativeSummary> {
  const { storage, identity } = await openWorkspaceStorage(cwd);
  const entity = await findEntityByDisplayId(storage, identity.space.id, "initiative", initiativeId);
  if (entity?.attributes && typeof entity.attributes === "object" && "state" in entity.attributes) {
    const state = (entity.attributes as { state: InitiativeState }).state;
    return {
      id: state.initiativeId,
      title: state.title,
      status: state.status,
      milestoneCount: state.milestones.length,
      specChangeCount: state.specChangeIds.length,
      ticketCount: state.ticketIds.length,
      updatedAt: state.updatedAt,
      tags: [...state.tags],
      ref: `initiative:${state.initiativeId}`,
    };
  }

  if (entity) {
    return {
      id: normalizeStringList([initiativeId])[0] ?? initiativeId,
      title: entity.title,
      status: entity.status as InitiativeSummary["status"],
      milestoneCount: 0,
      specChangeCount: 0,
      ticketCount: 0,
      updatedAt: entity.updatedAt,
      tags: entity.tags,
      ref: `initiative:${initiativeId}`,
    };
  }
  throw new Error(`Unknown initiative: ${initiativeId}`);
}

function buildDashboard(
  state: ResearchState,
  hypotheses: ResearchHypothesisRecord[],
  artifacts: ResearchArtifactRecord[],
  linkedInitiatives: { items: InitiativeSummary[]; missingIds: string[] },
  linkedSpecs: { items: SpecChangeSummary[]; missingIds: string[] },
  linkedTickets: { items: TicketSummary[]; missingIds: string[] },
): ResearchDashboard {
  const hypothesisCounts = zeroCounts<ResearchHypothesisStatus>(["open", "supported", "rejected", "superseded"]);
  const confidenceCounts = zeroCounts<HypothesisConfidence>(["low", "medium", "high"]);
  for (const hypothesis of hypotheses) {
    hypothesisCounts[hypothesis.status] += 1;
    confidenceCounts[hypothesis.confidence] += 1;
  }

  const artifactCounts = zeroCounts<ResearchArtifactKind>([
    "note",
    "experiment",
    "source",
    "dataset",
    "log",
    "summary",
  ]);
  for (const artifact of artifacts) {
    artifactCounts[artifact.kind] += 1;
  }

  const specCounts = zeroCounts(SPEC_STATUSES);
  for (const spec of linkedSpecs.items) {
    specCounts[spec.status] += 1;
  }

  const ticketCounts = zeroCounts(TICKET_STATUSES);
  for (const ticket of linkedTickets.items) {
    ticketCounts[ticket.status] += 1;
  }

  return {
    research: {
      id: state.researchId,
      title: state.title,
      status: state.status,
      question: state.question,
      objective: state.objective,
      statusSummary: state.statusSummary,
      keywords: [...state.keywords],
      tags: [...state.tags],
      updatedAt: state.updatedAt,
    },
    hypotheses: {
      total: hypotheses.length,
      counts: hypothesisCounts,
      confidence: confidenceCounts,
      items: hypotheses,
    },
    artifacts: {
      total: artifacts.length,
      counts: artifactCounts,
      items: artifacts,
    },
    linkedInitiatives: {
      total: linkedInitiatives.items.length,
      items: linkedInitiatives.items,
    },
    linkedSpecs: {
      total: linkedSpecs.items.length,
      counts: specCounts,
      items: linkedSpecs.items,
    },
    linkedTickets: {
      total: linkedTickets.items.length,
      counts: ticketCounts,
      ready: ticketCounts.ready,
      blocked: ticketCounts.blocked,
      inProgress: ticketCounts.in_progress,
      review: ticketCounts.review,
      closed: ticketCounts.closed,
      items: linkedTickets.items,
    },
    conclusions: [...state.conclusions],
    recommendations: [...state.recommendations],
    openQuestions: [...state.openQuestions],
    unresolvedReferences: {
      initiativeIds: linkedInitiatives.missingIds,
      specChangeIds: linkedSpecs.missingIds,
      ticketIds: linkedTickets.missingIds,
    },
  };
}

export async function buildResearchDashboard(
  cwd: string,
  state: ResearchState,
  hypotheses: ResearchHypothesisRecord[],
  artifacts: ResearchArtifactRecord[],
): Promise<ResearchDashboard> {
  const specStore = createSpecStore(cwd);
  const ticketStore = createTicketStore(cwd);

  return buildDashboard(
    state,
    hypotheses,
    artifacts,
    await resolveLinkedSummariesAsync(
      state.initiativeIds,
      async (initiativeId) => resolveInitiativeSummary(cwd, initiativeId),
      "initiative",
    ),
    await resolveLinkedSummariesAsync(
      state.specChangeIds,
      async (changeId) => (await specStore.readChange(changeId)).summary,
      "spec",
    ),
    await resolveLinkedSummariesAsync(
      state.ticketIds,
      async (ticketId) => (await ticketStore.readTicketAsync(ticketId)).summary,
      "ticket",
    ),
  );
}
