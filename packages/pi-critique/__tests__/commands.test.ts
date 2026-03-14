import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { handleCritiqueCommand } from "../extensions/commands/critique.js";

function createTempWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-critique-commands-"));
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

describe("/critique command handler", () => {
  it("initializes, creates, launches, records runs, ticketifies findings, and resolves durable critique state", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const { ctx, ui, newSession } = createContext(cwd);

      const initialized = await handleCritiqueCommand("init", ctx);
      expect(initialized).toContain(`Initialized critique memory at ${join(cwd, ".loom", "critiques")}`);
      expect(existsSync(join(cwd, ".loom", "critiques"))).toBe(true);

      const created = await handleCritiqueCommand(
        "create workspace repo Critique package launch boundary :: Should critique launch require a fresh session?",
        ctx,
      );
      expect(created).toContain("critique-package-launch-boundary [active/concerns]");
      expect(created).toContain("workspace:repo");

      const packet = await handleCritiqueCommand("packet critique-package-launch-boundary", ctx);
      expect(packet).toContain("Fresh Context Protocol");

      const launched = await handleCritiqueCommand("launch critique-package-launch-boundary", ctx);
      expect(launched).toContain("descriptor_only");
      expect(existsSync(join(cwd, ".loom", "critiques", "critique-package-launch-boundary", "launch.json"))).toBe(true);
      expect(newSession).toHaveBeenCalledWith({
        parentSession: join(cwd, ".pi", "sessions", "current.jsonl"),
      });
      expect(ui.setEditorText).toHaveBeenCalledWith(expect.stringContaining("Perform the critique described in"));
      expect(ui.notify).toHaveBeenCalledWith("Fresh critique session ready. Submit when ready.", "info");

      const run = await handleCritiqueCommand(
        "run critique-package-launch-boundary adversarial needs_revision Missing launch coverage",
        ctx,
      );
      expect(run).toContain("Runs: 1");

      const finding = await handleCritiqueCommand(
        "finding critique-package-launch-boundary create run-001 missing_test high Missing launch verification :: The descriptor boundary is not exercised yet. :: Add tests that assert descriptor-only launch behavior.",
        ctx,
      );
      expect(finding).toContain("Open findings: 1");

      const ticketified = await handleCritiqueCommand(
        "ticketify critique-package-launch-boundary finding-001 Add launch verification follow-up",
        ctx,
      );
      expect(ticketified).toContain("Follow-up tickets: t-0001");

      const fixed = await handleCritiqueCommand(
        "finding critique-package-launch-boundary update finding-001 fixed",
        ctx,
      );
      expect(fixed).toContain("Open findings: 0");

      const resolved = await handleCritiqueCommand("resolve critique-package-launch-boundary", ctx);
      expect(resolved).toContain("critique-package-launch-boundary [resolved/pass]");
    } finally {
      cleanup();
    }
  });
});
