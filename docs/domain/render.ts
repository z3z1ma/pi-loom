import { renderPortableRepositoryPathList } from "#storage/repository-path.js";
import { serializeMarkdownArtifact } from "./frontmatter.js";
import type {
  DocumentationAuditReport,
  DocumentationGovernanceSurface,
  DocumentationReadResult,
  DocumentationRelatedDocSummary,
  DocumentationState,
  DocumentationSummary,
} from "./models.js";
import { extractMarkdownSections } from "./normalize.js";
import { getDocumentationPacketRef } from "./overview.js";

function renderAudience(audience: string[]): string {
  return audience.length > 0 ? audience.join(", ") : "none";
}

function renderRepository(summary: DocumentationSummary): string {
  return summary.repository ? ` repo=${summary.repository.slug}` : "";
}

function renderCurrentOwner(governance: DocumentationGovernanceSurface, selfDocId?: string): string {
  if (governance.currentOwnerDocId) {
    if (governance.currentOwnerDocId === selfDocId) {
      return "self";
    }
    return governance.currentOwnerTitle
      ? `${governance.currentOwnerDocId} (${governance.currentOwnerTitle})`
      : governance.currentOwnerDocId;
  }
  if (governance.activeOwnerDocIds.length > 1) {
    return `ambiguous: ${governance.activeOwnerDocIds.join(", ")}`;
  }
  return "none";
}

function renderSuccessor(governance: DocumentationGovernanceSurface): string {
  if (!governance.successorDocId) {
    return "none";
  }
  return governance.successorTitle
    ? `${governance.successorDocId} (${governance.successorTitle})`
    : governance.successorDocId;
}

function renderRelatedDocs(relatedDocs: DocumentationRelatedDocSummary[]): string {
  if (relatedDocs.length === 0) {
    return "none";
  }
  return relatedDocs
    .map((doc) => `${doc.id} [${doc.relationship}/${doc.status}/${doc.publicationStatus}] ${doc.title}`)
    .join("; ");
}

function renderPublication(governance: DocumentationGovernanceSurface): string {
  return `${governance.publicationStatus} — ${governance.publicationSummary}`;
}

export function renderDocumentationSummary(summary: DocumentationSummary): string {
  return `${summary.id} [${summary.status}/${summary.docType}/${summary.governance.publicationStatus}]${renderRepository(summary)} ${summary.title}`;
}

export function renderDocumentationMarkdown(
  state: DocumentationState,
  governance: DocumentationGovernanceSurface,
  body: string,
): string {
  const linkedOutputPaths = renderPortableRepositoryPathList(state.linkedOutputPaths);
  return serializeMarkdownArtifact(
    {
      id: state.docId,
      title: state.title,
      status: state.status,
      type: state.docType,
      section: state.sectionGroup,
      "topic-id": state.topicId,
      "topic-role": state.topicRole,
      "publication-status": governance.publicationStatus,
      "publication-summary": governance.publicationSummary,
      "recommended-action": governance.recommendedAction,
      "current-owner": governance.currentOwnerDocId,
      "active-owners": governance.activeOwnerDocIds,
      audience: state.audience,
      source: `${state.sourceTarget.kind}:${state.sourceTarget.ref}`,
      "verified-at": state.verifiedAt,
      "verification-source": state.verificationSource,
      successor: state.successorDocId,
      "successor-title": governance.successorTitle,
      predecessors: governance.predecessorDocIds,
      "retirement-reason": state.retirementReason,
      "updated-at": state.updatedAt,
      topics: state.guideTopics,
      outputs: linkedOutputPaths,
    },
    body.trim(),
  );
}

export function renderDocumentationDetail(result: DocumentationReadResult): string {
  const scopePaths = renderPortableRepositoryPathList(result.state.scopePaths);
  const linkedOutputPaths = renderPortableRepositoryPathList(result.state.linkedOutputPaths);
  const verification = result.state.verifiedAt
    ? `${result.state.verifiedAt}${result.state.verificationSource ? ` via ${result.state.verificationSource}` : ""}`
    : "unverified";
  const lifecycle = result.state.successorDocId
    ? `successor=${renderSuccessor(result.governance)}`
    : result.state.retirementReason
      ? `retired: ${result.state.retirementReason}`
      : "none";
  return [
    renderDocumentationSummary(result.summary),
    `Topic: ${result.state.topicId ?? "migration-debt"} (${result.state.topicRole})`,
    `Publication: ${renderPublication(result.governance)}`,
    `Current owner: ${renderCurrentOwner(result.governance, result.state.docId)}`,
    `Recommended action: ${result.governance.recommendedAction}`,
    `Audience: ${renderAudience(result.state.audience)}`,
    `Source target: ${result.state.sourceTarget.kind}:${result.state.sourceTarget.ref}`,
    `Verification: ${verification}`,
    `Lifecycle metadata: ${lifecycle}`,
    `Related docs: ${renderRelatedDocs(result.governance.relatedDocs)}`,
    `Scope paths: ${scopePaths.join(", ") || "none"}`,
    `Guide topics: ${result.state.guideTopics.join(", ") || "none"}`,
    `Linked outputs: ${linkedOutputPaths.join(", ") || "none"}`,
    `Revisions: ${result.revisions.length}`,
    `Last revision: ${result.state.lastRevisionId ?? "none"}`,
    "",
    "Summary:",
    result.state.summary || "(empty)",
  ].join("\n");
}

