import { renderBulletList, renderSection, serializeMarkdownArtifact } from "./frontmatter.js";
import type {
  CritiqueFindingRecord,
  CritiqueLaunchDescriptor,
  CritiqueOverview,
  CritiqueReadResult,
  CritiqueRunRecord,
  CritiqueState,
  CritiqueSummary,
} from "./models.js";
import { isActiveFindingStatus } from "./normalize.js";

function joinNonEmpty(chunks: string[]): string {
  return chunks.filter(Boolean).join("\n\n");
}

function renderFocusAreas(focusAreas: string[]): string {
  return focusAreas.length > 0 ? focusAreas.join(", ") : "none";
}

function renderRepository(summary: CritiqueSummary): string {
  return summary.repository ? ` repo=${summary.repository.slug}` : "";
}

function renderRunList(runs: CritiqueRunRecord[]): string {
  if (runs.length === 0) {
    return "(none)";
  }
  return runs
    .map((run) => `- ${run.id} [${run.kind}/${run.verdict}] fresh=${run.freshContext ? "yes" : "no"} ${run.summary}`)
    .join("\n");
}

function renderFindingList(findings: CritiqueFindingRecord[], onlyActive = false): string {
  const entries = onlyActive ? findings.filter((finding) => isActiveFindingStatus(finding.status)) : findings;
  if (entries.length === 0) {
    return "(none)";
  }
  return entries
    .map(
      (finding) =>
        `- ${finding.id} [${finding.kind}/${finding.severity}/${finding.status}] ${finding.title}${
          finding.linkedTicketId ? ` -> ${finding.linkedTicketId}` : ""
        }`,
    )
    .join("\n");
}

export function renderCritiqueSummary(summary: CritiqueSummary): string {
  return `${summary.id} [${summary.status}/${summary.verdict}]${renderRepository(summary)} ${summary.targetKind}:${summary.targetRef} ${summary.title}`;
}

export function renderCritiqueMarkdown(
  state: CritiqueState,
  runs: CritiqueRunRecord[],
  findings: CritiqueFindingRecord[],
): string {
  const activeFindings = findings.filter((finding) => isActiveFindingStatus(finding.status));
  return serializeMarkdownArtifact(
    {
      id: state.critiqueId,
      title: state.title,
      status: state.status,
      verdict: state.currentVerdict,
      target: `${state.target.kind}:${state.target.ref}`,
      focus: state.focusAreas,
      "updated-at": state.updatedAt,
      "open-findings": state.openFindingIds,
      "followup-tickets": state.followupTicketIds,
    },
    joinNonEmpty([
      renderSection("Review Question", state.reviewQuestion || "(empty)"),
      renderSection("Packet Summary", state.packetSummary || "(empty)"),
      renderSection("Focus Areas", renderFocusAreas(state.focusAreas)),
      renderSection("Scope Refs", renderBulletList(state.scopeRefs)),
      renderSection("Non-Goals", renderBulletList(state.nonGoals)),
      renderSection("Current Verdict", state.currentVerdict),
      renderSection("Top Concerns", renderFindingList(activeFindings)),
      renderSection("Runs", renderRunList(runs)),
      renderSection("All Findings", renderFindingList(findings)),
    ]),
  );
}

export function renderCritiqueDetail(result: CritiqueReadResult): string {
  return [
    renderCritiqueSummary(result.summary),
    `Fresh context required: ${result.state.freshContextRequired ? "yes" : "no"}`,
    `Focus areas: ${renderFocusAreas(result.state.focusAreas)}`,
    `Target locator: ${result.state.target.locator ?? "none"}`,
    `Scope refs: ${result.state.scopeRefs.join(", ") || "none"}`,
    `Open findings: ${result.state.openFindingIds.length}`,
    `Follow-up tickets: ${result.state.followupTicketIds.join(", ") || "none"}`,
    `Runs: ${result.runs.length}`,
    `Findings: ${result.findings.length}`,
    `Last launch: ${result.state.lastLaunchAt ?? "never"}`,
    "",
    "Review question:",
    result.state.reviewQuestion || "(empty)",
  ].join("\n");
}

export function renderLaunchDescriptor(_cwd: string, launch: CritiqueLaunchDescriptor): string {
  return [
    `Critique launch descriptor for ${launch.critiqueId}`,
    `Runtime: ${launch.runtime}`,
    `Packet ref: ${launch.packetRef}`,
    `Target: ${launch.target.kind}:${launch.target.ref}`,
    `Fresh context required: ${launch.freshContextRequired ? "yes" : "no"}`,
    "",
    "Instructions:",
    ...launch.instructions.map((instruction) => `- ${instruction}`),
  ].join("\n");
}

export function renderLaunchPrompt(_cwd: string, launch: CritiqueLaunchDescriptor): string {
  return [
    `Perform the critique described by ${launch.packetRef}.`,
    "",
    "This is a fresh reviewer session. Do not continue the executor's prior line of reasoning.",
    `Target: ${launch.target.kind}:${launch.target.ref}`,
    `Focus areas: ${launch.focusAreas.join(", ") || "none"}`,
    "",
    "Before making judgments:",
    `- Read the critique packet for ${launch.packetRef}.`,
    "- Evaluate the work against its broader constitutional, initiative, research, spec, and ticket context.",
    "- Look for bugs, unsafe assumptions, missing tests, edge cases, architectural drift, and roadmap misalignment.",
    "",
    "When done:",
    `- Record the pass with critique_run ref=${launch.critiqueId}.`,
    `- Record each concrete issue with critique_finding ref=${launch.critiqueId}.`,
    "- Create follow-up tickets only for accepted findings.",
  ].join("\n");
}

export function renderOverview(overview: CritiqueOverview): string {
  return [
    renderCritiqueSummary(overview.critique),
    `Runs: ${overview.counts.runs}`,
    `Findings: ${overview.counts.findings}`,
    `Open findings: ${overview.counts.openFindings}`,
    `Accepted findings: ${overview.counts.acceptedFindings}`,
    `Follow-up tickets: ${overview.followupTicketIds.join(", ") || "none"}`,
    "",
    "Open findings:",
    overview.openFindings.length > 0
      ? overview.openFindings.map((finding) => `- ${finding.id} [${finding.severity}] ${finding.title}`).join("\n")
      : "(none)",
  ].join("\n");
}
