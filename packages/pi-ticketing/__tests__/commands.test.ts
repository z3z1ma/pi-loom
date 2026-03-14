import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { handleTicketCommand } from "../extensions/commands/ticket.js";

function createTempWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-ticketing-commands-"));
  return {
    cwd,
    cleanup: () => rmSync(cwd, { recursive: true, force: true }),
  };
}

function createContext(cwd: string): ExtensionCommandContext {
  return { cwd } as unknown as ExtensionCommandContext;
}

describe("/ticket command handler", () => {
  it("initializes, creates, shows, starts, closes, and journals durable ticket state", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const ctx = createContext(cwd);

      const initialized = await handleTicketCommand("init", ctx);
      expect(initialized).toContain(`Initialized ticket ledger at ${join(cwd, ".loom")}`);
      expect(existsSync(join(cwd, ".loom", "tickets"))).toBe(true);

      const created = await handleTicketCommand("create Harden extension coverage", ctx);
      expect(created).toContain("t-0001 [ready] (task/medium) Harden extension coverage");
      expect(created).toContain("Journal entries: 1");

      const shown = await handleTicketCommand("show #t-0001", ctx);
      expect(shown).toContain("Stored status: open");
      expect(shown).toContain("Attachments: 0");
      expect(shown).toContain("Checkpoints: 0");

      const started = await handleTicketCommand("start t-0001", ctx);
      expect(started).toContain("t-0001 [in_progress] (task/medium) Harden extension coverage");
      expect(started).toContain("Journal entries: 2");

      const closed = await handleTicketCommand("close t-0001 verified in staging", ctx);
      expect(closed).toContain("t-0001 [closed] (task/medium) Harden extension coverage");
      expect(closed).toContain("Stored status: closed");
      expect(existsSync(join(cwd, ".loom", "tickets", "closed", "t-0001.md"))).toBe(true);

      const journal = await handleTicketCommand("journal packages/pi-ticketing/t-0001.md", ctx);
      expect(journal).toContain("[state] Created ticket Harden extension coverage");
      expect(journal).toContain("[state] Started work");
      expect(journal).toContain("[verification] verified in staging");
    } finally {
      cleanup();
    }
  });
});
