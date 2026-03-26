import { describe, expect, it } from "vitest";
import { buildSpecChecklist } from "../domain/checklist.js";
import type { SpecChangeState } from "../domain/models.js";

function buildState(overrides: Partial<SpecChangeState> = {}): SpecChangeState {
  return {
    changeId: "dark-theme-support",
    title: "Dark theme support",
    status: "specified",
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

describe("spec checklist", () => {
  it("marks all checklist items as passed for a complete declarative spec", () => {
    const result = buildSpecChecklist(buildState());

    expect(result.passed).toBe(true);
    expect(result.items.every((item) => item.passed)).toBe(true);
  });

  it("fails the checklist when the title reads like a work order", () => {
    const result = buildSpecChecklist(
      buildState({
        title: "Implement draft restore",
      }),
    );

    expect(result.passed).toBe(false);
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "title",
          passed: false,
          title: "Title names a standalone behavior or capability",
        }),
      ]),
    );
  });

  it("fails checklist items when acceptance criteria or scenarios are missing", () => {
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
        capabilities: [
          {
            id: "theme-toggling",
            title: "Theme toggling",
            summary: "Allow switching between light and dark themes.",
            requirements: ["req-001"],
            scenarios: [],
          },
        ],
      }),
    );

    expect(result.passed).toBe(false);
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "requirements", passed: false }),
        expect.objectContaining({ id: "scenarios", passed: false }),
      ]),
    );
  });
});
