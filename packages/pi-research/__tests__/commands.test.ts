import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { handleResearchCommand } from "../extensions/commands/research.js";

function createContext(cwd: string): ExtensionCommandContext {
  return { cwd, ui: { notify: () => undefined } } as unknown as ExtensionCommandContext;
}

describe("research commands", () => {
  it("initializes, creates, records hypotheses and artifacts, renders dashboards and maps, and archives state", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-research-commands-"));
    try {
      const ctx = createContext(cwd);
      expect(await handleResearchCommand("init", ctx)).toContain("Initialized research memory");

      const created = await handleResearchCommand("create Evaluate theme architecture", ctx);
      expect(created).toContain("evaluate-theme-architecture [proposed]");

      const hypothesis = await handleResearchCommand(
        "hypothesis evaluate-theme-architecture Shared service reduces duplication :: duplicated persistence reads :: prototype removes duplicate logic :: supported :: high",
        ctx,
      );
      expect(hypothesis).toContain("Hypotheses: 1");

      const artifact = await handleResearchCommand(
        "artifact evaluate-theme-architecture experiment Prototype summary :: Centralized theme writes :: Prototype notes :: https://example.com :: hyp-001",
        ctx,
      );
      expect(artifact).toContain("Artifacts: 1");

      const dashboard = await handleResearchCommand("dashboard evaluate-theme-architecture", ctx);
      expect(dashboard).toContain("Rejected hypotheses: 0");

      const map = await handleResearchCommand("map evaluate-theme-architecture", ctx);
      expect(map).toContain("supports_hypothesis");

      const archived = await handleResearchCommand("archive evaluate-theme-architecture", ctx);
      expect(archived).toContain("evaluate-theme-architecture [archived]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);
});
