import { getDocumentationPacketRef } from "./dashboard.js";
import { serializeMarkdownArtifact } from "./frontmatter.js";
import type {
  DocumentationDashboard,
  DocumentationReadResult,
  DocumentationState,
  DocumentationSummary,
} from "./models.js";
import { extractMarkdownSections } from "./normalize.js";

function renderAudience(audience: string[]): string {
  return audience.length > 0 ? audience.join(", ") : "none";
}

export function renderDocumentationSummary(summary: DocumentationSummary): string {
  return `${summary.id} [${summary.status}/${summary.docType}] ${summary.title}`;
}

export function renderDocumentationMarkdown(state: DocumentationState, body: string): string {
  return serializeMarkdownArtifact(
    {
      id: state.docId,
      title: state.title,
      status: state.status,
      type: state.docType,
      section: state.sectionGroup,
      audience: state.audience,
      source: `${state.sourceTarget.kind}:${state.sourceTarget.ref}`,
      "updated-at": state.updatedAt,
      topics: state.guideTopics,
      outputs: state.linkedOutputPaths,
    },
    body.trim(),
  );
}

export function renderDocumentationDetail(result: DocumentationReadResult): string {
  return [
    renderDocumentationSummary(result.summary),
    `Audience: ${renderAudience(result.state.audience)}`,
    `Source target: ${result.state.sourceTarget.kind}:${result.state.sourceTarget.ref}`,
    `Scope paths: ${result.state.scopePaths.join(", ") || "none"}`,
    `Guide topics: ${result.state.guideTopics.join(", ") || "none"}`,
    `Linked outputs: ${result.state.linkedOutputPaths.join(", ") || "none"}`,
    `Revisions: ${result.revisions.length}`,
    `Last revision: ${result.state.lastRevisionId ?? "none"}`,
    "",
    "Summary:",
    result.state.summary || "(empty)",
  ].join("\n");
}

export function renderDashboard(dashboard: DocumentationDashboard): string {
  return [
    renderDocumentationSummary(dashboard.doc),
    `Revisions: ${dashboard.revisionCount}`,
    `Audience: ${renderAudience(dashboard.audience)}`,
    `Topics: ${dashboard.guideTopics.join(", ") || "none"}`,
    `Linked outputs: ${dashboard.linkedOutputPaths.join(", ") || "none"}`,
    `Last revision: ${dashboard.lastRevision?.id ?? "none"}`,
  ].join("\n");
}

export function renderUpdateDescriptor(_cwd: string, state: DocumentationState): string {
  const packetRef = getDocumentationPacketRef(state);
  return [
    `Documentation update handoff for ${state.docId}`,
    `Type: ${state.docType}`,
    `Section group: ${state.sectionGroup}`,
    `Packet ref: ${packetRef}`,
    `Update reason: ${state.updateReason || "(empty)"}`,
    "",
    "The fresh maintainer should persist the revision through docs_write.",
  ].join("\n");
}

export function renderUpdatePrompt(_cwd: string, state: DocumentationState): string {
  const packetRef = getDocumentationPacketRef(state);
  return [
    `Perform the documentation maintenance described in ${packetRef}.`,
    "",
    "This is a fresh documentation-maintainer session. Do not continue the executor's prior reasoning.",
    `Target document: ${state.docId} (${state.docType})`,
    `Audience: ${renderAudience(state.audience)}`,
    `Update reason: ${state.updateReason || "(empty)"}`,
    "",
    "Before writing:",
    `- Read ${packetRef}.`,
    "- Keep the document high-level and explanatory for humans and AI memory.",
    "- Do not generate API reference documentation.",
    "- Describe completed reality, not plans that have not landed.",
    "",
    "When ready:",
    `- Call docs_write with action=update and ref=${state.docId}.`,
    "- Pass document as markdown body only; do not include YAML frontmatter because docs_write renders the canonical artifact.",
    "- Pass a short summary and changedSections that reflect what actually changed.",
    "- Reuse the current update reason unless the packet makes a more truthful phrasing necessary.",
    "",
    "After persisting the revision, report the document id, revision id, and updated summary.",
  ].join("\n");
}

export function summarizeDocumentSections(document: string): string[] {
  return extractMarkdownSections(document);
}
