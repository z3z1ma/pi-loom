import { renderBulletList, renderSection, serializeMarkdownArtifact } from "./frontmatter.js";
import type {
  InitiativeOverview,
  InitiativeDecisionRecord,
  InitiativeMilestone,
  InitiativeRecord,
  InitiativeState,
  InitiativeSummary,
} from "./models.js";

function joinNonEmpty(chunks: string[]): string {
  return chunks.filter(Boolean).join("\n\n");
}

function renderLinkedRoadmap(items: InitiativeOverview["linkedRoadmap"]["items"], emptyLabel = "(none)"): string {
  if (items.length === 0) {
    return emptyLabel;
  }
  return items
    .map(
      (item) =>
        `- ${item.id} [${item.horizon}/${item.status}] ${item.title}${item.summary ? ` — ${item.summary}` : ""}`,
    )
    .join("\n");
}

function renderMilestones(milestones: InitiativeMilestone[]): string {
  if (milestones.length === 0) {
    return "(none)";
  }
  return milestones
    .map((milestone) => {
      const lines = [`- ${milestone.id}: ${milestone.title} [${milestone.status}]`];
      if (milestone.description) lines.push(`  Description: ${milestone.description}`);
      if (milestone.specChangeIds.length > 0) lines.push(`  Specs: ${milestone.specChangeIds.join(", ")}`);
      if (milestone.ticketIds.length > 0) lines.push(`  Tickets: ${milestone.ticketIds.join(", ")}`);
      return lines.join("\n");
    })
    .join("\n");
}

function renderDecisions(decisions: InitiativeDecisionRecord[]): string {
  if (decisions.length === 0) {
    return "(none)";
  }
  return decisions
    .map((decision) => `- ${decision.createdAt} [${decision.kind}] ${decision.question} -> ${decision.answer}`)
    .join("\n");
}

function renderRepository(repository: InitiativeSummary["repository"]): string {
  return repository ? ` repo=${repository.slug}` : "";
}

export function renderInitiativeMarkdown(
  state: InitiativeState,
  decisions: InitiativeDecisionRecord[],
  overview: InitiativeOverview,
): string {
  return serializeMarkdownArtifact(
    {
      id: state.initiativeId,
      title: state.title,
      status: state.status,
      "created-at": state.createdAt,
      "updated-at": state.updatedAt,
      owners: state.owners,
      tags: state.tags,
      research: state.researchIds,
      "spec-changes": state.specChangeIds,
      tickets: state.ticketIds,
      capabilities: state.capabilityIds,
      "roadmap-refs": state.roadmapRefs,
    },
    joinNonEmpty([
      renderSection("Objective", state.objective || "(empty)"),
      renderSection("Outcomes", renderBulletList(state.outcomes)),
      renderSection("Scope", renderBulletList(state.scope)),
      renderSection("Non-Goals", renderBulletList(state.nonGoals)),
      renderSection("Success Metrics", renderBulletList(state.successMetrics)),
      renderSection("Status Summary", state.statusSummary || "(empty)"),
      renderSection("Risks", renderBulletList(state.risks)),
      renderSection("Linked Roadmap", renderLinkedRoadmap(overview.linkedRoadmap.items)),
      renderSection("Milestones", renderMilestones(state.milestones)),
      renderSection("Strategic Decisions", renderDecisions(decisions)),
    ]),
  );
}

export function renderInitiativeSummary(summary: InitiativeSummary): string {
  return `${summary.id} [${summary.status}]${renderRepository(summary.repository)} milestones=${summary.milestoneCount} specs=${summary.specChangeCount} tickets=${summary.ticketCount} ${summary.title}`;
}

export function renderInitiativeDetail(record: InitiativeRecord): string {
  return [
    renderInitiativeSummary(record.summary),
    `Owners: ${record.state.owners.join(", ") || "none"}`,
    `Target window: ${record.state.targetWindow ?? "none"}`,
    `Research: ${record.state.researchIds.join(", ") || "none"}`,
    `Capabilities: ${record.state.capabilityIds.join(", ") || "none"}`,
    `Roadmap refs: ${record.state.roadmapRefs.join(", ") || "none"}`,
    `Linked roadmap: ${record.overview.linkedRoadmap.items.map((item) => `${item.id} [${item.horizon}/${item.status}] ${item.title}`).join(", ") || "none"}`,
    `Decisions: ${record.decisions.length}`,
    `Overview research: ${record.overview.linkedResearch.total}`,
    `Overview specs: ${record.overview.linkedSpecs.total}`,
    `Overview tickets: ${record.overview.linkedTickets.total}`,
    `Overview roadmap: ${record.overview.linkedRoadmap.total}`,
    "",
    "Objective:",
    record.state.objective || "(empty)",
  ].join("\n");
}

export function renderInitiativeOverview(overview: InitiativeOverview): string {
  const roadmapLines = renderLinkedRoadmap(overview.linkedRoadmap.items);
  const milestoneLines =
    overview.milestones.length > 0
      ? overview.milestones
          .map((milestone) => `- ${milestone.id} [${milestone.status}/${milestone.health}] ${milestone.title}`)
          .join("\n")
      : "(none)";
  return [
    `${overview.initiative.id} [${overview.initiative.status}]${renderRepository(overview.initiative.repository)} ${overview.initiative.title}`,
    `Research: ${overview.linkedResearch.total}`,
    `Specs: ${overview.linkedSpecs.total}`,
    `Tickets: ${overview.linkedTickets.total}`,
    `Roadmap: ${overview.linkedRoadmap.total}`,
    `Ready tickets: ${overview.linkedTickets.ready}`,
    `Blocked tickets: ${overview.linkedTickets.blocked}`,
    `In-progress tickets: ${overview.linkedTickets.inProgress}`,
    `Open risks: ${overview.openRisks.length}`,
    "",
    "Roadmap:",
    roadmapLines,
    "",
    "Milestones:",
    milestoneLines,
  ].join("\n");
}
