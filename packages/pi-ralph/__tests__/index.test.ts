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

vi.mock("../extensions/domain/runtime.js", () => ({
  buildParentSessionRuntimeEnv: vi.fn(async () => ({})),
  runRalphLaunch: vi.fn(async () => ({
    command: "pi",
    args: ["--mode", "json"],
    exitCode: 0,
    output: "Mocked Ralph session runtime output",
    stderr: "",
  })),
}));

type RegisteredHandlers = Map<string, (event: unknown, ctx: ExtensionContext) => unknown>;
type RegisteredTools = Map<string, ToolDefinition>;
type RegisteredCommands = Map<string, RegisteredCommand>;

type MockPi = {
  tools: RegisteredTools;
  handlers: RegisteredHandlers;
  commands: RegisteredCommands;
  registerTool: ReturnType<typeof vi.fn>;
  registerCommand: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
};

function createTempWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-ralph-index-"));
  return {
    cwd,
    cleanup: () => rmSync(cwd, { recursive: true, force: true }),
  };
}

function createMockPi(): MockPi {
  const tools: RegisteredTools = new Map();
  const handlers: RegisteredHandlers = new Map();
  const commands: RegisteredCommands = new Map();

  return {
    tools,
    handlers,
    commands,
    registerTool: vi.fn((definition: ToolDefinition) => {
      tools.set(definition.name, definition);
    }),
    registerCommand: vi.fn((name: string, definition: RegisteredCommand) => {
      commands.set(name, definition);
    }),
    on: vi.fn((event: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) => {
      handlers.set(event, handler);
    }),
  };
}

function getHandler(mockPi: MockPi, eventName: string): (event: unknown, ctx: ExtensionContext) => unknown {
  const handler = mockPi.handlers.get(eventName);
  expect(handler).toBeDefined();
  if (!handler) {
    throw new Error(`Missing handler ${eventName}`);
  }
  return handler;
}

function getCommand(mockPi: MockPi, name: string): RegisteredCommand {
  const command = mockPi.commands.get(name);
  expect(command).toBeDefined();
  if (!command) {
    throw new Error(`Missing command ${name}`);
  }
  return command;
}

function createCommandContext(cwd: string): { ctx: ExtensionCommandContext; ui: { notify: ReturnType<typeof vi.fn> } } {
  const ui = { notify: vi.fn() };
  return {
    ctx: {
      cwd,
      ui,
      hasUI: false,
      sessionManager: {
        getBranch: () => [
          { type: "message", message: { role: "user", content: [{ type: "text", text: "Please investigate this issue." }] } },
          { type: "message", message: { role: "assistant", content: [{ type: "text", text: "I can do that." }] } },
        ],
      },
    } as unknown as ExtensionCommandContext,
    ui,
  };
}

describe("pi-ralph extension", () => {
  it("registers the human /ralph command, Ralph tools, and lifecycle hooks", async () => {
    const mockPi = createMockPi();
    const { default: piRalph } = await import("../extensions/index.js");

    piRalph(mockPi as unknown as ExtensionAPI);

    expect(mockPi.commands.has("ralph")).toBe(true);
    expect(getCommand(mockPi, "ralph").description).toContain("bounded Ralph loop");
    expect([...mockPi.tools.keys()].sort()).toEqual(["ralph_checkpoint", "ralph_list", "ralph_read", "ralph_run"]);
    expect(mockPi.handlers.has("session_start")).toBe(true);
    expect(mockPi.handlers.has("before_agent_start")).toBe(true);
  });

  it("routes /ralph through the command handler and initializes Ralph storage", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const mockPi = createMockPi();
      const { default: piRalph } = await import("../extensions/index.js");
      piRalph(mockPi as unknown as ExtensionAPI);

      const sessionStart = getHandler(mockPi, "session_start");
      await sessionStart({ type: "session_start" }, { cwd } as ExtensionContext);

      const command = getCommand(mockPi, "ralph");
      const { ctx, ui } = createCommandContext(cwd);
      await command.handler("x2 investigate issue durability", ctx);

      expect(ui.notify).toHaveBeenCalledWith(expect.stringContaining("Iterations executed this call:"), "info");
    } finally {
      cleanup();
    }
  });

  it("augments the system prompt with Ralph doctrine before agent start", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const mockPi = createMockPi();
      const { default: piRalph } = await import("../extensions/index.js");
      piRalph(mockPi as unknown as ExtensionAPI);
      const beforeAgentStart = getHandler(mockPi, "before_agent_start");

      const result = (await beforeAgentStart(
        { systemPrompt: "Base system prompt" } as BeforeAgentStartEvent,
        { cwd } as ExtensionContext,
      )) as { systemPrompt: string };

      expect(result.systemPrompt).toContain("Base system prompt");
      expect(result.systemPrompt).toContain("Ralph state is persisted in SQLite via pi-storage.");
      expect(result.systemPrompt).toContain(
        "Prefer durable Ralph packets and explicit policy decisions over ad hoc long-running transcripts.",
      );
    } finally {
      cleanup();
    }
  });
});
