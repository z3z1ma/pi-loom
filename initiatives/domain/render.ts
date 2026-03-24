import { renderBulletList, renderSection, serializeMarkdownArtifact } from "./frontmatter.js";
import type {
  InitiativeDashboard,
  InitiativeDecisionRecord,
  InitiativeMilestone,
  InitiativeRecord,
  InitiativeState,
  InitiativeSummary,
} from "./models.js";

function joinNonEmpty(chunks: string[]): string {
  return chunks.filter(Boolean).join("\n\n");
}

function renderLinkedRoadmap(items: InitiativeDashboard["linkedRoadmap"]["items"], emptyLabel = "(none)"): string {
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
  dashboard: InitiativeDashboard,
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
      renderSection("Linked Roadmap", renderLinkedRoadmap(dashboard.linkedRoadmap.items)),
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
    `Linked roadmap: ${record.dashboard.linkedRoadmap.items.map((item) => `${item.id} [${item.horizon}/${item.status}] ${item.title}`).join(", ") || "none"}`,
    `Decisions: ${record.decisions.length}`,
    `Dashboard research: ${record.dashboard.linkedResearch.total}`,
    `Dashboard specs: ${record.dashboard.linkedSpecs.total}`,
    `Dashboard tickets: ${record.dashboard.linkedTickets.total}`,
    `Dashboard roadmap: ${record.dashboard.linkedRoadmap.total}`,
    "",
    "Objective:",
    record.state.objective || "(empty)",
  ].join("\n");
}

export function renderInitiativeDashboard(dashboard: InitiativeDashboard): string {
  const roadmapLines = renderLinkedRoadmap(dashboard.linkedRoadmap.items);
  const milestoneLines =
    dashboard.milestones.length > 0
      ? dashboard.milestones
          .map((milestone) => `- ${milestone.id} [${milestone.status}/${milestone.health}] ${milestone.title}`)
          .join("\n")
      : "(none)";
  return [
    `${dashboard.initiative.id} [${dashboard.initiative.status}]${renderRepository(dashboard.initiative.repository)} ${dashboard.initiative.title}`,
    `Research: ${dashboard.linkedResearch.total}`,
    `Specs: ${dashboard.linkedSpecs.total}`,
    `Tickets: ${dashboard.linkedTickets.total}`,
    `Roadmap: ${dashboard.linkedRoadmap.total}`,
    `Ready tickets: ${dashboard.linkedTickets.ready}`,
    `Blocked tickets: ${dashboard.linkedTickets.blocked}`,
    `In-progress tickets: ${dashboard.linkedTickets.inProgress}`,
    `Open risks: ${dashboard.openRisks.length}`,
    "",
    "Roadmap:",
    roadmapLines,
    "",
    "Milestones:",
    milestoneLines,
  ].join("\n");
}
