import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { describe, expect, it, vi } from "vitest";
import { createWorkerStore } from "../extensions/domain/store.js";

vi.mock("@mariozechner/pi-ai", () => ({
  StringEnum: (values: readonly string[]) => ({ type: "string", enum: [...values] }),
}));

vi.mock("@sinclair/typebox", () => ({
  Type: {
    Array: (value: unknown) => ({ type: "array", items: value }),
    Boolean: () => ({ type: "boolean" }),
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

type RegisteredHandlers = Map<string, (event: unknown, ctx: ExtensionContext) => unknown>;
type RegisteredTools = Map<string, ToolDefinition>;

type MockPi = {
  tools: RegisteredTools;
  handlers: RegisteredHandlers;
  registerTool: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
};

function createTempWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-workers-index-"));
  process.env.PI_LOOM_ROOT = join(cwd, ".pi-loom-test");
  return {
    cwd,
    cleanup: () => {
      delete process.env.PI_LOOM_ROOT;
      rmSync(cwd, { recursive: true, force: true });
    },
  };
}

function createMockPi(): MockPi {
  const tools: RegisteredTools = new Map();
  const handlers: RegisteredHandlers = new Map();

  return {
    tools,
    handlers,
    registerTool: vi.fn((definition: ToolDefinition) => {
      tools.set(definition.name, definition);
    }),
    on: vi.fn((event: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) => {
      handlers.set(event, handler);
    }),
  };
}

function getHandler(mockPi: MockPi, eventName: string): (event: unknown, ctx: ExtensionContext) => unknown {
  const handler = mockPi.handlers.get(eventName);
  expect(handler).toBeDefined();
  if (!handler) throw new Error(`Missing handler ${eventName}`);
  return handler;
}

describe("pi-workers extension", () => {
  it("registers worker tools and lifecycle hooks without slash commands", async () => {
    const mockPi = createMockPi();
    const { default: piWorkers } = await import("../extensions/index.js");

    piWorkers(mockPi as unknown as ExtensionAPI);

    expect((mockPi as { registerCommand?: ReturnType<typeof vi.fn> }).registerCommand).toBeUndefined();
    expect([...mockPi.tools.keys()].sort()).toEqual([
      "manager_overview",
      "manager_schedule",
      "manager_supervise",
      "manager_write",
      "worker_dashboard",
      "worker_launch",
      "worker_list",
      "worker_read",
      "worker_resume",
      "worker_supervise",
      "worker_write",
    ]);
    expect(mockPi.handlers.has("session_start")).toBe(true);
    expect(mockPi.handlers.has("before_agent_start")).toBe(true);
  });

  it("initializes worker storage on session start", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const mockPi = createMockPi();
      const { default: piWorkers } = await import("../extensions/index.js");
      piWorkers(mockPi as unknown as ExtensionAPI);

      const sessionStart = getHandler(mockPi, "session_start");
      await sessionStart({ type: "session_start" }, { cwd } as ExtensionContext);
      expect(await createWorkerStore(cwd).listWorkersAsync()).toEqual([]);

      const ticketStore = createTicketStore(cwd);
      await ticketStore.initLedgerAsync();
      await ticketStore.createTicketAsync({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });
      expect(await ticketStore.listTicketsAsync()).toHaveLength(1);
    } finally {
      cleanup();
    }
  }, 30000);

  it("augments the system prompt with worker doctrine before agent start", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const mockPi = createMockPi();
      const { default: piWorkers } = await import("../extensions/index.js");
      piWorkers(mockPi as unknown as ExtensionAPI);
      const beforeAgentStart = getHandler(mockPi, "before_agent_start");

      const result = (await beforeAgentStart(
        { systemPrompt: "Base system prompt" } as BeforeAgentStartEvent,
        { cwd } as ExtensionContext,
      )) as { systemPrompt: string };

      expect(result.systemPrompt).toContain("Base system prompt");
      expect(result.systemPrompt).toContain("Worker state is persisted in SQLite via pi-storage.");
      expect(result.systemPrompt).toContain("Prefer durable worker records");
    } finally {
      cleanup();
    }
  });
});
