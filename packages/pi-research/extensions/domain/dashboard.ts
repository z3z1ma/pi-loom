import type { InitiativeSummary } from "@pi-loom/pi-initiatives/extensions/domain/models.js";
import { createInitiativeStore } from "@pi-loom/pi-initiatives/extensions/domain/store.js";
import { SPEC_STATUSES, type SpecChangeSummary } from "@pi-loom/pi-specs/extensions/domain/models.js";
import { createSpecStore } from "@pi-loom/pi-specs/extensions/domain/store.js";
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

function zeroCounts<T extends string>(values: readonly T[]): Record<T, number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
}

export function buildResearchDashboard(
  cwd: string,
  state: ResearchState,
  hypotheses: ResearchHypothesisRecord[],
  artifacts: ResearchArtifactRecord[],
): ResearchDashboard {
  const initiativeStore = createInitiativeStore(cwd);
  const specStore = createSpecStore(cwd);
  const ticketStore = createTicketStore(cwd);

  const linkedInitiatives = initiativeStore
    .listInitiatives({ includeArchived: true })
    .filter((summary: InitiativeSummary) => state.initiativeIds.includes(summary.id));
  const linkedSpecs = specStore
    .listChangesProjection({ includeArchived: true })
    .filter((summary: SpecChangeSummary) => state.specChangeIds.includes(summary.id));
  const linkedTickets = ticketStore
    .listTickets({ includeClosed: true })
    .filter((summary: TicketSummary) => state.ticketIds.includes(summary.id));

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
  for (const spec of linkedSpecs) {
    specCounts[spec.status] += 1;
  }

  const ticketCounts = zeroCounts(TICKET_STATUSES);
  for (const ticket of linkedTickets) {
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
      total: linkedInitiatives.length,
      items: linkedInitiatives,
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
    conclusions: [...state.conclusions],
    recommendations: [...state.recommendations],
    openQuestions: [...state.openQuestions],
  };
}
