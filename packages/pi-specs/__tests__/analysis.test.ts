import { describe, expect, it } from "vitest";
import { analyzeSpecChange } from "../extensions/domain/analysis.js";
import type { SpecChangeState } from "../extensions/domain/models.js";

function buildState(overrides: Partial<SpecChangeState> = {}): SpecChangeState {
  return {
    changeId: "dark-theme-support",
    title: "Dark theme support",
    status: "planned",
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
    finalizedAt: null,
    archivedAt: null,
    archivedRef: null,
    initiativeIds: [],
    researchIds: [],
    supersedes: [],
    proposalSummary: "The product supports a first-class dark theme.",
    designNotes: "Theme semantics must remain consistent across settings and persisted sessions.",
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
    artifactVersions: {
      proposal: null,
      design: null,
      analysis: null,
      checklist: null,
    },
    ...overrides,
  };
}

describe("spec analysis", () => {
  it("passes finalized-quality checks for a behavior-complete spec", () => {
    const result = analyzeSpecChange(buildState());

    expect(result.readyToFinalize).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("flags missing behavioral detail as a spec-quality failure", () => {
    const result = analyzeSpecChange(
      buildState({
        requirements: [],
        capabilities: [
          {
            id: "theme-toggling",
            title: "Theme toggling",
            summary: "Allow switching between light and dark themes.",
            requirements: [],
            scenarios: [],
          },
        ],
      }),
    );

    expect(result.readyToFinalize).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          artifact: "change",
          blocking: true,
          message: "No requirements have been defined.",
        }),
        expect.objectContaining({
          artifact: "capability",
          blocking: false,
          message: "Capability theme-toggling has no scenarios.",
        }),
      ]),
    );
  });
});
