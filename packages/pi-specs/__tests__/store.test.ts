import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createInitiativeStore } from "@pi-loom/pi-initiatives/extensions/domain/store.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSpecStore } from "../extensions/domain/store.js";

describe("SpecStore durable memory", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(`${tmpdir()}/pi-specs-store-`);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(workspace, { recursive: true, force: true });
  });

  it("writes durable spec artifacts, decisions, and canonical capability merges", async () => {
    const store = createSpecStore(workspace);
    const initiativeStore = createInitiativeStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T10:00:00.000Z"));
    await initiativeStore.createInitiative({ title: "Platform modernization" });
    await initiativeStore.createInitiative({ title: "UI foundation" });
    const created = await store.createChange({ title: "Dark theme support", summary: "Support a dark theme." });
    expect(created.state.changeId).toBe("dark-theme-support");
    const changeRef = created.summary.ref;

    vi.setSystemTime(new Date("2026-03-15T10:05:00.000Z"));
    const clarified = await store.recordClarification(changeRef, "Should the choice persist?", "Yes.");
    expect(clarified.state.status).toBe("clarifying");
    expect(clarified.decisions.at(-1)?.question).toBe("Should the choice persist?");

    vi.setSystemTime(new Date("2026-03-15T10:10:00.000Z"));
    const specified = await store.updatePlan(changeRef, {
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
    expect(specified.state.capabilities[0]?.id).toBe("theme-toggling");

    vi.setSystemTime(new Date("2026-03-15T10:15:00.000Z"));
    const linked = await store.setInitiativeIds(changeRef, ["platform-modernization", "ui-foundation"]);
    expect(linked.state.initiativeIds).toEqual(["platform-modernization", "ui-foundation"]);

    vi.setSystemTime(new Date("2026-03-15T10:20:00.000Z"));
    const specifiedSnapshot = await store.readChange(changeRef);
    expect(specifiedSnapshot.summary.ref).toBe("spec:dark-theme-support");
    expect(specifiedSnapshot.artifacts.map((artifact) => artifact.ref)).toEqual([
      "spec:dark-theme-support:artifact:proposal",
      "spec:dark-theme-support:artifact:design",
      "spec:dark-theme-support:artifact:analysis",
      "spec:dark-theme-support:artifact:checklist",
    ]);
    expect(specifiedSnapshot.capabilitySpecs[0]?.ref).toBe("capability:theme-toggling");
    expect(specifiedSnapshot.state.status).toBe("specified");

    const analyzed = await store.analyzeChange(changeRef);
    expect(analyzed.analysis).toContain("Specification quality gates passed");

    const finalized = await store.finalizeChange(changeRef);
    expect(finalized.state.status).toBe("finalized");

    const archived = await store.archiveChange(changeRef);
    expect(archived.state.status).toBe("archived");
    expect(archived.state.archivedRef).toBe("archive:spec:2026-03-15:dark-theme-support");
    expect(archived.summary.initiativeIds).toEqual(["platform-modernization", "ui-foundation"]);
    expect(archived.summary.ref).toBe("archive:spec:2026-03-15:dark-theme-support");
    expect(archived.artifacts.map((artifact) => artifact.ref)).toEqual([
      "archive:spec:2026-03-15:dark-theme-support:artifact:proposal",
      "archive:spec:2026-03-15:dark-theme-support:artifact:design",
      "archive:spec:2026-03-15:dark-theme-support:artifact:analysis",
      "archive:spec:2026-03-15:dark-theme-support:artifact:checklist",
    ]);
    const canonicalCapability = await store.readCapability(
      specifiedSnapshot.capabilitySpecs[0]?.ref ?? "capability:theme-toggling",
    );
    expect(canonicalCapability.ref).toBe("capability:theme-toggling");
    expect(canonicalCapability.requirements).toContain("Users can toggle dark mode.");

    expect(await store.listChanges({ includeArchived: true })).toEqual([
      expect.objectContaining({
        id: "dark-theme-support",
        archived: true,
        ref: "archive:spec:2026-03-15:dark-theme-support",
      }),
    ]);
    expect(await store.listCapabilities()).toEqual([
      expect.objectContaining({
        id: "theme-toggling",
        ref: "capability:theme-toggling",
      }),
    ]);
  }, 15000);
});
