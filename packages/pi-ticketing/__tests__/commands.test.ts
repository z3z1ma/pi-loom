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
  it("always opens the ticket workspace and ignores human slash subcommands", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      await store.initLedgerAsync();
      await store.createTicketAsync({ title: "Seed ticket" });
      const ctx = createContext(cwd);

      const home = await handleTicketCommand("", ctx);
      const ignoredArgs = await handleTicketCommand("open detail #t-0001 status close nope", ctx);

      expect(home).toContain("Ticket workbench: overview");
      expect(home).toContain("Seed ticket");
      expect(ignoredArgs).toContain("Ticket workbench: overview");
      expect(ignoredArgs).toContain("Seed ticket");

      const ticket = await store.readTicketAsync("t-0001");
      expect(ticket.ticket.frontmatter.status).toBe("open");
    } finally {
      cleanup();
    }
  }, 15000);

  it("opens the overlay workbench in UI mode without blocking command completion", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      await store.initLedgerAsync();
      await store.createTicketAsync({ title: "Focus custom workspace" });
      const ui = {
        custom: vi.fn(async () => null),
        notify: vi.fn(),
        setWidget: vi.fn(),
      };
      const ctx = createContext(cwd, ui);

      const result = await Promise.race([
        handleTicketCommand("anything here is ignored", ctx),
        new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 50)),
      ]);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(result).toBe("");
      expect(ui.custom).toHaveBeenCalledTimes(1);
      const options = (ui.custom.mock.calls[0] as unknown[] | undefined)?.[1];
      expect(options).toMatchObject({
        overlay: true,
        overlayOptions: expect.objectContaining({ anchor: "center", width: 96, maxHeight: 40 }),
      });
    } finally {
      cleanup();
    }
  }, 15000);

  it("still supports direct ticket mutations from inside the interactive workspace", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      await store.initLedgerAsync();
      await store.createTicketAsync({ title: "Drive interactive edit" });
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

      const result = await handleTicketCommand("", ctx);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(result).toBe("");
      const updated = await store.readTicketAsync("t-0001");
      expect(updated.ticket.frontmatter.priority).toBe("high");
      expect(ui.notify).toHaveBeenCalledWith(expect.stringContaining("(task/high) Drive interactive edit"), "info");
    } finally {
      cleanup();
    }
  }, 30000);
});
