import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSpecStore } from "../extensions/domain/store.js";

describe("SpecStore durable memory", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-specs-store-"));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(workspace, { recursive: true, force: true });
  });

  it("writes durable spec artifacts, decisions, and canonical capability merges", () => {
    const store = createSpecStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T10:00:00.000Z"));
    const created = store.createChange({ title: "Add dark mode", summary: "Support a dark theme." });
    expect(created.state.changeId).toBe("add-dark-mode");
    expect(existsSync(join(workspace, ".loom", "specs", "changes", "add-dark-mode", "proposal.md"))).toBe(true);

    vi.setSystemTime(new Date("2026-03-15T10:05:00.000Z"));
    const clarified = store.recordClarification("add-dark-mode", "Should the choice persist?", "Yes.");
    expect(clarified.state.status).toBe("clarifying");
    expect(
      readFileSync(join(workspace, ".loom", "specs", "changes", "add-dark-mode", "decisions.jsonl"), "utf-8"),
    ).toContain("Should the choice persist?");

    vi.setSystemTime(new Date("2026-03-15T10:10:00.000Z"));
    const planned = store.updatePlan("add-dark-mode", {
      designNotes: "Use CSS variables and persist user choice.",
      capabilities: [
        {
          title: "Theme toggling",
          summary: "Allow switching between light and dark themes.",
          requirements: ["Users can toggle dark mode.", "The theme preference persists."],
          acceptance: ["Theme changes immediately after the toggle is pressed."],
          scenarios: ["User toggles the theme from settings."],
        },
      ],
    });
    expect(planned.state.capabilities[0]?.id).toBe("theme-toggling");
    expect(existsSync(join(workspace, ".loom", "specs", "changes", "add-dark-mode", "design.md"))).toBe(true);
    expect(
      existsSync(join(workspace, ".loom", "specs", "changes", "add-dark-mode", "specs", "theme-toggling.md")),
    ).toBe(true);

    vi.setSystemTime(new Date("2026-03-15T10:15:00.000Z"));
    const linked = store.setInitiativeIds("add-dark-mode", ["platform-modernization", "ui-foundation"]);
    expect(linked.state.initiativeIds).toEqual(["platform-modernization", "ui-foundation"]);

    vi.setSystemTime(new Date("2026-03-15T10:20:00.000Z"));
    const tasked = store.updateTasks("add-dark-mode", {
      tasks: [
        {
          title: "Add theme toggle",
          summary: "Wire the UI control and persistence.",
          requirements: planned.state.requirements.map((requirement) => requirement.id),
        },
      ],
    });
    expect(tasked.state.status).toBe("tasked");
    expect(existsSync(join(workspace, ".loom", "specs", "changes", "add-dark-mode", "tasks.md"))).toBe(true);

    const plannedSnapshot = store.readChange("add-dark-mode");
    expect(plannedSnapshot.summary.path).toBe(".loom/specs/changes/add-dark-mode");
    expect(plannedSnapshot.artifacts.map((artifact) => artifact.path)).toEqual([
      ".loom/specs/changes/add-dark-mode/proposal.md",
      ".loom/specs/changes/add-dark-mode/design.md",
      ".loom/specs/changes/add-dark-mode/tasks.md",
      ".loom/specs/changes/add-dark-mode/analysis.md",
      ".loom/specs/changes/add-dark-mode/checklist.md",
    ]);
    expect(plannedSnapshot.capabilitySpecs[0]?.path).toBe(".loom/specs/changes/add-dark-mode/specs/theme-toggling.md");

    const analyzed = store.analyzeChange("add-dark-mode");
    expect(analyzed.analysis).toContain("Specification quality gates passed");

    const finalized = store.finalizeChange("add-dark-mode");
    expect(finalized.state.status).toBe("finalized");

    const archived = store.archiveChange("add-dark-mode");
    expect(archived.state.status).toBe("archived");
    expect(archived.state.archivedPath).toBe(".loom/specs/archive/2026-03-15-add-dark-mode");
    expect(archived.summary.initiativeIds).toEqual(["platform-modernization", "ui-foundation"]);
    expect(archived.summary.path).toBe(".loom/specs/archive/2026-03-15-add-dark-mode");
    expect(archived.artifacts.map((artifact) => artifact.path)).toEqual([
      ".loom/specs/archive/2026-03-15-add-dark-mode/proposal.md",
      ".loom/specs/archive/2026-03-15-add-dark-mode/design.md",
      ".loom/specs/archive/2026-03-15-add-dark-mode/tasks.md",
      ".loom/specs/archive/2026-03-15-add-dark-mode/analysis.md",
      ".loom/specs/archive/2026-03-15-add-dark-mode/checklist.md",
    ]);
    expect(existsSync(join(workspace, ".loom", "specs", "capabilities", "theme-toggling.md"))).toBe(true);
    expect(readFileSync(join(workspace, ".loom", "specs", "capabilities", "theme-toggling.md"), "utf-8")).toContain(
      "Users can toggle dark mode.",
    );

    const canonicalCapability = store.readCapability("theme-toggling");
    expect(canonicalCapability.path).toBe(".loom/specs/capabilities/theme-toggling.md");

    expect(store.listChanges({ includeArchived: true })).toEqual([
      expect.objectContaining({
        id: "add-dark-mode",
        archived: true,
        path: ".loom/specs/archive/2026-03-15-add-dark-mode",
      }),
    ]);
    expect(store.listCapabilities()).toEqual([
      expect.objectContaining({
        id: "theme-toggling",
        path: ".loom/specs/capabilities/theme-toggling.md",
      }),
    ]);
  });
});
