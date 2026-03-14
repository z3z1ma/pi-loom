import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { handleDocsCommand } from "../extensions/commands/docs.js";

function createTempWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-docs-commands-"));
  return {
    cwd,
    cleanup: () => rmSync(cwd, { recursive: true, force: true }),
  };
}

function createContext(cwd: string): {
  ctx: ExtensionCommandContext;
  ui: { notify: ReturnType<typeof vi.fn>; setEditorText: ReturnType<typeof vi.fn> };
  newSession: ReturnType<typeof vi.fn>;
} {
  const ui = {
    notify: vi.fn(),
    setEditorText: vi.fn(),
  };
  const newSession = vi.fn(async () => ({ cancelled: false }));
  return {
    ctx: {
      cwd,
      ui,
      newSession,
      sessionManager: {
        getSessionFile: () => join(cwd, ".pi", "sessions", "current.jsonl"),
      },
    } as unknown as ExtensionCommandContext,
    ui,
    newSession,
  };
}

describe("/docs command handler", () => {
  it("initializes, creates, opens an update handoff, shows dashboards, and archives durable docs state", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const { ctx, ui, newSession } = createContext(cwd);

      const initialized = await handleDocsCommand("init", ctx);
      expect(initialized).toContain(`Initialized docs memory at ${join(cwd, ".loom", "docs")}`);
      expect(existsSync(join(cwd, ".loom", "docs"))).toBe(true);

      const created = await handleDocsCommand(
        "create guide Documentation maintenance workflow :: Keep docs truthful after completed code changes",
        ctx,
      );
      expect(created).toContain("documentation-maintenance-workflow [active/guide]");

      const packet = await handleDocsCommand("packet documentation-maintenance-workflow", ctx);
      expect(packet).toContain("Documentation Boundaries");
      expect(packet).toContain("Do not generate API reference docs");

      const updated = await handleDocsCommand(
        "update documentation-maintenance-workflow :: Reflect the fresh-process maintainer handoff",
        ctx,
      );
      expect(updated).toContain("Documentation update handoff for documentation-maintenance-workflow");
      expect(newSession).toHaveBeenCalledWith({
        parentSession: join(cwd, ".pi", "sessions", "current.jsonl"),
      });
      expect(ui.setEditorText).toHaveBeenCalledWith(
        expect.stringContaining("Perform the documentation maintenance described in"),
      );
      expect(ui.notify).toHaveBeenCalledWith("Fresh documentation session ready. Submit when ready.", "info");

      const dashboard = await handleDocsCommand("dashboard documentation-maintenance-workflow", ctx);
      expect(dashboard).toContain("Revisions: 0");

      const archived = await handleDocsCommand("archive documentation-maintenance-workflow", ctx);
      expect(archived).toContain("documentation-maintenance-workflow [archived/guide]");
    } finally {
      cleanup();
    }
  });
});
