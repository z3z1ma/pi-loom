import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { handleRalphCommand } from "../extensions/commands/ralph.js";

function createTempWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-ralph-commands-"));
  return {
    cwd,
    cleanup: () => rmSync(cwd, { recursive: true, force: true }),
  };
}

function createContext(cwd: string): {
  ctx: ExtensionCommandContext;
  ui: { notify: ReturnType<typeof vi.fn>; setEditorText: ReturnType<typeof vi.fn> };
  newSession: ReturnType<typeof vi.fn>;
  setCancelled: (value: boolean) => void;
} {
  const ui = {
    notify: vi.fn(),
    setEditorText: vi.fn(),
  };
  let cancelled = false;
  const newSession = vi.fn(async () => ({ cancelled }));
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
    setCancelled: (value: boolean) => {
      cancelled = value;
    },
  };
}

describe("/ralph command handler", () => {
  it("initializes, creates, lists, shows packets and dashboards, and prepares launch and resume sessions", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const { ctx, ui, newSession } = createContext(cwd);

      const initialized = await handleRalphCommand("init", ctx);
      expect(initialized).toContain("catalog.sqlite");

      const created = await handleRalphCommand(
        "create Ralph surface tests :: Keep launch and resume state durable across fresh sessions",
        ctx,
      );
      expect(created).toContain("ralph-surface-tests [planned/preparing] Ralph surface tests");
      expect(created).toContain("Keep launch and resume state durable across fresh sessions");

      const listed = await handleRalphCommand("list", ctx);
      expect(listed).toContain("ralph-surface-tests [planned/preparing] Ralph surface tests");

      const shown = await handleRalphCommand("show ralph-surface-tests", ctx);
      expect(shown).toContain("Waiting for: none");
      expect(shown).toContain("Launches: 0");

      const packet = await handleRalphCommand("packet ralph-surface-tests", ctx);
      expect(packet).toContain("# Ralph Packet: Ralph surface tests");
      expect(packet).toContain("Execution Guidance");

      const dashboard = await handleRalphCommand("dashboard ralph-surface-tests", ctx);
      expect(dashboard).toContain("Iterations: 0");
      expect(dashboard).toContain("Latest decision: none");

      const launched = await handleRalphCommand("launch ralph-surface-tests", ctx);
      expect(launched).toContain("Ralph launch descriptor for ralph-surface-tests");
      expect(launched).toContain("Runtime: subprocess");
      expect(launched).toContain("Resume: no");
      expect(newSession).toHaveBeenNthCalledWith(1, {
        parentSession: join(cwd, ".pi", "sessions", "current.jsonl"),
      });
      expect(ui.setEditorText).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("Execute one bounded Ralph iteration for run ralph-surface-tests"),
      );
      expect(ui.notify).toHaveBeenNthCalledWith(1, "Fresh Ralph session ready. Submit when ready.", "info");

      const resumed = await handleRalphCommand("resume ralph-surface-tests", ctx);
      expect(resumed).toContain("Ralph launch descriptor for ralph-surface-tests");
      expect(resumed).toContain("Resume: yes");
      expect(newSession).toHaveBeenNthCalledWith(2, {
        parentSession: join(cwd, ".pi", "sessions", "current.jsonl"),
      });
      expect(ui.setEditorText).toHaveBeenNthCalledWith(2, expect.stringContaining("Resume: yes"));
      expect(ui.notify).toHaveBeenNthCalledWith(2, "Fresh Ralph resume session ready. Submit when ready.", "info");
    } finally {
      cleanup();
    }
  }, 60000);

  it("cancels interactive launches without leaving false in-flight state behind", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const { ctx, ui, setCancelled } = createContext(cwd);

      await handleRalphCommand("init", ctx);
      await handleRalphCommand("create Cancelled launch run :: Ensure cancelled launches stay truthful", ctx);

      setCancelled(true);
      const cancelled = await handleRalphCommand("launch cancelled-launch-run", ctx);
      expect(cancelled).toContain("Cancelled Ralph launch for cancelled-launch-run.");
      expect(ui.setEditorText).not.toHaveBeenCalled();
      expect(ui.notify).not.toHaveBeenCalled();

      const shown = await handleRalphCommand("show cancelled-launch-run", ctx);
      expect(shown).toContain("Waiting for: none");
      expect(shown).toContain("Launches: 0");

      const packet = await handleRalphCommand("packet cancelled-launch-run", ctx);
      expect(packet).toContain("Interactive Ralph launch was cancelled.");
    } finally {
      cleanup();
    }
  }, 90000);
});
