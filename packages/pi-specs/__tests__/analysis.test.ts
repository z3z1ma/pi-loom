import { describe, expect, it } from "vitest";
import { analyzeSpecChange } from "../extensions/domain/analysis.js";
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
    archivedPath: null,
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

describe("spec analysis", () => {
  it("passes finalized-quality checks for a traced spec", () => {
    const result = analyzeSpecChange(buildState());

    expect(result.readyToFinalize).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("flags missing traceability and missing tasks as blocking spec-quality failures", () => {
    const result = analyzeSpecChange(
      buildState({
        tasks: [],
      }),
    );

    expect(result.readyToFinalize).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          artifact: "tasks",
          blocking: true,
          message: "No implementation tasks have been defined.",
        }),
        expect.objectContaining({
          artifact: "tasks",
          blocking: true,
          message: "Requirement req-001 is not traced to any task.",
        }),
      ]),
    );
  });
});
