import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { describe, expect, it } from "vitest";
import { handleWorkplanCommand } from "../extensions/commands/plan.js";
import { createPlanStore } from "../extensions/domain/store.js";

function createTempWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-plans-commands-"));
  return {
    cwd,
    cleanup: () => rmSync(cwd, { recursive: true, force: true }),
  };
}

function createContext(cwd: string): { ctx: ExtensionCommandContext } {
  return {
    ctx: {
      cwd,
      ui: {
        notify: () => undefined,
      },
    } as unknown as ExtensionCommandContext,
  };
}

describe("/workplan command handler", () => {
  it("initializes, creates, links tickets, shows packets and dashboards, updates, and archives plan state", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const { ctx } = createContext(cwd);
      const ticketStore = createTicketStore(cwd);
      const planStore = createPlanStore(cwd);

      const initialized = await handleWorkplanCommand("init", ctx);
      expect(initialized).toContain("catalog.sqlite");
      await expect(planStore.listPlans()).resolves.toEqual([]);

      const created = await handleWorkplanCommand(
        "create workspace repo Planning layer :: Bridge finalized specs into a linked ticket rollout :: Sequence implementation, review, and documentation work.",
        ctx,
      );
      expect(created).toContain("planning-layer [active] Planning layer");

      await expect(planStore.readPlan("planning-layer")).resolves.toMatchObject({
        summary: { id: "planning-layer", status: "active" },
      });

      const ticket = await ticketStore.createTicketAsync({
        title: "Implement plan package",
        summary: "Create the planning layer and its durable artifacts.",
      })

      const linked = await handleWorkplanCommand(`link-ticket planning-layer ${ticket.summary.id} implementation`, ctx);
      expect(linked).toContain("Linked tickets: 1");

      const packet = await handleWorkplanCommand("packet planning-layer", ctx);
      expect(packet).toContain("Planning Boundaries");
      expect(packet).toContain(ticket.summary.id);

      const updated = await handleWorkplanCommand(
        "update planning-layer :: Keep plan.md deeply detailed at the execution-strategy layer and tightly linked to tickets. :: Land domain store first, then wrappers. :: Run targeted vitest coverage and repo checks.",
        ctx,
      );
      expect(updated).toContain("planning-layer [active] Planning layer");
      expect(updated).toContain(
        "Keep plan.md deeply detailed at the execution strategy layer and tightly linked to tickets.",
      );

      const dashboard = await handleWorkplanCommand("dashboard planning-layer", ctx);
      expect(dashboard).toContain("Tickets: 1");
      expect(dashboard).toContain("ready=1");

      const archived = await handleWorkplanCommand("archive planning-layer", ctx);
      expect(archived).toContain("planning-layer [archived] Planning layer");

      await expect(planStore.readPlan("planning-layer")).resolves.toMatchObject({
        summary: { status: "archived" },
      });
    } finally {
      cleanup();
    }
  }, 120000);
});
