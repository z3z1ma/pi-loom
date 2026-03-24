import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { findEntityByDisplayId } from "#storage/entities.js";
import { openWorkspaceStorage } from "#storage/workspace.js";

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
    cleanup: () => {
      delete process.env.PI_LOOM_ROOT;
      fs.rmSync(cwd, { recursive: true, force: true });
    },
  };
}

function createMockPi(): MockPi {
  const tools: RegisteredTools = new Map();
  const handlers: RegisteredHandlers = new Map();

  return {
    tools,
    handlers,
    registerCommand: vi.fn(),
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
  if (!handler) {
    throw new Error(`Missing handler ${eventName}`);
  }
  return handler;
}

describe("pi-constitution extension", () => {
  it("registers constitution tools and lifecycle hooks without slash commands", async () => {
    const mockPi = createMockPi();
    const { default: piConstitution } = await import("../extensions/index.js");

    piConstitution(mockPi as unknown as ExtensionAPI);

    expect(mockPi.registerCommand).not.toHaveBeenCalled();
    expect([...mockPi.tools.keys()].sort()).toEqual([
      "constitution_dashboard",
      "constitution_read",
      "constitution_roadmap",
      "constitution_write",
    ]);
    expect(mockPi.handlers.has("session_start")).toBe(true);
    expect(mockPi.handlers.has("before_agent_start")).toBe(true);
  });

  it("augments the system prompt with constitutional doctrine before agent start", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      process.env.PI_LOOM_ROOT = path.join(cwd, ".pi-loom-test");
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
      expect(result.systemPrompt).toContain("Constitutional state is persisted in SQLite via pi-storage.");
      expect(result.systemPrompt).toContain(
        "Consult constitutional memory before making strategic, roadmap, or constraint-sensitive decisions.",
      );
      const { storage, identity } = await openWorkspaceStorage(cwd);
      expect(await findEntityByDisplayId(storage, identity.space.id, "constitution", "constitution")).toBeTruthy();
    } finally {
      cleanup();
    }
  }, 30000);
});
