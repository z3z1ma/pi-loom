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
import { createInitiativeStore } from "../extensions/domain/store.js";
import { describe, expect, it, vi } from "vitest";

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
  const cwd = mkdtempSync(join(tmpdir(), "pi-initiatives-index-"));
  return {
    cwd,
    cleanup: () => {
      delete process.env.PI_LOOM_ROOT;
      rmSync(cwd, { recursive: true, force: true });
    },
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

describe("pi-initiatives extension", () => {
  it("registers the /initiative command, initiative tools, and lifecycle hooks", async () => {
    const mockPi = createMockPi();
    const { default: piInitiatives } = await import("../extensions/index.js");

    piInitiatives(mockPi as unknown as ExtensionAPI);

    expect(mockPi.commands.has("initiative")).toBe(true);
    expect(getCommand(mockPi, "initiative").description).toContain("durable initiatives");
    expect([...mockPi.tools.keys()].sort()).toEqual([
      "initiative_dashboard",
      "initiative_list",
      "initiative_read",
      "initiative_write",
    ]);
    expect(mockPi.handlers.has("session_start")).toBe(true);
    expect(mockPi.handlers.has("before_agent_start")).toBe(true);
  });

  it("routes /initiative output through the registered command handler and initializes the ledger", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      process.env.PI_LOOM_ROOT = join(cwd, ".pi-loom-test");
      const mockPi = createMockPi();
      const { default: piInitiatives } = await import("../extensions/index.js");
      piInitiatives(mockPi as unknown as ExtensionAPI);

      const command = getCommand(mockPi, "initiative");
      const sessionStart = getHandler(mockPi, "session_start");
      const { ctx, ui } = createCommandContext(cwd);

      await sessionStart({ type: "session_start" }, { cwd } as ExtensionContext);

      await command.handler("create Platform modernization", ctx);

      expect(ui.notify).toHaveBeenCalledWith(expect.stringContaining("platform-modernization [proposed]"), "info");
      expect(ui.notify).toHaveBeenCalledWith(expect.stringContaining("Platform modernization"), "info");
      await expect(createInitiativeStore(cwd).readInitiative("platform-modernization")).resolves.toMatchObject({
        summary: { id: "platform-modernization", title: "Platform modernization", status: "proposed" },
      });
    } finally {
      cleanup();
    }
  });

  it("augments the system prompt with initiative doctrine before agent start", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      process.env.PI_LOOM_ROOT = join(cwd, ".pi-loom-test");
      const mockPi = createMockPi();
      const { default: piInitiatives } = await import("../extensions/index.js");
      piInitiatives(mockPi as unknown as ExtensionAPI);
      const beforeAgentStart = getHandler(mockPi, "before_agent_start");

      const result = (await beforeAgentStart(
        { systemPrompt: "Base system prompt" } as BeforeAgentStartEvent,
        { cwd } as ExtensionContext,
      )) as { systemPrompt: string };

      expect(result.systemPrompt).toContain("Base system prompt");
      expect(result.systemPrompt).toContain("Initiatives are the default strategic container for long-horizon work.");
      expect(result.systemPrompt).toContain("Initiative state is persisted in SQLite via pi-storage.");
      expect(result.systemPrompt).toContain(
        "Prefer initiative tools before ad-hoc strategic tracking for program-level work.",
      );
    } finally {
      cleanup();
    }
  });
});
