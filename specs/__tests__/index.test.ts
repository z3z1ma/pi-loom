import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { createSpecStore } from "../domain/store.js";

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
  if (!handler) {
    throw new Error(`Missing handler ${eventName}`);
  }
  return handler;
}

describe("pi-specs extension", () => {
  it("registers spec tools and lifecycle hooks", async () => {
    const mockPi = createMockPi();
    const { default: piSpecs } = await import("../index.js");

    piSpecs(mockPi as unknown as ExtensionAPI);

    expect([...mockPi.tools.keys()].sort()).toEqual(["spec_analyze", "spec_list", "spec_read", "spec_write"]);
    expect(mockPi.handlers.has("session_start")).toBe(true);
    expect(mockPi.handlers.has("before_agent_start")).toBe(true);
  });

  it("initializes SQLite-backed spec state at session start", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      process.env.PI_LOOM_ROOT = join(cwd, ".pi-loom-test");
      const mockPi = createMockPi();
      const { default: piSpecs } = await import("../index.js");
      piSpecs(mockPi as unknown as ExtensionAPI);

      const sessionStart = getHandler(mockPi, "session_start");
      const store = createSpecStore(cwd);

      await sessionStart({ type: "session_start" }, { cwd } as ExtensionContext);
      expect(await store.listChanges({ includeArchived: true })).toEqual([]);
    } finally {
      cleanup();
    }
  }, 15000);

  it("augments the system prompt with spec doctrine before agent start", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      process.env.PI_LOOM_ROOT = join(cwd, ".pi-loom-test");
      const mockPi = createMockPi();
      const { default: piSpecs } = await import("../index.js");
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
