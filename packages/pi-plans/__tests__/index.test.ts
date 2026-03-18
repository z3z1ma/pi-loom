import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  RegisteredCommand,
  ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { createPlanStore } from "../extensions/domain/store.js";

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

type RegisteredHandlers = Map<string, (event: unknown, ctx: ExtensionContext) => unknown>;
type RegisteredTools = Map<string, ToolDefinition>;

type MockPi = {
  commands: Map<string, Omit<RegisteredCommand, "name">>;
  tools: RegisteredTools;
  handlers: RegisteredHandlers;
  registerCommand: ReturnType<typeof vi.fn>;
  registerTool: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
};

function createTempWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-plans-index-"));
  return {
    cwd,
    cleanup: () => rmSync(cwd, { recursive: true, force: true }),
  };
}

function createMockPi(): MockPi {
  const commands = new Map<string, Omit<RegisteredCommand, "name">>();
  const tools: RegisteredTools = new Map();
  const handlers: RegisteredHandlers = new Map();

  return {
    commands,
    tools,
    handlers,
    registerCommand: vi.fn((name: string, options: Omit<RegisteredCommand, "name">) => {
      commands.set(name, options);
    }),
    registerTool: vi.fn((definition: ToolDefinition) => {
      tools.set(definition.name, definition);
    }),
    on: vi.fn((event: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) => {
      handlers.set(event, handler);
    }),
  };
}

function getCommand(mockPi: MockPi, name: string): Omit<RegisteredCommand, "name"> {
  const command = mockPi.commands.get(name);
  expect(command).toBeDefined();
  if (!command) {
    throw new Error(`Missing command ${name}`);
  }
  return command;
}

function getHandler(mockPi: MockPi, eventName: string): (event: unknown, ctx: ExtensionContext) => unknown {
  const handler = mockPi.handlers.get(eventName);
  expect(handler).toBeDefined();
  if (!handler) {
    throw new Error(`Missing handler ${eventName}`);
  }
  return handler;
}

function createCommandContext(cwd: string): { ctx: ExtensionCommandContext; ui: { notify: ReturnType<typeof vi.fn> } } {
  const ui = { notify: vi.fn() };
  return {
    ctx: {
      cwd,
      ui,
    } as unknown as ExtensionCommandContext,
    ui,
  };
}

describe("pi-plans extension", () => {
  it("registers the /workplan command, plan tools, and lifecycle hooks", async () => {
    const mockPi = createMockPi();
    const { default: piPlans } = await import("../extensions/index.js");

    piPlans(mockPi as unknown as ExtensionAPI);

    expect(mockPi.commands.has("workplan")).toBe(true);
    expect(getCommand(mockPi, "workplan").description).toContain("execution plans");
    expect([...mockPi.tools.keys()].sort()).toEqual([
      "plan_dashboard",
      "plan_list",
      "plan_packet",
      "plan_read",
      "plan_ticket_link",
      "plan_write",
    ]);
    expect(mockPi.handlers.has("session_start")).toBe(true);
    expect(mockPi.handlers.has("before_agent_start")).toBe(true);
  });

  it("routes /workplan output through the registered command handler and initializes plan storage", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const mockPi = createMockPi();
      const { default: piPlans } = await import("../extensions/index.js");
      piPlans(mockPi as unknown as ExtensionAPI);
      const planStore = createPlanStore(cwd);

      const command = getCommand(mockPi, "workplan");
      const sessionStart = getHandler(mockPi, "session_start");
      const { ctx, ui } = createCommandContext(cwd);

      await sessionStart({ type: "session_start" }, { cwd } as ExtensionContext);
      await expect(planStore.listPlans()).resolves.toEqual([]);

      await command.handler(
        "create workspace repo Planning layer :: Bridge bounded specs into linked ticket execution",
        ctx,
      );

      await expect(planStore.readPlan("planning-layer")).resolves.toMatchObject({
        summary: { id: "planning-layer", status: "active" },
      });

      expect(ui.notify).toHaveBeenCalledWith(expect.stringContaining("planning-layer [active] Planning layer"), "info");
      expect(ui.notify).toHaveBeenCalledWith(expect.stringContaining("Source target: workspace:repo"), "info");
    } finally {
      cleanup();
    }
  });

  it("augments the system prompt with planning doctrine before agent start", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const mockPi = createMockPi();
      const { default: piPlans } = await import("../extensions/index.js");
      piPlans(mockPi as unknown as ExtensionAPI);
      const beforeAgentStart = getHandler(mockPi, "before_agent_start");

      const result = (await beforeAgentStart(
        { systemPrompt: "Base system prompt" } as BeforeAgentStartEvent,
        { cwd } as ExtensionContext,
      )) as { systemPrompt: string };

      expect(result.systemPrompt).toContain("Base system prompt");
      expect(result.systemPrompt).toContain("Plans are a first-class Loom memory layer.");
      expect(result.systemPrompt).toContain("Plan state is persisted in SQLite via pi-storage.");
      expect(result.systemPrompt).toContain(
        "Prefer plan packets for durable execution strategy and ticket tools for the live execution state.",
      );
    } finally {
      cleanup();
    }
  });
});
