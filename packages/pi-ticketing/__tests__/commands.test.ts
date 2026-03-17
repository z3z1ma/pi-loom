import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { handleTicketCommand } from "../extensions/commands/ticket.js";
import { createTicketStore } from "../extensions/domain/store.js";

function createTempWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-ticketing-commands-"));
  return {
    cwd,
    cleanup: () => rmSync(cwd, { recursive: true, force: true }),
  };
}

function createContext(
  cwd: string,
  ui?: {
    notify?: ReturnType<typeof vi.fn>;
    custom?: ReturnType<typeof vi.fn>;
    input?: ReturnType<typeof vi.fn>;
    editor?: ReturnType<typeof vi.fn>;
    setWidget?: ReturnType<typeof vi.fn>;
  },
): ExtensionCommandContext {
  return {
    cwd,
    ui,
    hasUI: Boolean(ui?.custom),
  } as unknown as ExtensionCommandContext;
}

describe("/ticket command handler", () => {
  it("advertises only the human widget verbs and rejects removed tool-mirroring subcommands", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const ctx = createContext(cwd);

      const usage = await handleTicketCommand("", ctx);
      expect(usage).toContain("open");
      expect(usage).toContain("create");
      expect(usage).toContain("review");
      expect(usage).not.toContain("start");
      expect(usage).not.toContain("show");
      expect(usage).not.toContain("journal");

      await expect(handleTicketCommand("start t-0001", ctx)).rejects.toThrow("Unknown /ticket subcommand: start");
      await expect(handleTicketCommand("close t-0001", ctx)).rejects.toThrow("Unknown /ticket subcommand: close");
    } finally {
      cleanup();
    }
  });

  it("creates tickets and falls back to textual focused views when custom UI is unavailable", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const ctx = createContext(cwd);

      const created = await handleTicketCommand("create Harden extension coverage", ctx);
      expect(created).toContain("t-0001");
      expect(created).toContain("Harden extension coverage");
      expect(created).toContain("Stored status: open");

      const home = await handleTicketCommand("open home", ctx);
      expect(home.trim().length).toBeGreaterThan(0);
      expect(home.toLowerCase()).toMatch(/ticket|ready|blocked|review|open/);

      const list = await handleTicketCommand("open list", ctx);
      expect(list).toContain("t-0001");
      expect(list).toContain("Harden extension coverage");

      const board = await handleTicketCommand("open board", ctx);
      expect(board).toContain("t-0001");
      expect(board).toContain("Harden extension coverage");

      const timeline = await handleTicketCommand("open timeline", ctx);
      expect(timeline).toContain("t-0001 [ready] Harden extension coverage");

      const detail = await handleTicketCommand("open detail #t-0001", ctx);
      expect(detail).toContain("Harden extension coverage");
      expect(detail).toContain("Stored status: open");
    } finally {
      cleanup();
    }
  }, 15000);

  it("supports direct detail actions in textual fallback mode", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const ctx = createContext(cwd);

      await handleTicketCommand("create Headless fallback action", ctx);

      const edited = await handleTicketCommand("open detail #t-0001 edit priority high", ctx);
      expect(edited).toContain("(task/high) Headless fallback action");

      const closed = await handleTicketCommand("open detail #t-0001 status close verified in fallback", ctx);
      expect(closed).toContain("Stored status: closed");
      expect(closed).toContain("verified in fallback");

      const reopened = await handleTicketCommand("open detail #t-0001 status reopen", ctx);
      expect(reopened).toContain("Stored status: open");
      expect(reopened).toContain("[ready]");
    } finally {
      cleanup();
    }
  }, 15000);

  it("uses ctx.ui.custom for focused views when interactive UI is available", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const ui = {
        custom: vi.fn(async () => null),
        notify: vi.fn(),
        setWidget: vi.fn(),
      };
      const ctx = createContext(cwd, ui);

      await handleTicketCommand("create Focus custom workspace", ctx);
      const result = await handleTicketCommand("open detail #t-0001", ctx);

      expect(result).toBe("");
      expect(ui.custom).toHaveBeenCalledTimes(1);
      expect(ui.custom.mock.calls[0]?.[1]).toMatchObject({
        overlay: true,
        overlayOptions: expect.objectContaining({ anchor: "center" }),
      });
    } finally {
      cleanup();
    }
  }, 15000);

  it("applies direct interactive workspace edits without raw slash commands", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const ui = {
        custom: vi
          .fn()
          .mockResolvedValueOnce({ kind: "edit", ref: "t-0001", field: "priority" })
          .mockResolvedValueOnce({ kind: "close" }),
        input: vi.fn(async () => "high"),
        editor: vi.fn(async () => undefined),
        notify: vi.fn(),
        setWidget: vi.fn(),
      };
      const ctx = createContext(cwd, ui);

      await handleTicketCommand("create Drive interactive edit", ctx);
      const result = await handleTicketCommand("open detail #t-0001", ctx);

      expect(result).toBe("");
      const updated = await createTicketStore(cwd).readTicketAsync("t-0001");
      expect(updated.ticket.frontmatter.priority).toBe("high");
      expect(ui.notify).toHaveBeenCalledWith(expect.stringContaining("(task/high) Drive interactive edit"), "info");
    } finally {
      cleanup();
    }
  }, 30000);

  it("reviews ready and blocked work through human review verbs", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      const blocker = await store.createTicketAsync({ title: "Unblock identity service" });
      const dependent = await store.createTicketAsync({
        title: "Resume login rollout",
        deps: [blocker.summary.id],
      });
      const ctx = createContext(cwd);

      const ready = await handleTicketCommand("review ready", ctx);
      expect(ready).toContain(blocker.summary.id);
      expect(ready).toContain("Unblock identity service");

      const blocked = await handleTicketCommand("review blocked", ctx);
      expect(blocked).toContain(dependent.summary.id);
      expect(blocked).toContain("Resume login rollout");
      expect(blocked).toContain(blocker.summary.id);
    } finally {
      cleanup();
    }
  }, 15000);
});
