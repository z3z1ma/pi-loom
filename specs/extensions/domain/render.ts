import { renderBulletList, renderSection, serializeMarkdownArtifact } from "./frontmatter.js";
import type {
  CanonicalCapabilityRecord,
  SpecAnalysisResult,
  SpecArtifactName,
  SpecChangeRecord,
  SpecChangeState,
  SpecChangeSummary,
  SpecChecklistResult,
  SpecDecisionRecord,
  SpecRequirementRecord,
} from "./models.js";

function joinNonEmpty(chunks: string[]): string {
  return chunks.filter(Boolean).join("\n\n");
}

function renderRequirements(requirements: SpecRequirementRecord[]): string {
  if (requirements.length === 0) {
    return "(none)";
  }
  return requirements
    .map((requirement) => {
      const acceptance =
        requirement.acceptance.length > 0 ? `\n  Acceptance: ${requirement.acceptance.join("; ")}` : "";
      const capabilities =
        requirement.capabilities.length > 0 ? `\n  Capabilities: ${requirement.capabilities.join(", ")}` : "";
      return `- ${requirement.id}: ${requirement.text}${acceptance}${capabilities}`;
    })
    .join("\n");
}

function renderDecisions(decisions: SpecDecisionRecord[]): string {
  if (decisions.length === 0) {
    return "(none)";
  }
  return decisions.map((decision) => `- ${decision.createdAt} ${decision.question} -> ${decision.answer}`).join("\n");
}

export function renderProposalMarkdown(state: SpecChangeState, decisions: SpecDecisionRecord[]): string {
  return serializeMarkdownArtifact(
    {
      id: state.changeId,
      title: state.title,
      status: state.status,
      "created-at": state.createdAt,
      "updated-at": state.updatedAt,
      research: state.researchIds,
      initiatives: state.initiativeIds,
      capabilities: state.capabilities.map((capability) => capability.id),
    },
    joinNonEmpty([
      renderSection("Overview", state.proposalSummary || "(empty)"),
      renderSection(
        "Capabilities",
        renderBulletList(state.capabilities.map((capability) => `${capability.id}: ${capability.title}`)),
      ),
      renderSection("Requirements", renderRequirements(state.requirements)),
      renderSection("Clarifications", renderDecisions(decisions)),
    ]),
  );
}

export function renderDesignMarkdown(state: SpecChangeState): string {
  return serializeMarkdownArtifact(
    {
      id: state.changeId,
      title: state.title,
      status: state.status,
      "created-at": state.createdAt,
      "updated-at": state.updatedAt,
      research: state.researchIds,
      initiatives: state.initiativeIds,
      capabilities: state.capabilities.map((capability) => capability.id),
    },
    joinNonEmpty([
      renderSection("Design Notes", state.designNotes || "(empty)"),
      renderSection(
        "Capability Map",
        renderBulletList(state.capabilities.map((capability) => `${capability.id}: ${capability.title}`)),
      ),
      renderSection("Requirements", renderRequirements(state.requirements)),
    ]),
  );
}

export function renderCapabilityMarkdown(changeId: string, capability: CanonicalCapabilityRecord): string {
  return serializeMarkdownArtifact(
    {
      id: capability.id,
      title: capability.title,
      change: changeId,
      "updated-at": capability.updatedAt,
      "source-changes": capability.sourceChanges,
    },
    joinNonEmpty([
      renderSection("Summary", capability.summary || "(empty)"),
      renderSection("Requirements", renderBulletList(capability.requirements)),
      renderSection("Scenarios", renderBulletList(capability.scenarios)),
    ]),
  );
}

export function renderCanonicalCapabilityMarkdown(capability: CanonicalCapabilityRecord): string {
  return serializeMarkdownArtifact(
    {
      id: capability.id,
      title: capability.title,
      "updated-at": capability.updatedAt,
      "source-changes": capability.sourceChanges,
    },
    joinNonEmpty([
      renderSection("Summary", capability.summary || "(empty)"),
      renderSection("Requirements", renderBulletList(capability.requirements)),
      renderSection("Scenarios", renderBulletList(capability.scenarios)),
    ]),
  );
}

export function renderAnalysisMarkdown(result: SpecAnalysisResult): string {
  return serializeMarkdownArtifact(
    {
      id: result.changeId,
      "generated-at": result.generatedAt,
      ready: result.readyToFinalize ? "true" : "false",
    },
    joinNonEmpty([
      renderSection(
        "Summary",
        result.readyToFinalize
          ? "Specification quality gates passed. This does not verify implementation correctness."
          : "Specification quality gates failed. Fix the spec before handing it off to plans and tickets.",
      ),
      renderSection(
        "Findings",
        renderBulletList(
          result.findings.map(
            (finding) =>
              `[${finding.severity}] ${finding.artifact}${finding.blocking ? " (blocking)" : ""}: ${finding.message}`,
          ),
          "(none)",
        ),
      ),
    ]),
  );
}

export function renderChecklistMarkdown(result: SpecChecklistResult): string {
  return serializeMarkdownArtifact(
    {
      id: result.changeId,
      "generated-at": result.generatedAt,
      passed: result.passed ? "true" : "false",
    },
    joinNonEmpty([
      renderSection(
        "Summary",
        "This checklist validates specification quality and traceability. It does not replace code-level tests.",
      ),
      renderSection(
        "Checklist",
        renderBulletList(
          result.items.map((item) => `${item.passed ? "[x]" : "[ ]"} ${item.title} — ${item.detail}`),
          "(none)",
        ),
      ),
    ]),
  );
}

export function renderSpecSummary(summary: SpecChangeSummary): string {
  return `${summary.id} [${summary.status}]${summary.repository ? ` repo=${summary.repository.slug}` : ""} caps=${summary.capabilityIds.length} reqs=${summary.requirementCount} ${summary.title}`;
}

export function renderSpecDetail(record: SpecChangeRecord): string {
  return [
    renderSpecSummary(record.summary),
    `Repository: ${
      record.summary.repository
        ? `${record.summary.repository.displayName} [${record.summary.repository.id}]`
        : "(none)"
    }`,
    `Artifacts: ${
      record.artifacts
        .filter((artifact) => artifact.exists)
        .map((artifact) => artifact.name)
        .join(", ") || "none"
    }`,
    `Research: ${record.state.researchIds.join(", ") || "none"}`,
    `Initiatives: ${record.state.initiativeIds.join(", ") || "none"}`,
    `Capabilities: ${record.state.capabilities.map((capability) => capability.id).join(", ") || "none"}`,
    `Requirements: ${record.state.requirements.length}`,
    `Decisions: ${record.decisions.length}`,
    "",
    "Proposal:",
    record.state.proposalSummary || "(empty)",
  ].join("\n");
}

export function renderCapabilityDetail(record: CanonicalCapabilityRecord): string {
  return [
    `${record.id} ${record.title}`,
    `Source changes: ${record.sourceChanges.join(", ") || "none"}`,
    `Requirements: ${record.requirements.length}`,
    `Scenarios: ${record.scenarios.length}`,
    "",
    "Summary:",
    record.summary || "(empty)",
  ].join("\n");
}

export function artifactNames(artifacts: { name: SpecArtifactName; exists: boolean }[]): string[] {
  return artifacts.filter((artifact) => artifact.exists).map((artifact) => artifact.name);
}
