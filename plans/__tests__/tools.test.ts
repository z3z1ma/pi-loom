import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { createTicketStore } from "#ticketing/domain/store.js";

vi.mock("@mariozechner/pi-ai", () => ({
  StringEnum: (values: readonly string[]) => ({ type: "string", enum: [...values] }),
}));

vi.mock("@sinclair/typebox", () => ({
  Type: {
    Array: (value: unknown) => ({ type: "array", items: value }),
    Number: () => ({ type: "number" }),
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
  const cwd = mkdtempSync(join(tmpdir(), "pi-plans-tools-"));
  return {
    cwd,
    cleanup: () => rmSync(cwd, { recursive: true, force: true }),
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

describe("plan tools", () => {
  it("registers tool definitions with prompt snippets and guidelines", async () => {
    const mockPi = createMockPi();
    const { registerPlanTools } = await import("../tools/plan.js");
    registerPlanTools(mockPi as unknown as ExtensionAPI);

    expect([...mockPi.tools.keys()].sort()).toEqual([
      "plan_list",
      "plan_overview",
      "plan_packet",
      "plan_read",
      "plan_ticket_link",
      "plan_write",
    ]);

    for (const tool of mockPi.tools.values()) {
      expect(tool.promptSnippet).toEqual(expect.any(String));
      expect(tool.promptSnippet?.length).toBeGreaterThan(20);
      expect(tool.promptGuidelines).toEqual(expect.arrayContaining([expect.any(String)]));
    }

    expect(getTool(mockPi, "plan_ticket_link").promptSnippet).toContain("execution strategy stays detailed");
    expect(getTool(mockPi, "plan_write").promptGuidelines).toContain(
      "Use `linkedTicketInputs` when the execution slice is already clear and you can still write every ticket as a self-contained execution record with concrete acceptance and verification detail. Omit `linkedTicketInputs` when you need to scaffold the plan first and spend more room authoring the tickets later.",
    );
    expect(
      (
        getTool(mockPi, "plan_read").parameters as unknown as {
          properties: {
            repositoryId: { type: string; optional: boolean };
            worktreeId: { type: string; optional: boolean };
          };
        }
      ).properties.repositoryId,
    ).toMatchObject({ type: "string", optional: true });
    expect(
      (
        getTool(mockPi, "plan_read").parameters as unknown as {
          properties: {
            repositoryId: { type: string; optional: boolean };
            worktreeId: { type: string; optional: boolean };
          };
        }
      ).properties.worktreeId,
    ).toMatchObject({ type: "string", optional: true });
    expect(
      (
        getTool(mockPi, "plan_write").parameters as unknown as {
          properties: {
            repositoryId: { type: string; optional: boolean };
            worktreeId: { type: string; optional: boolean };
          };
        }
      ).properties.repositoryId,
    ).toMatchObject({ type: "string", optional: true });
    expect(
      (
        getTool(mockPi, "plan_overview").parameters as unknown as {
          properties: {
            repositoryId: { type: string; optional: boolean };
            worktreeId: { type: string; optional: boolean };
          };
        }
      ).properties.worktreeId,
    ).toMatchObject({ type: "string", optional: true });
    expect(
      (
        getTool(mockPi, "plan_write").parameters as unknown as {
          properties: {
            linkedTicketInputs: { type: string; items: { properties: Record<string, unknown> }; optional: boolean };
          };
        }
      ).properties.linkedTicketInputs,
    ).toMatchObject({ type: "array", optional: true });
  });

  it("returns machine-usable shapes for integrated create, update, read, packet, ticket-link, overview, and list flows", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const mockPi = createMockPi();
      const { registerPlanTools } = await import("../tools/plan.js");
      registerPlanTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(cwd);
      const ticketStore = createTicketStore(cwd);

      const planWrite = getTool(mockPi, "plan_write");
      const planRead = getTool(mockPi, "plan_read");
      const planPacket = getTool(mockPi, "plan_packet");
      const planTicketLink = getTool(mockPi, "plan_ticket_link");
      const planOverview = getTool(mockPi, "plan_overview");
      const planList = getTool(mockPi, "plan_list");

      const created = await planWrite.execute(
        "call-1",
        {
          action: "create",
          title: "Planning layer rollout",
          summary: "Bridge specs into a durable multi-ticket execution plan.",
          purpose:
            "Keep planning deeply detailed at the execution-strategy layer while linked tickets carry live execution detail.",
          milestones: "Milestone 1 lands the store; milestone 2 validates the command surface.",
          idempotenceAndRecovery: "Re-running the targeted vitest command is safe after partial edits.",
          interfacesAndDependencies: "Keep createPlanStore and renderPlanMarkdown as the central plan surfaces.",
          sourceTarget: { kind: "workspace", ref: "repo" },
          scopePaths: ["plans", "README.md"],
          progress: [
            {
              timestamp: "2026-03-17T12:00:00.000Z",
              status: "pending",
              text: "Fill in the durable workplan sections before execution continues.",
            },
          ],
          linkedTicketInputs: [
            {
              title: "Implement plan store",
              summary: "Persist state, packet, plan markdown, and overview artifacts.",
              acceptance: ["Plan write can materialize tickets in one cohesive call."],
              verification: "Run targeted plan package tests.",
              role: "implementation",
            },
          ],
        },
        undefined,
        undefined,
        ctx,
      );
      expect(created.details).toMatchObject({
        action: "create",
        plan: {
          state: {
            linkedTickets: [expect.objectContaining({ role: "implementation" })],
          },
          summary: {
            id: "planning-layer-rollout",
            repository: expect.objectContaining({ id: expect.any(String), slug: expect.any(String) }),
          },
        },
        materializedTickets: [
          expect.objectContaining({ summary: expect.objectContaining({ id: expect.any(String) }) }),
        ],
      });

      const createdTicketId = (
        created.details as {
          materializedTickets: Array<{ summary: { id: string } }>;
        }
      ).materializedTickets[0]?.summary.id;
      expect(createdTicketId).toEqual(expect.any(String));
      if (!createdTicketId) {
        throw new Error("Expected created linked ticket id");
      }

      const ticket = await ticketStore.createTicketAsync({
        title: "Review integrated workflow",
        summary: "Verify existing-ticket materialization through plan updates.",
      });

      const updated = await planWrite.execute(
        "call-2",
        {
          action: "update",
          ref: "planning-layer-rollout",
          linkedTicketInputs: [{ ticketRef: ticket.summary.id, role: "review" }],
        },
        undefined,
        undefined,
        ctx,
      );
      expect(updated.details).toMatchObject({
        action: "update",
        plan: {
          state: {
            linkedTickets: [
              expect.objectContaining({ ticketId: createdTicketId, role: "implementation" }),
              expect.objectContaining({ ticketId: ticket.summary.id, role: "review" }),
            ],
          },
        },
        materializedTickets: [expect.objectContaining({ summary: expect.objectContaining({ id: ticket.summary.id }) })],
      });

      const unlinked = await planTicketLink.execute(
        "call-3",
        { action: "unlink", ref: "planning-layer-rollout", ticketId: ticket.summary.id },
        undefined,
        undefined,
        ctx,
      );
      expect(unlinked.details).toMatchObject({
        action: "unlink",
        plan: {
          state: {
            linkedTickets: [expect.objectContaining({ ticketId: createdTicketId, role: "implementation" })],
          },
        },
      });

      const packet = await planPacket.execute("call-4", { ref: "planning-layer-rollout" }, undefined, undefined, ctx);
      expect(packet.details).toMatchObject({
        plan: { id: "planning-layer-rollout" },
      });
      expect(packet.content[0]).toMatchObject({ type: "text" });
      if (packet.content[0]?.type !== "text") {
        throw new Error("Expected packet text content");
      }
      expect(packet.content[0].text).toContain("Planning Boundaries");

      const read = await planRead.execute(
        "call-5",
        { ref: "planning-layer-rollout", mode: "plan" },
        undefined,
        undefined,
        ctx,
      );
      expect(read.details).toMatchObject({
        plan: { id: "planning-layer-rollout" },
      });
      expect(read.content[0]).toMatchObject({ type: "text" });
      if (read.content[0]?.type !== "text") {
        throw new Error("Expected plan text content");
      }
      expect(read.content[0].text).toContain(`Ticket ${createdTicketId}`);
      expect(read.content[0].text).toContain("## Milestones");
      expect(read.content[0].text).toContain("## Idempotence and Recovery");
      expect(read.content[0].text).toContain("## Revision Notes");

      const overview = await planOverview.execute(
        "call-6",
        { ref: "planning-layer-rollout" },
        undefined,
        undefined,
        ctx,
      );
      expect(overview.details).toMatchObject({
        overview: {
          plan: {
            id: "planning-layer-rollout",
            repository: expect.objectContaining({ id: expect.any(String), slug: expect.any(String) }),
          },
          counts: { tickets: 1 },
        },
      });

      const listed = await planList.execute(
        "call-7",
        { exactSourceKind: "workspace", exactLinkedTicketId: createdTicketId },
        undefined,
        undefined,
        ctx,
      );
      expect(listed.details).toMatchObject({
        plans: [
          expect.objectContaining({
            id: "planning-layer-rollout",
            linkedTicketCount: 1,
            repository: expect.objectContaining({ id: expect.any(String), slug: expect.any(String) }),
          }),
        ],
      });
    } finally {
      cleanup();
    }
  }, 60000);

  it("surfaces broader matches when exact list filters overconstrain plan discovery", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const mockPi = createMockPi();
      const { registerPlanTools } = await import("../tools/plan.js");
      registerPlanTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(cwd);

      const planWrite = getTool(mockPi, "plan_write");
      const planList = getTool(mockPi, "plan_list");

      await planWrite.execute(
        "call-overfiltered-create",
        {
          action: "create",
          title: "Production-readiness rollout for first-class multi-repository Loom spaces",
          sourceTarget: { kind: "workspace", ref: "repo" },
        },
        undefined,
        undefined,
        ctx,
      );

      const listed = await planList.execute(
        "call-overfiltered-list",
        {
          text: "multi-repository loom spaces",
          exactSourceKind: "initiative",
        },
        undefined,
        undefined,
        ctx,
      );

      expect(listed.details).toMatchObject({
        plans: [],
        queryDiagnostics: {
          exactFilters: [{ key: "exactSourceKind", value: "initiative" }],
          broaderMatchCount: 1,
        },
        broaderMatches: [
          expect.objectContaining({ id: "production-readiness-rollout-for-first-class-multi-repository-loom-spaces" }),
        ],
      });
      expect(listed.content).toEqual([
        {
          type: "text",
          text: expect.stringContaining("Broader text-only matches without exact filters:"),
        },
      ]);
    } finally {
      cleanup();
    }
  });
});
