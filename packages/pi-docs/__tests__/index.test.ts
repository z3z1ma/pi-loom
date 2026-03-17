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
import { createDocumentationStore } from "../extensions/domain/store.js";

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
  const cwd = mkdtempSync(join(tmpdir(), "pi-docs-index-"));
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

describe("pi-docs extension", () => {
  it("registers the /docs command, docs tools, and lifecycle hooks", async () => {
    const mockPi = createMockPi();
    const { default: piDocs } = await import("../extensions/index.js");

    piDocs(mockPi as unknown as ExtensionAPI);

    expect(mockPi.commands.has("docs")).toBe(true);
    expect(getCommand(mockPi, "docs").description).toContain("documentation memory");
    expect([...mockPi.tools.keys()].sort()).toEqual([
      "docs_dashboard",
      "docs_list",
      "docs_packet",
      "docs_read",
      "docs_update",
      "docs_write",
    ]);
    expect(mockPi.handlers.has("session_start")).toBe(true);
    expect(mockPi.handlers.has("before_agent_start")).toBe(true);
  });

  it("routes /docs output through the registered command handler and initializes docs storage", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const mockPi = createMockPi();
      const { default: piDocs } = await import("../extensions/index.js");
      piDocs(mockPi as unknown as ExtensionAPI);
      const docsStore = createDocumentationStore(cwd);

      const command = getCommand(mockPi, "docs");
      const sessionStart = getHandler(mockPi, "session_start");
      const { ctx, ui } = createCommandContext(cwd);

      await sessionStart({ type: "session_start" }, { cwd } as ExtensionContext);
      await expect(docsStore.listDocs()).resolves.toEqual([]);

      await command.handler("create overview Documentation memory layer", ctx);

      await expect(docsStore.readDoc("documentation-memory-layer")).resolves.toMatchObject({
        summary: { id: "documentation-memory-layer", docType: "overview", status: "active" },
      });

      expect(ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("documentation-memory-layer [active/overview]"),
        "info",
      );
      expect(ui.notify).toHaveBeenCalledWith(expect.stringContaining("Source target: workspace:repo"), "info");
    } finally {
      cleanup();
    }
  });

  it("augments the system prompt with docs doctrine before agent start", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const mockPi = createMockPi();
      const { default: piDocs } = await import("../extensions/index.js");
      piDocs(mockPi as unknown as ExtensionAPI);
      const beforeAgentStart = getHandler(mockPi, "before_agent_start");

      const result = (await beforeAgentStart(
        { systemPrompt: "Base system prompt" } as BeforeAgentStartEvent,
        { cwd } as ExtensionContext,
      )) as { systemPrompt: string };

      expect(result.systemPrompt).toContain("Base system prompt");
      expect(result.systemPrompt).toContain("Documentation is a first-class Loom memory layer.");
      expect(result.systemPrompt).toContain(join(cwd, ".loom", "docs"));
      expect(result.systemPrompt).toContain(
        "Prefer docs packets and durable high-level documentation over chat-only explanations.",
      );
    } finally {
      cleanup();
    }
  });
});
