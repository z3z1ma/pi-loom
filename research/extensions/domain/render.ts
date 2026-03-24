import { renderBulletList, renderSection, serializeMarkdownArtifact } from "./frontmatter.js";
import type {
  ResearchArtifactRecord,
  ResearchDashboard,
  ResearchHypothesisRecord,
  ResearchMap,
  ResearchRecord,
  ResearchState,
  ResearchSummary,
} from "./models.js";

function joinNonEmpty(chunks: string[]): string {
  return chunks.filter(Boolean).join("\n\n");
}

function renderHypotheses(hypotheses: ResearchHypothesisRecord[]): string {
  if (hypotheses.length === 0) {
    return "(none)";
  }
  return hypotheses
    .map((hypothesis) => {
      const evidence = hypothesis.evidence.length > 0 ? `\n  Evidence: ${hypothesis.evidence.join("; ")}` : "";
      const results = hypothesis.results.length > 0 ? `\n  Results: ${hypothesis.results.join("; ")}` : "";
      return `- ${hypothesis.id} [${hypothesis.status}/${hypothesis.confidence}] ${hypothesis.statement}${evidence}${results}`;
    })
    .join("\n");
}

function renderArtifacts(artifacts: ResearchArtifactRecord[]): string {
  if (artifacts.length === 0) {
    return "(none)";
  }
  return artifacts
    .map((artifact) => {
      const linked = artifact.linkedHypothesisIds.length > 0 ? ` (${artifact.linkedHypothesisIds.join(", ")})` : "";
      const source = artifact.sourceUri ? ` — ${artifact.sourceUri}` : "";
      return `- ${artifact.id} [${artifact.kind}] ${artifact.title}${linked}${source}`;
    })
    .join("\n");
}

function renderRepository(summary: ResearchSummary): string {
  return summary.repository ? ` repo=${summary.repository.slug}` : "";
}

export function renderResearchMarkdown(
  state: ResearchState,
  hypotheses: ResearchHypothesisRecord[],
  artifacts: ResearchArtifactRecord[],
): string {
  return serializeMarkdownArtifact(
    {
      id: state.researchId,
      title: state.title,
      status: state.status,
      "created-at": state.createdAt,
      "updated-at": state.updatedAt,
      initiatives: state.initiativeIds,
      specs: state.specChangeIds,
      tickets: state.ticketIds,
      capabilities: state.capabilityIds,
      artifacts: state.artifactIds,
    },
    joinNonEmpty([
      renderSection("Question", state.question || "(empty)"),
      renderSection("Objective", state.objective || "(empty)"),
      renderSection("Status Summary", state.statusSummary || "(empty)"),
      renderSection("Scope", renderBulletList(state.scope)),
      renderSection("Non-Goals", renderBulletList(state.nonGoals)),
      renderSection("Methodology", renderBulletList(state.methodology)),
      renderSection("Keywords", renderBulletList(state.keywords)),
      renderSection("Hypotheses", renderHypotheses(hypotheses)),
      renderSection("Conclusions", renderBulletList(state.conclusions)),
      renderSection("Recommendations", renderBulletList(state.recommendations)),
      renderSection("Open Questions", renderBulletList(state.openQuestions)),
      renderSection(
        "Linked Work",
        renderBulletList([
          ...state.initiativeIds.map((id) => `initiative:${id}`),
          ...state.specChangeIds.map((id) => `spec:${id}`),
          ...state.ticketIds.map((id) => `ticket:${id}`),
        ]),
      ),
      renderSection("Artifacts", renderArtifacts(artifacts)),
    ]),
  );
}

export function renderResearchArtifactMarkdown(
  researchId: string,
  artifact: ResearchArtifactRecord,
  body: string,
): string {
  return serializeMarkdownArtifact(
    {
      id: artifact.id,
      research: researchId,
      kind: artifact.kind,
      title: artifact.title,
      "created-at": artifact.createdAt,
      tags: artifact.tags,
      "linked-hypotheses": artifact.linkedHypothesisIds,
      source: artifact.sourceUri,
    },
    joinNonEmpty([renderSection("Summary", artifact.summary || "(empty)"), renderSection("Body", body || "(empty)")]),
  );
}

export function renderResearchSummary(summary: ResearchSummary): string {
  return `${summary.id} [${summary.status}]${renderRepository(summary)} hypotheses=${summary.hypothesisCount} artifacts=${summary.artifactCount} ${summary.title}`;
}

export function renderResearchDetail(record: ResearchRecord): string {
  return [
    renderResearchSummary(record.summary),
    `Repository: ${
      record.summary.repository
        ? `${record.summary.repository.displayName} [${record.summary.repository.id}]`
        : "(none)"
    }`,
    `Question: ${record.state.question || "(empty)"}`,
    `Objective: ${record.state.objective || "(empty)"}`,
    `Initiatives: ${record.state.initiativeIds.join(", ") || "none"}`,
    `Specs: ${record.state.specChangeIds.join(", ") || "none"}`,
    `Tickets: ${record.state.ticketIds.join(", ") || "none"}`,
    `Hypotheses: ${record.hypotheses.length}`,
    `Artifacts: ${record.artifacts.length}`,
    `Open questions: ${record.state.openQuestions.length}`,
    "",
    "Status summary:",
    record.state.statusSummary || "(empty)",
  ].join("\n");
}

export function renderResearchDashboard(dashboard: ResearchDashboard): string {
  const unresolvedTotal =
    dashboard.unresolvedReferences.initiativeIds.length +
    dashboard.unresolvedReferences.specChangeIds.length +
    dashboard.unresolvedReferences.ticketIds.length;
  return [
    `${dashboard.research.id} [${dashboard.research.status}] ${dashboard.research.title}`,
    `Hypotheses: ${dashboard.hypotheses.total}`,
    `Artifacts: ${dashboard.artifacts.total}`,
    `Initiatives: ${dashboard.linkedInitiatives.total}`,
    `Specs: ${dashboard.linkedSpecs.total}`,
    `Tickets: ${dashboard.linkedTickets.total}`,
    `Open hypotheses: ${dashboard.hypotheses.counts.open}`,
    `Rejected hypotheses: ${dashboard.hypotheses.counts.rejected}`,
    `Blocked tickets: ${dashboard.linkedTickets.blocked}`,
    `Unresolved links: ${unresolvedTotal}`,
    `Open questions: ${dashboard.openQuestions.length}`,
  ].join("\n");
}

export function renderResearchMap(map: ResearchMap): string {
  const nodes = Object.values(map.nodes).sort((left, right) => left.id.localeCompare(right.id));
  const edges = [...map.edges].sort((left, right) =>
    `${left.from}:${left.to}`.localeCompare(`${right.from}:${right.to}`),
  );
  return [
    `Research: ${map.researchId}`,
    `Nodes: ${nodes.length}`,
    ...nodes.map(
      (node) =>
        `- ${node.id} [${node.kind}${node.status ? `/${node.status}` : ""}${node.missing ? "/missing" : ""}] ${node.title}`,
    ),
    `Edges: ${edges.length}`,
    ...edges.map((edge) => `- ${edge.from} -> ${edge.relation} -> ${edge.to}`),
  ].join("\n");
}
