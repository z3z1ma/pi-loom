import { createInitiativeStore } from "@pi-loom/pi-initiatives/extensions/domain/store.js";
import { createSpecStore } from "@pi-loom/pi-specs/extensions/domain/store.js";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import type { ResearchArtifactRecord, ResearchHypothesisRecord, ResearchMap, ResearchState } from "./models.js";
import { currentTimestamp } from "./normalize.js";

export function buildResearchMap(
  cwd: string,
  state: ResearchState,
  hypotheses: ResearchHypothesisRecord[],
  artifacts: ResearchArtifactRecord[],
): ResearchMap {
  const initiativeStore = createInitiativeStore(cwd);
  const specStore = createSpecStore(cwd);
  const ticketStore = createTicketStore(cwd);

  const nodes: ResearchMap["nodes"] = {
    [state.researchId]: {
      id: state.researchId,
      kind: "research",
      title: state.title,
      status: state.status,
      path: `.loom/research/${state.researchId}/research.md`,
    },
  };
  const edges: ResearchMap["edges"] = [];

  for (const initiativeId of state.initiativeIds) {
    const initiative = initiativeStore.readInitiativeProjection(initiativeId);
    nodes[`initiative:${initiativeId}`] = {
      id: `initiative:${initiativeId}`,
      kind: "initiative",
      title: initiative.state.title,
      status: initiative.state.status,
      path: `.loom/initiatives/${initiativeId}/initiative.md`,
    };
    edges.push({ from: state.researchId, to: `initiative:${initiativeId}`, relation: "links_initiative" });
  }

  for (const changeId of state.specChangeIds) {
    const change = specStore.readChangeProjection(changeId);
    nodes[`spec:${changeId}`] = {
      id: `spec:${changeId}`,
      kind: "spec",
      title: change.state.title,
      status: change.state.status,
      path: `.loom/specs/changes/${changeId}/proposal.md`,
    };
    edges.push({ from: state.researchId, to: `spec:${changeId}`, relation: "links_spec" });
  }

  for (const ticketId of state.ticketIds) {
    const ticket = ticketStore.readTicket(ticketId);
    nodes[`ticket:${ticketId}`] = {
      id: `ticket:${ticketId}`,
      kind: "ticket",
      title: ticket.summary.title,
      status: ticket.summary.status,
      path: ticket.summary.path,
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
