import type { SpecAnalysisFinding, SpecAnalysisResult, SpecChangeState } from "./models.js";
import { currentTimestamp } from "./normalize.js";

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

  if (!state.proposalSummary.trim()) {
    findings.push(finding("proposal-summary", "error", "proposal", "Proposal summary is empty."));
  }
  if (state.capabilities.length === 0) {
    findings.push(finding("capabilities-empty", "error", "capability", "No capabilities have been defined."));
  }
  if (state.requirements.length === 0) {
    findings.push(finding("requirements-empty", "error", "change", "No requirements have been defined."));
  }
  if (state.tasks.length === 0) {
    findings.push(finding("tasks-empty", "error", "tasks", "No implementation tasks have been defined."));
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
    const linkedTasks = state.tasks.filter((task) => task.requirements.includes(requirement.id));
    if (linkedTasks.length === 0) {
      findings.push(
        finding(
          `requirement-${requirement.id}-trace`,
          "error",
          "tasks",
          `Requirement ${requirement.id} is not traced to any task.`,
        ),
      );
    }
  }

  for (const task of state.tasks) {
    if (task.requirements.length === 0) {
      findings.push(
        finding(`task-${task.id}-requirements`, "error", "tasks", `Task ${task.id} is not linked to a requirement.`),
      );
    }
    for (const dependency of task.deps) {
      if (!state.tasks.some((candidate) => candidate.id === dependency)) {
        findings.push(
          finding(
            `task-${task.id}-dep-${dependency}`,
            "error",
            "tasks",
            `Task ${task.id} depends on unknown task ${dependency}.`,
          ),
        );
      }
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
