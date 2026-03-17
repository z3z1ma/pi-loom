import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { createSpecStore } from "../../pi-specs/extensions/domain/store.js";
import { createTicketStore } from "../../pi-ticketing/extensions/domain/store.js";

vi.mock("@mariozechner/pi-ai", () => ({
  StringEnum: (values: readonly string[]) => ({ type: "string", enum: [...values] }),
}));

vi.mock("@sinclair/typebox", () => ({
  Type: {
    Array: (value: unknown) => ({ type: "array", items: value }),
    Boolean: () => ({ type: "boolean" }),
    Object: (properties: Record<string, unknown>, options?: Record<string, unknown>) => ({
      type: "object",
      properties,
      ...(options ?? {}),
    }),
    Optional: (value: unknown) => ({ ...((value as Record<string, unknown>) ?? {}), optional: true }),
    String: (options?: Record<string, unknown>) => ({ type: "string", ...(options ?? {}) }),
  },
}));

type MockPi = {
  tools: Map<string, ToolDefinition>;
  registerTool: ReturnType<typeof vi.fn>;
};

function createTempWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-initiatives-tools-"));
  return {
    cwd,
    cleanup: () => {
      delete process.env.PI_LOOM_ROOT;
      rmSync(cwd, { recursive: true, force: true });
    },
  };
}

function createMockPi(): MockPi {
  const tools = new Map<string, ToolDefinition>();
  return {
    tools,
    registerTool: vi.fn((definition: ToolDefinition) => {
      tools.set(definition.name, definition);
    }),
  };
}

function getTool(mockPi: MockPi, name: string): ToolDefinition {
  const tool = mockPi.tools.get(name);
  expect(tool).toBeDefined();
  if (!tool) {
    throw new Error(`Missing tool ${name}`);
  }
  return tool;
}

function createContext(cwd: string): ExtensionContext {
  return { cwd } as ExtensionContext;
}

describe("initiative tools", () => {
  it("registers tool definitions with prompt snippets and prompt guidelines", async () => {
    const mockPi = createMockPi();
    const { registerInitiativeTools } = await import("../extensions/tools/initiative.js");
    registerInitiativeTools(mockPi as unknown as ExtensionAPI);

    expect([...mockPi.tools.keys()].sort()).toEqual([
      "initiative_dashboard",
      "initiative_list",
      "initiative_read",
      "initiative_write",
    ]);

    for (const tool of mockPi.tools.values()) {
      expect(tool.promptSnippet).toEqual(expect.any(String));
      expect(tool.promptSnippet?.length).toBeGreaterThan(20);
      expect(tool.promptGuidelines).toEqual(expect.arrayContaining([expect.any(String)]));
    }

    expect(getTool(mockPi, "initiative_write").promptSnippet).toContain("Persist a substantial strategic record");
  });

  it("returns machine-usable shapes for list, read, write, and dashboard flows", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      process.env.PI_LOOM_ROOT = join(cwd, ".pi-loom-test");
      const specStore = createSpecStore(cwd);
      const ticketStore = createTicketStore(cwd);
      await specStore.createChange({ title: "Add dark mode", summary: "Support a dark theme." });
      const ticket = await ticketStore.createTicketAsync({ title: "Build theme toggle" })

      const mockPi = createMockPi();
      const { registerInitiativeTools } = await import("../extensions/tools/initiative.js");
      registerInitiativeTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(cwd);

      const initiativeWrite = getTool(mockPi, "initiative_write");
      const initiativeList = getTool(mockPi, "initiative_list");
      const initiativeRead = getTool(mockPi, "initiative_read");
      const initiativeDashboard = getTool(mockPi, "initiative_dashboard");

      const created = await initiativeWrite.execute(
        "call-1",
        {
          action: "create",
          title: "Platform modernization",
          objective: "Coordinate strategic modernization.",
          tags: ["modernization"],
        },
        undefined,
        undefined,
        ctx,
      );
      expect(created.details).toMatchObject({
        action: "create",
        initiative: {
          summary: { id: "platform-modernization", status: "proposed" },
        },
      });

      const linkedSpec = await initiativeWrite.execute(
        "call-2",
        { action: "link_spec", ref: "platform-modernization", specChangeId: "add-dark-mode" },
        undefined,
        undefined,
        ctx,
      );
      expect(linkedSpec.details).toMatchObject({
        action: "link_spec",
        initiative: {
          state: { specChangeIds: ["add-dark-mode"] },
        },
      });

      const linkedTicket = await initiativeWrite.execute(
        "call-3",
        { action: "link_ticket", ref: "platform-modernization", ticketId: ticket.summary.id },
        undefined,
        undefined,
        ctx,
      );
      expect(linkedTicket.details).toMatchObject({
        action: "link_ticket",
        initiative: {
          state: { ticketIds: [ticket.summary.id] },
        },
      });
      expect(ticketStore.readTicket(ticket.summary.id).summary.initiativeIds).toEqual(["platform-modernization"]);

      const milestone = await initiativeWrite.execute(
        "call-4",
        {
          action: "upsert_milestone",
          ref: "platform-modernization",
          milestone: { title: "Ship first slice", ticketIds: [ticket.summary.id] },
        },
        undefined,
        undefined,
        ctx,
      );
      expect(milestone.details).toMatchObject({
        action: "upsert_milestone",
        initiative: {
          state: { milestones: [expect.objectContaining({ id: "milestone-001" })] },
        },
      });

      const listed = await initiativeList.execute("call-5", { includeArchived: true }, undefined, undefined, ctx);
      expect(listed.details).toMatchObject({
        initiatives: [expect.objectContaining({ id: "platform-modernization" })],
      });

      const read = await initiativeRead.execute("call-6", { ref: "platform-modernization" }, undefined, undefined, ctx);
      expect(read.details).toMatchObject({
        initiative: {
          summary: { id: "platform-modernization" },
          dashboard: { linkedSpecs: { total: 1 }, linkedTickets: { total: 1 } },
        },
      });

      const dashboard = await initiativeDashboard.execute(
        "call-7",
        { ref: "platform-modernization" },
        undefined,
        undefined,
        ctx,
      );
      expect(dashboard.details).toMatchObject({
        dashboard: {
          linkedSpecs: { total: 1 },
          linkedTickets: { total: 1, ready: 1 },
          milestones: [expect.objectContaining({ linkedOpenTicketCount: 1 })],
        },
      });
    } finally {
      cleanup();
    }
  }, 30000);
});
