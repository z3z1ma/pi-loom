import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, RegisteredCommand, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { exportSpecProjections } from "#specs/domain/projection.js";
import { createSpecStore } from "#specs/domain/store.js";

vi.mock("@mariozechner/pi-ai", () => ({
  StringEnum: (values: readonly string[]) => ({ type: "string", enum: [...values] }),
}));

vi.mock("@sinclair/typebox", () => ({
  Type: {
    Array: (value: unknown) => ({ type: "array", items: value }),
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
  const cwd = mkdtempSync(join(tmpdir(), "pi-bidi-index-"));
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

function getHandler(mockPi: MockPi, eventName: string): (event: unknown, ctx: ExtensionContext) => unknown {
  const handler = mockPi.handlers.get(eventName);
  expect(handler).toBeDefined();
  if (!handler) {
    throw new Error(`Missing handler ${eventName}`);
  }
  return handler;
}

function getCommand(mockPi: MockPi, name: string): Omit<RegisteredCommand, "name"> {
  const command = mockPi.commands.get(name);
  expect(command).toBeDefined();
  if (!command) {
    throw new Error(`Missing command ${name}`);
  }
  return command;
}

function createCommandContext(
  cwd: string,
  options?: {
    hasUI?: boolean;
  },
): {
  ctx: ExtensionCommandContext;
  ui: {
    notify: ReturnType<typeof vi.fn>;
    setStatus: ReturnType<typeof vi.fn>;
  };
} {
  const ui = {
    notify: vi.fn(),
    setStatus: vi.fn(),
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

describe("pi-bidi extension", () => {
  it("registers Loom sync commands, projection tools, and lifecycle hooks", async () => {
    const mockPi = createMockPi();
    const { default: piBidi } = await import("../index.js");

    piBidi(mockPi as unknown as ExtensionAPI);

    expect([...mockPi.commands.keys()].sort()).toEqual([
      "loom-export",
      "loom-reconcile",
      "loom-refresh",
      "loom-status",
    ]);
    expect(getCommand(mockPi, "loom-export").description).toContain(".loom");
    expect([...mockPi.tools.keys()].sort()).toEqual(["projection_status", "projection_write"]);
    expect(mockPi.handlers.has("session_start")).toBe(true);
    expect(mockPi.handlers.has("session_switch")).toBe(true);
    expect(mockPi.handlers.has("session_fork")).toBe(true);
  });

  it("bootstraps .loom state and reports dirty sync status during session start", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      process.env.PI_LOOM_ROOT = join(cwd, ".pi-loom-bidi-test");
      const specStore = createSpecStore(cwd);
      await specStore.createChange({ title: "Workspace projections", summary: "Expose readable projections." });
      const exported = await exportSpecProjections(cwd);
      writeFileSync(exported.files[0].path, "Locally edited projection\n", "utf-8");

      const mockPi = createMockPi();
      const { default: piBidi } = await import("../index.js");
      piBidi(mockPi as unknown as ExtensionAPI);
      const sessionStart = getHandler(mockPi, "session_start");
      const { ctx, ui } = createCommandContext(cwd, { hasUI: true });

      await sessionStart({ type: "session_start" }, ctx as unknown as ExtensionContext);

      expect(existsSync(join(cwd, ".loom"))).toBe(true);
      expect(existsSync(join(cwd, ".loom", "specs"))).toBe(true);
      expect(existsSync(join(cwd, ".loom", "tickets"))).toBe(true);
      expect(ui.setStatus).toHaveBeenCalledWith("loom-sync", expect.stringContaining("specs 1 modified"));
    } finally {
      delete process.env.PI_LOOM_ROOT;
      cleanup();
    }
  });
});
