import { renderBulletList, renderSection, serializeMarkdownArtifact } from "./frontmatter.js";
import type {
  ConstitutionalEntry,
  ConstitutionalOverview,
  ConstitutionalRecord,
  ConstitutionalState,
  ConstitutionDecisionRecord,
  RoadmapItem,
} from "./models.js";

function joinNonEmpty(chunks: string[]): string {
  return chunks.filter(Boolean).join("\n\n");
}

function renderEntries(entries: ConstitutionalEntry[], emptyLabel: string): string {
  if (entries.length === 0) {
    return emptyLabel;
  }
  return entries
    .map((entry) => {
      const lines = [`- ${entry.id}: ${entry.title}`, `  Summary: ${entry.summary}`];
      if (entry.rationale) {
        lines.push(`  Rationale: ${entry.rationale}`);
      }
      return lines.join("\n");
    })
    .join("\n");
}

function renderRoadmapItems(items: RoadmapItem[]): string {
  if (items.length === 0) {
    return "(none)";
  }
  return items
    .map((item) => {
      const lines = [`- ${item.id} [${item.horizon}/${item.status}] ${item.title}`];
      if (item.summary) lines.push(`  Summary: ${item.summary}`);
      if (item.rationale) lines.push(`  Rationale: ${item.rationale}`);
      if (item.initiativeIds.length > 0) lines.push(`  Initiatives: ${item.initiativeIds.join(", ")}`);
      if (item.researchIds.length > 0) lines.push(`  Research: ${item.researchIds.join(", ")}`);
      if (item.specChangeIds.length > 0) lines.push(`  Specs: ${item.specChangeIds.join(", ")}`);
      return lines.join("\n");
    })
    .join("\n");
}

function renderDecisions(decisions: ConstitutionDecisionRecord[]): string {
  if (decisions.length === 0) {
    return "(none)";
  }
  return decisions
    .map((decision) => {
      const lines = [`- ${decision.createdAt} [${decision.kind}] ${decision.question}`, `  Answer: ${decision.answer}`];
      if (decision.affectedArtifacts.length > 0) {
        lines.push(`  Affects: ${decision.affectedArtifacts.join(", ")}`);
      }
      return lines.join("\n");
    })
    .join("\n");
}

function roadmapItemsByHorizon(items: RoadmapItem[], horizon: RoadmapItem["horizon"]): RoadmapItem[] {
  return items.filter((item) => item.horizon === horizon);
}

function summarizeEntry(entry: ConstitutionalEntry): string {
  return `- ${entry.title}: ${entry.summary}`;
}

function summarizeRoadmapItem(item: RoadmapItem): string {
  return `- ${item.id} [${item.horizon}/${item.status}] ${item.title}${item.summary ? ` — ${item.summary}` : ""}`;
}

