import { describe, expect, it } from "vitest";
import { buildSpecChecklist } from "../extensions/domain/checklist.js";
import type { SpecChangeState } from "../extensions/domain/models.js";

function buildState(overrides: Partial<SpecChangeState> = {}): SpecChangeState {
  return {
    changeId: "add-dark-mode",
    title: "Add dark mode",
    status: "tasked",
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
    finalizedAt: null,
    archivedAt: null,
    archivedRef: null,
    initiativeIds: [],
    researchIds: [],
    supersedes: [],
    proposalSummary: "Introduce a first-class dark theme.",
    designNotes: "Use CSS variables.",
    requirements: [
      {
        id: "req-001",
        text: "Users can toggle dark mode.",
        acceptance: ["The theme changes immediately."],
        capabilities: ["theme-toggling"],
      },
    ],
    capabilities: [
      {
        id: "theme-toggling",
        title: "Theme toggling",
        summary: "Allow switching between light and dark themes.",
        requirements: ["req-001"],
        scenarios: ["User toggles theme from settings."],
      },
    ],
    tasks: [
      {
        id: "task-001",
        title: "Add theme toggle",
        summary: "Wire the settings control.",
        deps: [],
        requirements: ["req-001"],
        capabilities: ["theme-toggling"],
        acceptance: ["Toggle persists while the session is active."],
      },
    ],
    artifactVersions: {
      proposal: null,
      design: null,
      tasks: null,
      analysis: null,
      checklist: null,
    },
    ...overrides,
  };
}

describe("spec checklist", () => {
  it("marks all checklist items as passed for a complete spec", () => {
    const result = buildSpecChecklist(buildState());

    expect(result.passed).toBe(true);
    expect(result.items.every((item) => item.passed)).toBe(true);
  });

  it("fails checklist items when acceptance or traceability is missing", () => {
    const result = buildSpecChecklist(
      buildState({
        requirements: [
          {
            id: "req-001",
            text: "Users can toggle dark mode.",
            acceptance: [],
            capabilities: ["theme-toggling"],
          },
        ],
      }),
    );

    expect(result.passed).toBe(false);
    expect(result.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "requirements", passed: false })]),
    );
  });
});
