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
import { createTicketStore } from "../extensions/domain/store.js";

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
  commands: Map<string, Omit<RegisteredCommand, "name">>;
  tools: RegisteredTools;
  handlers: RegisteredHandlers;
  registerCommand: ReturnType<typeof vi.fn>;
  registerTool: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
};

function createTempWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-ticketing-index-"));
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

function createCommandContext(
  cwd: string,
  options?: {
    hasUI?: boolean;
    customResult?: unknown;
  },
): {
  ctx: ExtensionCommandContext;
  ui: {
    notify: ReturnType<typeof vi.fn>;
    custom: ReturnType<typeof vi.fn>;
    input: ReturnType<typeof vi.fn>;
    editor: ReturnType<typeof vi.fn>;
    setWidget: ReturnType<typeof vi.fn>;
  };
} {
  const ui = {
    notify: vi.fn(),
    custom: vi.fn(async () => options?.customResult ?? null),
    input: vi.fn(async () => undefined),
    editor: vi.fn(async () => undefined),
    setWidget: vi.fn(),
  };
  return {
    ctx: {
      cwd,
      ui,
      hasUI: options?.hasUI ?? false,
    } as unknown as ExtensionCommandContext,
    ui,
  };
}

describe("pi-ticketing extension", () => {
  it("registers the /ticket workspace command, ticket tools, and lifecycle hooks", async () => {
    const mockPi = createMockPi();
    const { default: piTicketing } = await import("../extensions/index.js");

    piTicketing(mockPi as unknown as ExtensionAPI);

    expect(mockPi.commands.has("ticket")).toBe(true);
    expect(getCommand(mockPi, "ticket").description).toContain("workspace");
    expect([...mockPi.tools.keys()].sort()).toEqual([
      "ticket_checkpoint",
      "ticket_graph",
      "ticket_list",
      "ticket_read",
      "ticket_write",
    ]);
    expect(mockPi.handlers.has("session_start")).toBe(true);
    expect(mockPi.handlers.has("before_agent_start")).toBe(true);
  });

  it("routes textual fallback output through notifications and interactive focused views through custom UI", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const mockPi = createMockPi();
      const { default: piTicketing } = await import("../extensions/index.js");
      piTicketing(mockPi as unknown as ExtensionAPI);

      const command = getCommand(mockPi, "ticket");
      const sessionStart = getHandler(mockPi, "session_start");
      const { ctx: fallbackCtx, ui: fallbackUi } = createCommandContext(cwd, { hasUI: false });
      const { ctx: interactiveCtx, ui: interactiveUi } = createCommandContext(cwd, {
        hasUI: true,
        customResult: null,
      });
      const store = createTicketStore(cwd);

      await sessionStart({ type: "session_start" }, { cwd } as ExtensionContext);
      expect(await store.listTicketsAsync({ includeClosed: true })).toEqual([]);

      await command.handler("create Establish durable ledger coverage", fallbackCtx);
      expect(fallbackUi.notify).toHaveBeenCalledWith(
        expect.stringContaining("Establish durable ledger coverage"),
        "info",
      );

      fallbackUi.notify.mockClear();
      await command.handler("open home", fallbackCtx);
      expect(fallbackUi.notify).toHaveBeenCalledWith(
        expect.stringMatching(/ticket|ready|blocked|review|open/i),
        "info",
      );
      expect(fallbackUi.setWidget).toHaveBeenCalled();

      await command.handler("open detail #t-0001", interactiveCtx);
      expect(interactiveUi.custom).toHaveBeenCalledTimes(1);
      expect(interactiveUi.notify).not.toHaveBeenCalled();
    } finally {
      cleanup();
    }
  }, 15000);

  it("augments the system prompt with ticketing doctrine before agent start", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const mockPi = createMockPi();
      const { default: piTicketing } = await import("../extensions/index.js");
      piTicketing(mockPi as unknown as ExtensionAPI);
      const beforeAgentStart = getHandler(mockPi, "before_agent_start");

      const result = (await beforeAgentStart(
        { systemPrompt: "Base system prompt" } as BeforeAgentStartEvent,
        { cwd } as ExtensionContext,
      )) as { systemPrompt: string };

      expect(result.systemPrompt).toContain("Base system prompt");
      expect(result.systemPrompt).toContain("Ticketing is the default execution ledger for non-trivial work.");
      expect(result.systemPrompt).toContain("use specs before creating tickets for new capabilities");
      expect(result.systemPrompt).toContain(join(cwd, ".loom"));
      expect(result.systemPrompt).toContain(
        "Prefer ticket tools for live work state and plan tools for durable multi-ticket execution strategy.",
      );
      expect(await createTicketStore(cwd).listTicketsAsync({ includeClosed: true })).toEqual([]);
    } finally {
      cleanup();
    }
  });
});