export function renderOverview(overview: DocumentationReadResult["overview"]): string {
  const linkedOutputPaths = renderPortableRepositoryPathList(overview.linkedOutputPaths);
  const verification = overview.verifiedAt
    ? `${overview.verifiedAt}${overview.verificationSource ? ` via ${overview.verificationSource}` : ""}`
    : "unverified";
  const lifecycle = overview.successorDocId
    ? `successor=${renderSuccessor(overview.governance)}`
    : overview.retirementReason
      ? `retired: ${overview.retirementReason}`
      : "none";
  return [
    renderDocumentationSummary(overview.doc),
    `Topic: ${overview.topicId ?? "migration-debt"} (${overview.topicRole})`,
    `Publication: ${renderPublication(overview.governance)}`,
    `Current owner: ${renderCurrentOwner(overview.governance, overview.doc.id)}`,
    `Recommended action: ${overview.governance.recommendedAction}`,
    `Revisions: ${overview.revisionCount}`,
    `Audience: ${renderAudience(overview.audience)}`,
    `Verification: ${verification}`,
    `Lifecycle metadata: ${lifecycle}`,
    `Related docs: ${renderRelatedDocs(overview.governance.relatedDocs)}`,
    `Topics: ${overview.guideTopics.join(", ") || "none"}`,
    `Linked outputs: ${linkedOutputPaths.join(", ") || "none"}`,
    `Last revision: ${overview.lastRevision?.id ?? "none"}`,
  ].join("\n");
}

export function renderUpdateDescriptor(_cwd: string, result: DocumentationReadResult): string {
  const packetRef = getDocumentationPacketRef(result.state);
  return [
    `Documentation update handoff for ${result.state.docId}`,
    `Type: ${result.state.docType}`,
    `Section group: ${result.state.sectionGroup}`,
    `Topic: ${result.state.topicId ?? "migration-debt"} (${result.state.topicRole})`,
    `Publication: ${renderPublication(result.governance)}`,
    `Current owner: ${renderCurrentOwner(result.governance, result.state.docId)}`,
    `Recommended action: ${result.governance.recommendedAction}`,
    `Packet ref: ${packetRef}`,
    `Update reason: ${result.state.updateReason || "(empty)"}`,
    "",
    "The fresh maintainer should persist the revision through docs_write.",
  ].join("\n");
}

export function renderUpdatePrompt(_cwd: string, result: DocumentationReadResult): string {
  const packetRef = getDocumentationPacketRef(result.state);
  return [
    `Perform the documentation maintenance described in ${packetRef}.`,
    "",
    "This is a fresh documentation-maintainer session. Do not continue the executor's prior reasoning.",
    `Target document: ${result.state.docId} (${result.state.docType})`,
    `Topic: ${result.state.topicId ?? "migration-debt"} (${result.state.topicRole})`,
    `Publication truth: ${renderPublication(result.governance)}`,
    `Current owner: ${renderCurrentOwner(result.governance, result.state.docId)}`,
    `Recommended maintenance action: ${result.governance.recommendedAction}`,
    `Related docs: ${renderRelatedDocs(result.governance.relatedDocs)}`,
    `Audience: ${renderAudience(result.state.audience)}`,
    `Update reason: ${result.state.updateReason || "(empty)"}`,
    "",
    "Before writing:",
    `- Read ${packetRef}.`,
    "- Keep the document high-level and explanatory for humans and AI memory.",
    "- Prefer updating, superseding, or archiving the governed topic surface over fragmenting it with parallel current-truth docs.",
    "- Do not generate API reference documentation.",
    "- Describe completed reality, not plans that have not landed.",
    "",
    "When ready:",
    `- Call docs_write with action=update and ref=${result.state.docId}.`,
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

export function renderDocumentationAuditReport(report: DocumentationAuditReport): string {
  return [
    `Documentation audit${report.ref ? ` for ${report.ref}` : ""}`,
    `Generated at: ${report.generatedAt}`,
    `Docs audited: ${report.counts.docsAudited}`,
    `Findings: ${report.counts.findings}`,
    `By kind: stale=${report.counts.byKind.stale}, overlapping=${report.counts.byKind.overlapping}, orphaned=${report.counts.byKind.orphaned}, unverified=${report.counts.byKind.unverified}`,
    `By severity: low=${report.counts.bySeverity.low}, medium=${report.counts.bySeverity.medium}, high=${report.counts.bySeverity.high}, critical=${report.counts.bySeverity.critical}`,
    report.findings.length > 0
      ? `Findings:\n${report.findings.map((finding) => `- ${finding.id} [${finding.kind}/${finding.severity}] ${finding.title} — ${finding.recommendedAction}`).join("\n")}`
      : "Findings:\n(none)",
  ].join("\n");
}
