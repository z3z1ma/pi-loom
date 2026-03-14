import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  RegisteredCommand,
  ToolDefinition,
} from "@mariozechner/pi-coding-agent";
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
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-constitution-index-"));
  return {
    cwd,
    cleanup: () => fs.rmSync(cwd, { recursive: true, force: true }),
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

describe("pi-constitution extension", () => {
  it("registers the /constitution command, constitution tools, and lifecycle hooks", async () => {
    const mockPi = createMockPi();
    const { default: piConstitution } = await import("../extensions/index.js");

    piConstitution(mockPi as unknown as ExtensionAPI);

    expect(mockPi.commands.has("constitution")).toBe(true);
    expect(getCommand(mockPi, "constitution").description).toContain("constitutional memory");
    expect([...mockPi.tools.keys()].sort()).toEqual([
      "constitution_dashboard",
      "constitution_read",
      "constitution_roadmap",
      "constitution_write",
    ]);
    expect(mockPi.handlers.has("session_start")).toBe(true);
    expect(mockPi.handlers.has("before_agent_start")).toBe(true);
  });

  it("routes /constitution output through the registered command handler and initializes constitutional memory", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const mockPi = createMockPi();
      const { default: piConstitution } = await import("../extensions/index.js");
      piConstitution(mockPi as unknown as ExtensionAPI);

      const command = getCommand(mockPi, "constitution");
      const sessionStart = getHandler(mockPi, "session_start");
      const { ctx, ui } = createCommandContext(cwd);

      await sessionStart({ type: "session_start" }, { cwd } as ExtensionContext);
      expect(fs.existsSync(path.join(cwd, ".loom", "constitution"))).toBe(true);

      await command.handler(
        "update vision Preserve durable project intent :: Ground agents with compiled constitutional memory",
        ctx,
      );

      expect(ui.notify).toHaveBeenCalledWith(expect.stringContaining("Vision complete: yes"), "info");
      expect(ui.notify).toHaveBeenCalledWith(expect.stringContaining("Preserve durable project intent"), "info");
    } finally {
      cleanup();
    }
  });

  it("augments the system prompt with constitutional doctrine before agent start", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const mockPi = createMockPi();
      const { default: piConstitution } = await import("../extensions/index.js");
      piConstitution(mockPi as unknown as ExtensionAPI);
      const beforeAgentStart = getHandler(mockPi, "before_agent_start");

      const result = (await beforeAgentStart(
        { systemPrompt: "Base system prompt" } as BeforeAgentStartEvent,
        { cwd } as ExtensionContext,
      )) as { systemPrompt: string };

      expect(result.systemPrompt).toContain("Base system prompt");
      expect(result.systemPrompt).toContain("Constitutional memory is the highest-order project context");
      expect(result.systemPrompt).toContain(path.join(cwd, ".loom", "constitution"));
      expect(result.systemPrompt).toContain(path.join(cwd, ".loom", "constitution", "brief.md"));
      expect(result.systemPrompt).toContain(
        "Consult constitutional memory before making strategic, roadmap, or constraint-sensitive decisions.",
      );
      expect(fs.existsSync(path.join(cwd, ".loom", "constitution"))).toBe(true);
    } finally {
      cleanup();
    }
  });
});
