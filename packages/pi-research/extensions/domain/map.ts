import type { InitiativeState, InitiativeSummary } from "@pi-loom/pi-initiatives/extensions/domain/models.js";
import type { SpecChangeSummary } from "@pi-loom/pi-specs/extensions/domain/models.js";
import { createSpecStore } from "@pi-loom/pi-specs/extensions/domain/store.js";
import { findEntityByDisplayId } from "@pi-loom/pi-storage/storage/entities.js";
import { openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import type { TicketSummary } from "@pi-loom/pi-ticketing/extensions/domain/models.js";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import type { ResearchArtifactRecord, ResearchHypothesisRecord, ResearchMap, ResearchState } from "./models.js";
import { currentTimestamp, normalizeStringList } from "./normalize.js";

function isMissingLinkedRecord(error: unknown, kind: "initiative" | "spec" | "ticket"): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const prefixes =
    kind === "spec" ? [`Unknown ${kind}`, "Invalid change id"] : [`Unknown ${kind}`, `Invalid ${kind} id`];
  return prefixes.some((prefix) => error.message.startsWith(prefix));
}

async function loadLinkedSummaryMaps(
  cwd: string,
  state: ResearchState,
): Promise<{
  initiatives: Map<string, InitiativeSummary>;
  missingInitiatives: Set<string>;
  specs: Map<string, SpecChangeSummary>;
  missingSpecs: Set<string>;
  tickets: Map<string, TicketSummary>;
  missingTickets: Set<string>;
}> {
  const specStore = createSpecStore(cwd);
  const ticketStore = createTicketStore(cwd);
  const initiatives = new Map<string, InitiativeSummary>();
  const missingInitiatives = new Set<string>();
  for (const initiativeId of normalizeStringList(state.initiativeIds)) {
    try {
      initiatives.set(initiativeId, await resolveInitiativeSummary(cwd, initiativeId));
    } catch (error) {
      if (isMissingLinkedRecord(error, "initiative")) {
        missingInitiatives.add(initiativeId);
        continue;
      }
      throw error;
    }
  }

  const specs = new Map<string, SpecChangeSummary>();
  const missingSpecs = new Set<string>();
  for (const changeId of normalizeStringList(state.specChangeIds)) {
    try {
      specs.set(changeId, (await specStore.readChange(changeId)).summary);
    } catch (error) {
      if (isMissingLinkedRecord(error, "spec")) {
        missingSpecs.add(changeId);
        continue;
      }
      throw error;
    }
  }

  const tickets = new Map<string, TicketSummary>();
  const missingTickets = new Set<string>();
  for (const ticketId of normalizeStringList(state.ticketIds)) {
    try {
      tickets.set(ticketId, (await ticketStore.readTicketAsync(ticketId)).summary);
    } catch (error) {
      if (isMissingLinkedRecord(error, "ticket")) {
        missingTickets.add(ticketId);
        continue;
      }
      throw error;
    }
  }

  return { initiatives, missingInitiatives, specs, missingSpecs, tickets, missingTickets };
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
      path: `.loom/initiatives/${state.initiativeId}`,
    };
  }

  if (entity) {
    return {
      id: initiativeId,
      title: entity.title,
      status: entity.status as InitiativeSummary["status"],
      milestoneCount: 0,
      specChangeCount: 0,
      ticketCount: 0,
      updatedAt: entity.updatedAt,
      tags: entity.tags,
      path: `.loom/initiatives/${initiativeId}`,
    };
  }
  throw new Error(`Unknown initiative: ${initiativeId}`);
}

function buildResearchMapFromSummaries(
  state: ResearchState,
  hypotheses: ResearchHypothesisRecord[],
  artifacts: ResearchArtifactRecord[],
  initiatives: Map<string, InitiativeSummary>,
  missingInitiatives: Set<string>,
  specs: Map<string, SpecChangeSummary>,
  missingSpecs: Set<string>,
  tickets: Map<string, TicketSummary>,
  missingTickets: Set<string>,
): ResearchMap {
  const nodes: ResearchMap["nodes"] = {
    [state.researchId]: {
      id: state.researchId,
      kind: "research",
      title: state.title,
      status: state.status,
      path: `.loom/research/${state.researchId}/research.md`,
      missing: false,
    },
  };
  const edges: ResearchMap["edges"] = [];

  for (const initiativeId of normalizeStringList(state.initiativeIds)) {
    const initiative = initiatives.get(initiativeId);
    nodes[`initiative:${initiativeId}`] = {
      id: `initiative:${initiativeId}`,
      kind: "initiative",
      title: initiative?.title ?? `Missing initiative: ${initiativeId}`,
      status: initiative?.status ?? null,
      path: `.loom/initiatives/${initiativeId}/initiative.md`,
      missing: missingInitiatives.has(initiativeId) || initiative === undefined,
    };
    edges.push({ from: state.researchId, to: `initiative:${initiativeId}`, relation: "links_initiative" });
  }

  for (const changeId of normalizeStringList(state.specChangeIds)) {
    const change = specs.get(changeId);
    nodes[`spec:${changeId}`] = {
      id: `spec:${changeId}`,
      kind: "spec",
      title: change?.title ?? `Missing spec: ${changeId}`,
      status: change?.status ?? null,
      path: `.loom/specs/changes/${changeId}/proposal.md`,
      missing: missingSpecs.has(changeId) || change === undefined,
    };
    edges.push({ from: state.researchId, to: `spec:${changeId}`, relation: "links_spec" });
  }

  for (const ticketId of normalizeStringList(state.ticketIds)) {
    const ticket = tickets.get(ticketId);
    nodes[`ticket:${ticketId}`] = {
      id: `ticket:${ticketId}`,
      kind: "ticket",
      title: ticket?.title ?? `Missing ticket: ${ticketId}`,
      status: ticket?.status ?? null,
      path: ticket?.path ?? `.loom/tickets/${ticketId}.md`,
      missing: missingTickets.has(ticketId) || ticket === undefined,
    };
    edges.push({ from: state.researchId, to: `ticket:${ticketId}`, relation: "links_ticket" });
  }

  for (const hypothesis of hypotheses) {
    nodes[hypothesis.id] = {
      id: hypothesis.id,
      kind: "hypothesis",
      title: hypothesis.statement,
      status: hypothesis.status,
      path: `.loom/research/${state.researchId}/hypotheses.jsonl`,
      missing: false,
    };
    edges.push({ from: state.researchId, to: hypothesis.id, relation: "tracks_hypothesis" });
  }

  for (const artifact of artifacts) {
    nodes[artifact.id] = {
      id: artifact.id,
      kind: "artifact",
      title: artifact.title,
      status: artifact.kind,
      path: artifact.path,
      missing: false,
    };
    edges.push({ from: state.researchId, to: artifact.id, relation: "contains_artifact" });
    for (const hypothesisId of artifact.linkedHypothesisIds) {
      edges.push({ from: artifact.id, to: hypothesisId, relation: "supports_hypothesis" });
    }
  }

  return {
    researchId: state.researchId,
    nodes,
    edges,
    generatedAt: currentTimestamp(),
  };
}

export async function buildResearchMap(
  cwd: string,
  state: ResearchState,
  hypotheses: ResearchHypothesisRecord[],
  artifacts: ResearchArtifactRecord[],
): Promise<ResearchMap> {
  const linked = await loadLinkedSummaryMaps(cwd, state);
  return buildResearchMapFromSummaries(
    state,
    hypotheses,
    artifacts,
    linked.initiatives,
    linked.missingInitiatives,
    linked.specs,
    linked.missingSpecs,
    linked.tickets,
    linked.missingTickets,
  );
}
