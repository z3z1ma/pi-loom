import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { handleSpecCommand } from "../extensions/commands/spec.js";
import { createSpecStore } from "../extensions/domain/store.js";

function createTempWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-specs-commands-"));
  return {
    cwd,
    cleanup: () => {
      delete process.env.PI_LOOM_ROOT;
      rmSync(cwd, { recursive: true, force: true });
    },
  };
}

function createContext(cwd: string): ExtensionCommandContext {
  return { cwd } as unknown as ExtensionCommandContext;
}

describe("/spec command handler", () => {
  it("initializes, proposes, plans, tasks, finalizes, projects, and archives durable spec state", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      process.env.PI_LOOM_ROOT = join(cwd, ".pi-loom-test");
      const ctx = createContext(cwd);
      const store = createSpecStore(cwd);

      const initialized = await handleSpecCommand("init", ctx);
      expect(initialized).toContain(`Initialized spec memory at ${join(cwd, ".loom", "specs")}`);
      expect(await store.listChanges({ includeArchived: true })).toEqual([]);

      const created = await handleSpecCommand("propose Add dark mode", ctx);
      expect(created).toContain("add-dark-mode [proposed]");

      const planned = await handleSpecCommand(
        "plan add-dark-mode Theme toggling :: Users can toggle dark mode :: Use CSS variables",
        ctx,
      );
      expect(planned).toContain("Capabilities: theme-toggling");

      const tasked = await handleSpecCommand("tasks add-dark-mode Implement theme toggle :: req-001", ctx);
      expect(tasked).toContain("Tasks: 1");

      const finalized = await handleSpecCommand("finalize add-dark-mode", ctx);
      expect(finalized).toContain("add-dark-mode [finalized]");

      const projected = await handleSpecCommand("tickets add-dark-mode", ctx);
      expect(projected).toContain("Linked tickets: 1");
      expect((await store.readChange("add-dark-mode")).linkedTickets?.links).toHaveLength(1);

      const archived = await handleSpecCommand("archive add-dark-mode", ctx);
      expect(archived).toContain("add-dark-mode [archived]");
      expect((await store.readCapability("theme-toggling")).id).toBe("theme-toggling");
    } finally {
      cleanup();
    }
  }, 15000);
});
