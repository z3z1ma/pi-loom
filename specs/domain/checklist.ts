import type { SpecChangeState, SpecChecklistItem, SpecChecklistResult } from "./models.js";
import { currentTimestamp, isDeltaStyleSpecTitle } from "./normalize.js";

function checklistItem(id: string, title: string, passed: boolean, detail: string): SpecChecklistItem {
  return { id, title, passed, detail };
}

export function buildSpecChecklist(state: SpecChangeState): SpecChecklistResult {
  const items: SpecChecklistItem[] = [];
  const hasStandaloneTitle = state.title.trim().length > 0 && !isDeltaStyleSpecTitle(state.title);

  items.push(
    checklistItem(
      "title",
      "Title names a standalone behavior or capability",
      hasStandaloneTitle,
      hasStandaloneTitle
        ? "Title reads like a stable capability name."
        : "Rename the spec so the title names the behavior or capability in isolation rather than an implementation task or migration step.",
    ),
  );

  items.push(
    checklistItem(
      "proposal",
      "Proposal states the intended behavior",
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
      "scenarios",
      "Capabilities include concrete scenarios",
      state.capabilities.every((capability) => capability.scenarios.length > 0),
      state.capabilities.every((capability) => capability.scenarios.length > 0)
        ? "Every capability includes at least one scenario."
        : "Add concrete scenarios so the spec stays behavior-complete without implementation coupling.",
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