export function renderConstitutionalBrief(state: ConstitutionalState): string {
  const activeItems = state.roadmapItems.filter((item) => item.status === "active");
  return `${[
    `# ${state.title} Constitutional Brief`,
    "",
    "This artifact is the compact AI-facing constitutional memory for the project. It is distinct from AGENTS.md, which remains operational guidance.",
    "",
    "## Vision",
    state.visionSummary || "(vision not established)",
    "",
    "## Guiding Principles",
    state.principles.length > 0 ? state.principles.map(summarizeEntry).join("\n") : "(no guiding principles recorded)",
    "",
    "## Architectural and Business Constraints",
    state.constraints.length > 0 ? state.constraints.map(summarizeEntry).join("\n") : "(no constraints recorded)",
    "",
    "## Strategic Direction",
    state.strategicDirectionSummary || "(strategic direction not established)",
    "",
    "## Current Focus",
    state.currentFocus.length > 0 ? renderBulletList(state.currentFocus) : "(no current focus recorded)",
    "",
    "## Active Roadmap Items",
    activeItems.length > 0 ? activeItems.map(summarizeRoadmapItem).join("\n") : "(no active roadmap items)",
    "",
    "## Open Constitutional Questions",
    state.openConstitutionQuestions.length > 0
      ? renderBulletList(state.openConstitutionQuestions)
      : "(no open constitutional questions)",
  ]
    .join("\n")
    .trimEnd()}\n`;
}

export function renderVisionMarkdown(state: ConstitutionalState): string {
  return serializeMarkdownArtifact(
    {
      id: state.projectId,
      title: state.title,
      "updated-at": state.updatedAt,
      completeness: state.completeness.vision ? "complete" : "incomplete",
    },
    joinNonEmpty([
      renderSection("Vision Summary", state.visionSummary || "(not yet defined)"),
      renderSection("Vision Narrative", state.visionNarrative || "(not yet defined)"),
    ]),
  );
}

export function renderPrinciplesMarkdown(state: ConstitutionalState): string {
  return serializeMarkdownArtifact(
    {
      project: state.projectId,
      count: String(state.principles.length),
      "updated-at": state.updatedAt,
    },
    joinNonEmpty([
      renderSection("Guiding Principles", renderEntries(state.principles, "(no guiding principles recorded yet)")),
    ]),
  );
}

export function renderConstraintsMarkdown(state: ConstitutionalState): string {
  return serializeMarkdownArtifact(
    {
      project: state.projectId,
      count: String(state.constraints.length),
      "updated-at": state.updatedAt,
    },
    joinNonEmpty([
      renderSection(
        "Architectural and Business Constraints",
        renderEntries(state.constraints, "(no constraints recorded yet)"),
      ),
    ]),
  );
}

export function renderRoadmapMarkdown(state: ConstitutionalState, decisions: ConstitutionDecisionRecord[]): string {
  return serializeMarkdownArtifact(
    {
      project: state.projectId,
      items: String(state.roadmapItems.length),
      "updated-at": state.updatedAt,
    },
    joinNonEmpty([
      renderSection("Strategic Direction", state.strategicDirectionSummary || "(not yet defined)"),
      renderSection("Current Focus", renderBulletList(state.currentFocus, "(no current focus recorded)")),
      renderSection("Now", renderRoadmapItems(roadmapItemsByHorizon(state.roadmapItems, "now"))),
      renderSection("Next", renderRoadmapItems(roadmapItemsByHorizon(state.roadmapItems, "next"))),
      renderSection("Later", renderRoadmapItems(roadmapItemsByHorizon(state.roadmapItems, "later"))),
      renderSection("Recent Constitutional Decisions", renderDecisions(decisions.slice(-10))),
    ]),
  );
}

export function renderRoadmapItemMarkdown(projectTitle: string, item: RoadmapItem): string {
  return serializeMarkdownArtifact(
    {
      id: item.id,
      project: projectTitle,
      status: item.status,
      horizon: item.horizon,
      "updated-at": item.updatedAt,
      initiatives: item.initiativeIds,
      research: item.researchIds,
      "spec-changes": item.specChangeIds,
    },
    joinNonEmpty([
      renderSection("Title", item.title),
      renderSection("Summary", item.summary || "(empty)"),
      renderSection("Rationale", item.rationale || "(empty)"),
      renderSection("Linked Initiatives", renderBulletList(item.initiativeIds, "(none)")),
      renderSection("Linked Research", renderBulletList(item.researchIds, "(none)")),
      renderSection("Linked Spec Changes", renderBulletList(item.specChangeIds, "(none)")),
    ]),
  );
}

export function renderConstitutionSummary(record: ConstitutionalRecord): string {
  return `${record.state.projectId} completeness=${Object.values(record.state.completeness).filter(Boolean).length}/${Object.keys(record.state.completeness).length} roadmap=${record.state.roadmapItems.length} ${record.state.title}`;
}

export function renderRoadmapItemDetail(item: RoadmapItem): string {
  return [
    `${item.id} [${item.horizon}/${item.status}] ${item.title}`,
    `Initiatives: ${item.initiativeIds.join(", ") || "none"}`,
    `Research: ${item.researchIds.join(", ") || "none"}`,
    `Specs: ${item.specChangeIds.join(", ") || "none"}`,
    "",
    "Summary:",
    item.summary || "(empty)",
    "",
    "Rationale:",
    item.rationale || "(empty)",
  ].join("\n");
}

export function renderConstitutionDetail(record: ConstitutionalRecord): string {
  return [
    renderConstitutionSummary(record),
    `Vision complete: ${record.state.completeness.vision ? "yes" : "no"}`,
    `Principles: ${record.state.principles.length}`,
    `Constraints: ${record.state.constraints.length}`,
    `Roadmap items: ${record.state.roadmapItems.length}`,
    `Initiatives linked: ${record.state.initiativeIds.length}`,
    `Research linked: ${record.state.researchIds.length}`,
    `Specs linked: ${record.state.specChangeIds.length}`,
    `Open questions: ${record.state.openConstitutionQuestions.length}`,
    "",
    "Vision Summary:",
    record.state.visionSummary || "(not yet defined)",
    "",
    "Strategic Direction:",
    record.state.strategicDirectionSummary || "(not yet defined)",
  ].join("\n");
}

export function renderConstitutionOverview(overview: ConstitutionalOverview): string {
  return [
    `${overview.project.projectId} ${overview.project.title}`,
    `Vision complete: ${overview.completeness.vision ? "yes" : "no"}`,
    `Principles: ${overview.principles.length}`,
    `Constraints: ${overview.constraints.length}`,
    `Roadmap items: ${overview.roadmap.total}`,
    `Active roadmap items: ${overview.roadmap.activeItemIds.length}`,
    `Linked initiatives: ${overview.linkedWork.initiativeIds.length}`,
    `Linked research: ${overview.linkedWork.researchIds.length}`,
    `Linked specs: ${overview.linkedWork.specChangeIds.length}`,
    "",
    "Current Focus:",
    overview.project.currentFocus.length > 0 ? renderBulletList(overview.project.currentFocus) : "(none)",
  ].join("\n");
}
