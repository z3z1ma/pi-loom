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
import { createSpecStore } from "../extensions/domain/store.js";

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
  const cwd = mkdtempSync(join(tmpdir(), "pi-specs-index-"));
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

describe("pi-specs extension", () => {
  it("registers the /spec command, spec tools, and lifecycle hooks", async () => {
    const mockPi = createMockPi();
    const { default: piSpecs } = await import("../extensions/index.js");

    piSpecs(mockPi as unknown as ExtensionAPI);

    expect(mockPi.commands.has("spec")).toBe(true);
    expect(getCommand(mockPi, "spec").description).toContain("durable specifications");
    expect([...mockPi.tools.keys()].sort()).toEqual(["spec_analyze", "spec_list", "spec_read", "spec_write"]);
    expect(mockPi.handlers.has("session_start")).toBe(true);
    expect(mockPi.handlers.has("before_agent_start")).toBe(true);
  });

  it("routes /spec output through the registered command handler and initializes SQLite-backed spec state", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      process.env.PI_LOOM_ROOT = join(cwd, ".pi-loom-test");
      const mockPi = createMockPi();
      const { default: piSpecs } = await import("../extensions/index.js");
      piSpecs(mockPi as unknown as ExtensionAPI);

      const command = getCommand(mockPi, "spec");
      const sessionStart = getHandler(mockPi, "session_start");
      const { ctx, ui } = createCommandContext(cwd);
      const store = createSpecStore(cwd);

      await sessionStart({ type: "session_start" }, { cwd } as ExtensionContext);
      expect(await store.listChanges({ includeArchived: true })).toEqual([]);

      await command.handler("propose Dark theme support", ctx);

      expect(ui.notify).toHaveBeenCalledWith(expect.stringContaining("dark-theme-support [proposed]"), "info");
      expect(ui.notify).toHaveBeenCalledWith(expect.stringContaining("Dark theme support"), "info");
      await expect(store.readChange("dark-theme-support")).resolves.toMatchObject({
        summary: { id: "dark-theme-support", status: "proposed" },
        state: { proposalSummary: "Dark theme support" },
      });
    } finally {
      cleanup();
    }
  }, 30000);

  it("augments the system prompt with spec doctrine before agent start", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      process.env.PI_LOOM_ROOT = join(cwd, ".pi-loom-test");
      const mockPi = createMockPi();
      const { default: piSpecs } = await import("../extensions/index.js");
      piSpecs(mockPi as unknown as ExtensionAPI);
      const beforeAgentStart = getHandler(mockPi, "before_agent_start");

      const result = (await beforeAgentStart(
        { systemPrompt: "Base system prompt" } as BeforeAgentStartEvent,
        { cwd } as ExtensionContext,
      )) as { systemPrompt: string };

      expect(result.systemPrompt).toContain("Base system prompt");
      expect(result.systemPrompt).toContain(
        "Specifications are declarative, implementation-decoupled descriptions of desired program behavior.",
      );
      expect(result.systemPrompt).toContain("Specification state is persisted in SQLite via pi-storage.");
      expect(result.systemPrompt).toContain(
        "Prefer spec tools before implementation on non-trivial feature work, and use plans to translate accepted behavior into ticketed execution.",
      );
    } finally {
      cleanup();
    }
  });
});
