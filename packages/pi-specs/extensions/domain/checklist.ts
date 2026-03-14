import type { SpecChangeState, SpecChecklistItem, SpecChecklistResult } from "./models.js";
import { currentTimestamp } from "./normalize.js";

function checklistItem(id: string, title: string, passed: boolean, detail: string): SpecChecklistItem {
  return { id, title, passed, detail };
}

export function buildSpecChecklist(state: SpecChangeState): SpecChecklistResult {
  const items: SpecChecklistItem[] = [];

  items.push(
    checklistItem(
      "proposal",
      "Proposal states the intended change",
      state.proposalSummary.trim().length > 0,
      state.proposalSummary.trim().length > 0 ? "Proposal summary is present." : "Add a concise proposal summary.",
    ),
  );

  items.push(
    checklistItem(
      "capabilities",
      "Capabilities are defined",
      state.capabilities.length > 0,
      state.capabilities.length > 0
        ? `${state.capabilities.length} capability specs are present.`
        : "Define at least one capability before finalizing.",
    ),
  );

  items.push(
    checklistItem(
      "requirements",
      "Requirements have acceptance criteria",
      state.requirements.every((requirement) => requirement.acceptance.length > 0),
      state.requirements.every((requirement) => requirement.acceptance.length > 0)
        ? "Every requirement includes acceptance criteria."
        : "Add acceptance criteria to each requirement.",
    ),
  );

  items.push(
    checklistItem(
      "traceability",
      "Every requirement traces to a task",
      state.requirements.every((requirement) => state.tasks.some((task) => task.requirements.includes(requirement.id))),
      state.requirements.every((requirement) => state.tasks.some((task) => task.requirements.includes(requirement.id)))
        ? "Each requirement maps to at least one task."
        : "Add task coverage for every requirement.",
    ),
  );

  items.push(
    checklistItem(
      "tasks",
      "Tasks define execution order",
      state.tasks.every((task) => task.requirements.length > 0),
      state.tasks.every((task) => task.requirements.length > 0)
        ? "Each task is linked to at least one requirement."
        : "Link every task to a requirement before projection.",
    ),
  );

  const passed = items.every((item) => item.passed);
  return {
    changeId: state.changeId,
    generatedAt: currentTimestamp(),
    passed,
    items,
  };
}
