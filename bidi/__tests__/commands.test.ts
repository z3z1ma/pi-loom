import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { createSpecStore } from "#specs/domain/store.js";
import { resolveProjectionFilePath } from "#storage/projections.js";
import {
  handleLoomExportCommand,
  handleLoomReconcileCommand,
  handleLoomStatusCommand,
} from "../commands/loom-sync.js";

function createTempWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-bidi-commands-"));
  return {
    cwd,
    cleanup: () => rmSync(cwd, { recursive: true, force: true }),
  };
}

function createContext(cwd: string): ExtensionCommandContext {
  return {
    cwd,
    ui: {
      notify: () => undefined,
      setStatus: () => undefined,
    },
    hasUI: false,
  } as unknown as ExtensionCommandContext;
}

describe("Loom sync commands", () => {
  it("exports, reports status, and reconciles edited .loom files without going through /ticket", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      process.env.PI_LOOM_ROOT = join(cwd, ".pi-loom-bidi-command");
      const specStore = createSpecStore(cwd);
      const created = await specStore.createChange({
        title: "Workspace projections",
        summary: "Expose readable projections.",
      });
      await specStore.recordClarification(created.state.changeId, "Should generated sections stay read-only?", "Yes.");
      await specStore.updatePlan(created.state.changeId, {
        designNotes: "Render proposal and design surfaces through the shared substrate.",
        capabilities: [
          {
            title: "Projection export",
            summary: "Write deterministic markdown projections.",
            requirements: ["Export proposal and design content"],
            acceptance: ["Re-export without edits is byte stable."],
            scenarios: ["Operator reviews a mutable spec from .loom/specs."],
          },
        ],
      });

      const ctx = createContext(cwd);
      const exportText = await handleLoomExportCommand("specs", ctx);
      expect(exportText).toContain("Loom export");
      expect(exportText).toContain("specs: files=");

      const proposalPath = resolveProjectionFilePath(cwd, "specs", "workspace-projections/proposal.md");
      writeFileSync(
        proposalPath,
        readFileSync(proposalPath, "utf-8").replace(
          "Expose readable projections.",
          "Expose readable projections through the Loom sync command surface.",
        ),
        "utf-8",
      );

      const statusText = await handleLoomStatusCommand("specs workspace-projections/proposal.md", ctx);
      expect(statusText).toContain(".loom/specs/workspace-projections/proposal.md [modified/sections]");

      const reconcileText = await handleLoomReconcileCommand("specs workspace-projections/proposal.md", ctx);
      expect(reconcileText).toContain("Loom reconcile");
      expect((await specStore.readChange("workspace-projections")).state.proposalSummary).toBe(
        "Expose readable projections through the Loom sync command surface.",
      );
    } finally {
      delete process.env.PI_LOOM_ROOT;
      cleanup();
    }
  }, 30000);

  it("rejects file-level paths for export and refresh commands", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const ctx = createContext(cwd);
      await expect(handleLoomExportCommand("specs workspace-projections/proposal.md", ctx)).rejects.toThrow(
        "/loom-export supports workspace or family scope only; omit file paths.",
      );
    } finally {
      cleanup();
    }
  });
});
