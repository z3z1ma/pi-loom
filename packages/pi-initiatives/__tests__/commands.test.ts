import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { createSpecStore } from "../../pi-specs/extensions/domain/store.js";
import { createTicketStore } from "../../pi-ticketing/extensions/domain/store.js";
import { handleInitiativeCommand } from "../extensions/commands/initiative.js";

function createTempWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-initiatives-commands-"));
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

describe("/initiative command handler", () => {
  it("initializes, creates, links work, shows dashboards, and archives durable initiative state", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      process.env.PI_LOOM_ROOT = join(cwd, ".pi-loom-test");
      const ctx = createContext(cwd);
      const specStore = createSpecStore(cwd);
      const ticketStore = createTicketStore(cwd);
      await specStore.createChange({ title: "Add dark mode", summary: "Support a dark theme." });
      const ticket = ticketStore.createTicket({ title: "Build theme toggle" });

      const initialized = await handleInitiativeCommand("init", ctx);
      expect(initialized).toContain(`Initialized initiative memory at ${join(cwd, ".loom", "initiatives")}`);
      expect(existsSync(join(cwd, ".loom", "initiatives"))).toBe(true);

      const created = await handleInitiativeCommand("create Platform modernization", ctx);
      expect(created).toContain("platform-modernization [proposed]");

      const linkedSpec = await handleInitiativeCommand("link-spec platform-modernization add-dark-mode", ctx);
      expect(linkedSpec).toContain("Dashboard specs: 1");
      expect(specStore.readChangeProjection("add-dark-mode").state.initiativeIds).toEqual(["platform-modernization"]);

      const linkedTicket = await handleInitiativeCommand(
        `link-ticket platform-modernization ${ticket.summary.id}`,
        ctx,
      );
      expect(linkedTicket).toContain("Dashboard tickets: 1");
      expect(ticketStore.readTicket(ticket.summary.id).summary.initiativeIds).toEqual(["platform-modernization"]);

      const milestone = await handleInitiativeCommand(
        `milestone platform-modernization Define migration path :: Lock the first delivery milestone :: add-dark-mode :: ${ticket.summary.id}`,
        ctx,
      );
      expect(milestone).toContain("platform-modernization [proposed]");

      const dashboard = await handleInitiativeCommand("dashboard platform-modernization", ctx);
      expect(dashboard).toContain("Ready tickets: 1");
      expect(dashboard).toContain("Milestones:");

      const archived = await handleInitiativeCommand("archive platform-modernization", ctx);
      expect(archived).toContain("platform-modernization [archived]");
    } finally {
      cleanup();
    }
  }, 15000);
});
