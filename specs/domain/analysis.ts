import type { SpecAnalysisFinding, SpecAnalysisResult, SpecChangeState } from "./models.js";
import { currentTimestamp, isDeltaStyleSpecTitle } from "./normalize.js";

function finding(
  id: string,
  severity: SpecAnalysisFinding["severity"],
  artifact: SpecAnalysisFinding["artifact"],
  message: string,
  blocking = severity === "error",
): SpecAnalysisFinding {
  return { id, severity, artifact, message, blocking };
}

export function analyzeSpecChange(state: SpecChangeState): SpecAnalysisResult {
  const findings: SpecAnalysisFinding[] = [];

  const trimmedTitle = state.title.trim();
  if (!trimmedTitle) {
    findings.push(finding("title-empty", "error", "change", "Specification title is empty."));
  } else if (isDeltaStyleSpecTitle(trimmedTitle)) {
    findings.push(
      finding(
        "title-delta-style",
        "error",
        "change",
        `Specification title "${trimmedTitle}" reads like an implementation task. Rename it to the behavior or capability the spec declares.`,
      ),
    );
  }

  if (!state.proposalSummary.trim()) {
    findings.push(finding("proposal-summary", "error", "proposal", "Proposal summary is empty."));
  }
  if (state.capabilities.length === 0) {
    findings.push(finding("capabilities-empty", "error", "capability", "No capabilities have been defined."));
  }
  if (state.requirements.length === 0) {
    findings.push(finding("requirements-empty", "error", "change", "No requirements have been defined."));
  }
  for (const capability of state.capabilities) {
    if (capability.requirements.length === 0) {
      findings.push(
        finding(
          `capability-${capability.id}-requirements`,
          "warning",
          "capability",
          `Capability ${capability.id} has no linked requirements.`,
          false,
        ),
      );
    }
    if (capability.scenarios.length === 0) {
      findings.push(
        finding(
          `capability-${capability.id}-scenarios`,
          "warning",
          "capability",
          `Capability ${capability.id} has no scenarios.`,
          false,
        ),
      );
    }
  }

  for (const requirement of state.requirements) {
    if (requirement.acceptance.length === 0) {
      findings.push(
        finding(
          `requirement-${requirement.id}-acceptance`,
          "warning",
          "change",
          `Requirement ${requirement.id} has no explicit acceptance criteria.`,
          false,
        ),
      );
    }
  }

  const readyToFinalize = !findings.some((entry) => entry.blocking);
  return {
    changeId: state.changeId,
    generatedAt: currentTimestamp(),
    readyToFinalize,
    findings,
  };
}
