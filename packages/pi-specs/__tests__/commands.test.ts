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
  it("initializes, proposes, defines behavior, finalizes, and archives durable spec state", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      process.env.PI_LOOM_ROOT = join(cwd, ".pi-loom-test");
      const ctx = createContext(cwd);
      const store = createSpecStore(cwd);

      const initialized = await handleSpecCommand("init", ctx);
      expect(initialized).toContain("catalog.sqlite");
      expect(await store.listChanges({ includeArchived: true })).toEqual([]);

      const created = await handleSpecCommand("propose Dark theme support", ctx);
      expect(created).toContain("dark-theme-support [proposed]");

      const planned = await handleSpecCommand(
        "plan dark-theme-support Theme toggling :: Users can toggle dark mode | Theme preference persists :: Use CSS variables",
        ctx,
      );
      expect(planned).toContain("Capabilities: theme-toggling");

      const finalized = await handleSpecCommand("finalize dark-theme-support", ctx);
      expect(finalized).toContain("dark-theme-support [finalized]");

      const archived = await handleSpecCommand("archive dark-theme-support", ctx);
      expect(archived).toContain("dark-theme-support [archived]");
      expect((await store.readCapability("theme-toggling")).id).toBe("theme-toggling");
    } finally {
      cleanup();
    }
  }, 15000);
});
