import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  RegisteredCommand,
  ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleRalphCommand } from "../extensions/commands/ralph.js";

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

vi.mock("../extensions/commands/ralph.js", () => ({
  handleRalphCommand: vi.fn(),
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
  registerMessageRenderer: ReturnType<typeof vi.fn>;
  registerCommand: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
};

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
    registerMessageRenderer: vi.fn(),
    registerCommand: vi.fn((name: string, definition: RegisteredCommand) => {
      commands.set(name, definition);
    }),
    on: vi.fn((event: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) => {
      handlers.set(event, handler);
    }),
    sendMessage: vi.fn(),
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

function createCommandContext(cwd: string): {
  ctx: ExtensionCommandContext;
  ui: {
    notify: ReturnType<typeof vi.fn>;
    onTerminalInput: ReturnType<typeof vi.fn>;
    getEditorText: ReturnType<typeof vi.fn>;
    setEditorText: ReturnType<typeof vi.fn>;
  };
} {
  const ui = {
    notify: vi.fn(),
    onTerminalInput: vi.fn(() => () => {}),
    getEditorText: vi.fn(() => ""),
    setEditorText: vi.fn(),
  };
  return {
    ctx: {
      cwd,
      ui,
      hasUI: true,
      sessionManager: {
        getBranch: () => [
          {
            type: "message",
            message: { role: "user", content: [{ type: "text", text: "Please investigate this issue." }] },
          },
          { type: "message", message: { role: "assistant", content: [{ type: "text", text: "I can do that." }] } },
        ],
      },
    } as unknown as ExtensionCommandContext,
    ui,
  };
}

describe("pi-ralph-wiggum extension", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers the human /ralph command, Ralph tools, and lifecycle hooks", async () => {
    const mockPi = createMockPi();
    const { default: piRalph } = await import("../extensions/index.js");

    piRalph(mockPi as unknown as ExtensionAPI);

    expect(mockPi.commands.has("ralph")).toBe(true);
    expect(mockPi.registerMessageRenderer).toHaveBeenCalledWith("ralph-command-result", expect.any(Function));
    expect(mockPi.registerMessageRenderer).toHaveBeenCalledWith("ralph-command-error", expect.any(Function));
    expect(getCommand(mockPi, "ralph").description).toContain("managed Ralph runs");
    expect([...mockPi.tools.keys()].sort()).toEqual([
      "ralph_job_cancel",
      "ralph_job_read",
      "ralph_job_wait",
      "ralph_list",
      "ralph_read",
      "ralph_run",
      "ralph_steer",
      "ralph_stop",
    ]);
    expect(mockPi.handlers.has("session_start")).toBe(true);
    expect(mockPi.handlers.has("session_switch")).toBe(true);
    expect(mockPi.handlers.has("session_fork")).toBe(true);
    expect(mockPi.handlers.has("before_agent_start")).toBe(true);
  });

  it("intercepts interactive /ralph input before normal prompt submission", async () => {
    const mockPi = createMockPi();
    const { default: piRalph } = await import("../extensions/index.js");
    piRalph(mockPi as unknown as ExtensionAPI);

    vi.mocked(handleRalphCommand).mockResolvedValueOnce({
      text: "Rendered Ralph command output",
      result: {
        created: true,
        steps: [],
        run: {
          summary: { id: "ralph-run", status: "active", phase: "executing", title: "Loop" },
          state: { latestDecision: null, waitingFor: "none", postIteration: null },
          runtimeArtifacts: [],
        },
      },
    } as never);

    const sessionStart = getHandler(mockPi, "session_start");
    const { ctx, ui } = createCommandContext("/workspace/ralph-index");
    ui.getEditorText.mockReturnValue("/ralph start ticket-1 tighten verifier gating");

    await sessionStart({ type: "session_start" }, ctx as unknown as ExtensionContext);

    const terminalHandler = ui.onTerminalInput.mock.calls[0]?.[0] as ((data: string) => unknown) | undefined;
    expect(typeof terminalHandler).toBe("function");

    const result = terminalHandler?.("\r") as { consume?: boolean } | undefined;
    expect(result).toEqual({ consume: true });

    await Promise.resolve();

    expect(ui.setEditorText).toHaveBeenCalledWith("");
    expect(handleRalphCommand).toHaveBeenCalledWith("start ticket-1 tighten verifier gating", ctx);
    expect(mockPi.sendMessage).toHaveBeenCalledWith(
      {
        customType: "ralph-command-result",
        content: "Rendered Ralph command output",
        display: true,
        details: expect.objectContaining({ kind: "ralph_command", level: "result" }),
      },
      { triggerTurn: false },
    );
  });

  it("routes /ralph through the command handler and appends the final result to conversation state", async () => {
    const mockPi = createMockPi();
    const { default: piRalph } = await import("../extensions/index.js");
    piRalph(mockPi as unknown as ExtensionAPI);

    vi.mocked(handleRalphCommand).mockResolvedValueOnce({
      text: "Rendered Ralph command output",
      result: {
        created: true,
        steps: [],
        run: {
          summary: { id: "ralph-run", status: "active", phase: "executing", title: "Loop" },
          state: { latestDecision: null, waitingFor: "none", postIteration: null },
          runtimeArtifacts: [],
        },
      },
    } as never);

    const command = getCommand(mockPi, "ralph");
    const { ctx, ui } = createCommandContext("/workspace/ralph-index");
    await command.handler("start ticket-1 tighten verifier gating", ctx);

    expect(handleRalphCommand).toHaveBeenCalledWith("start ticket-1 tighten verifier gating", ctx);
    expect(mockPi.sendMessage).toHaveBeenCalledWith(
      {
        customType: "ralph-command-result",
        content: "Rendered Ralph command output",
        display: true,
        details: expect.objectContaining({ kind: "ralph_command", level: "result" }),
      },
      { triggerTurn: false },
    );
    expect(ui.notify).not.toHaveBeenCalledWith("Rendered Ralph command output", "info");
  });

  it("reports /ralph command failures through the human UI instead of throwing", async () => {
    const mockPi = createMockPi();
    const { default: piRalph } = await import("../extensions/index.js");
    piRalph(mockPi as unknown as ExtensionAPI);

    vi.mocked(handleRalphCommand).mockRejectedValueOnce(new Error("Usage: /ralph [xN] <prompt>"));

    const command = getCommand(mockPi, "ralph");
    const { ctx, ui } = createCommandContext("/workspace/ralph-index");
    await expect(command.handler("   ", ctx)).resolves.toBeUndefined();

    expect(mockPi.sendMessage).toHaveBeenCalledWith(
      {
        customType: "ralph-command-error",
        content: "Usage: /ralph [xN] <prompt>",
        display: true,
        details: expect.objectContaining({ kind: "ralph_command", level: "error" }),
      },
      { triggerTurn: false },
    );
    expect(ui.notify).toHaveBeenCalledWith("Usage: /ralph [xN] <prompt>", "error");
  });

  it("augments the system prompt with Ralph doctrine before agent start", async () => {
    const mockPi = createMockPi();
    const { default: piRalph } = await import("../extensions/index.js");
    piRalph(mockPi as unknown as ExtensionAPI);
    const beforeAgentStart = getHandler(mockPi, "before_agent_start");

    const result = (await beforeAgentStart(
      { systemPrompt: "Base system prompt" } as BeforeAgentStartEvent,
      { cwd: "/workspace/ralph-index" } as ExtensionContext,
    )) as { systemPrompt: string };

    expect(result.systemPrompt).toContain("Base system prompt");
    expect(result.systemPrompt).toContain("Ralph state is persisted in SQLite via pi-storage.");
    expect(result.systemPrompt).toContain(
      "Prefer durable Ralph packets and explicit policy decisions over ad hoc long-running transcripts.",
    );
  });
});
