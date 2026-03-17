import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

const runRalphLaunch = vi
  .fn(async () => ({
    command: "pi",
    args: ["--mode", "json"],
    exitCode: 0,
    output: "Fresh Ralph worker persisted iteration evidence.",
    stderr: "",
  }))
  .mockImplementationOnce(async () => ({
    command: "pi",
    args: ["--mode", "json"],
    exitCode: 0,
    output: "Fresh Ralph worker persisted iteration evidence.",
    stderr: "",
  }))
  .mockImplementationOnce(async () => ({
    command: "pi",
    args: ["--mode", "json"],
    exitCode: 17,
    output: "",
    stderr: "Fresh Ralph resume failed.",
  }));

vi.mock("@mariozechner/pi-ai", () => ({
  StringEnum: (values: readonly string[]) => ({ type: "string", enum: [...values] }),
}));

vi.mock("../extensions/domain/runtime.js", () => ({
  runRalphLaunch,
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

type MockPi = {
  tools: Map<string, ToolDefinition>;
  registerTool: ReturnType<typeof vi.fn>;
};

function createTempWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-ralph-tools-"));
  return {
    cwd,
    cleanup: () => rmSync(cwd, { recursive: true, force: true }),
  };
}

function createMockPi(): MockPi {
  const tools = new Map<string, ToolDefinition>();
  return {
    tools,
    registerTool: vi.fn((definition: ToolDefinition) => {
      tools.set(definition.name, definition);
    }),
  };
}

function getTool(mockPi: MockPi, name: string): ToolDefinition {
  const tool = mockPi.tools.get(name);
  expect(tool).toBeDefined();
  if (!tool) {
    throw new Error(`Missing tool ${name}`);
  }
  return tool;
}

function createContext(cwd: string): ExtensionContext {
  return { cwd } as ExtensionContext;
}

describe("ralph tools", () => {
  it("registers tool definitions with prompt snippets and guidelines", async () => {
    const mockPi = createMockPi();
    const { registerRalphTools } = await import("../extensions/tools/ralph.js");
    registerRalphTools(mockPi as unknown as ExtensionAPI);

    expect([...mockPi.tools.keys()].sort()).toEqual([
      "ralph_dashboard",
      "ralph_launch",
      "ralph_list",
      "ralph_read",
      "ralph_resume",
      "ralph_write",
    ]);

    for (const tool of mockPi.tools.values()) {
      expect(tool.promptSnippet).toEqual(expect.any(String));
      expect(tool.promptSnippet?.length).toBeGreaterThan(20);
      expect(tool.promptGuidelines).toEqual(expect.arrayContaining([expect.any(String)]));
    }

    expect(getTool(mockPi, "ralph_launch").promptSnippet).toContain("fresh-context launch descriptors");
  });

  it("returns machine-usable shapes for create, read, update, launch, resume, dashboard, and list flows", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const mockPi = createMockPi();
      const { registerRalphTools } = await import("../extensions/tools/ralph.js");
      registerRalphTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(cwd);

      const ralphWrite = getTool(mockPi, "ralph_write");
      const ralphRead = getTool(mockPi, "ralph_read");
      const ralphLaunch = getTool(mockPi, "ralph_launch");
      const ralphResume = getTool(mockPi, "ralph_resume");
      const ralphDashboard = getTool(mockPi, "ralph_dashboard");
      const ralphList = getTool(mockPi, "ralph_list");

      const created = await ralphWrite.execute(
        "call-1",
        {
          action: "create",
          title: "Ralph tool coverage",
          objective: "Keep orchestration state durable across launch and resume flows.",
          summary: "Exercise durable Ralph tool state transitions.",
          linkedRefs: { planIds: ["planning-layer"] },
          policySnapshot: { maxIterations: 3, verifierRequired: true },
        },
        undefined,
        undefined,
        ctx,
      );
      expect(created.details).toMatchObject({
        action: "create",
        run: {
          summary: { id: "ralph-tool-coverage", status: "planned", phase: "preparing" },
        },
      });

      const updated = await ralphWrite.execute(
        "call-2",
        {
          action: "update",
          ref: "ralph-tool-coverage",
          summary: "Refresh linked orchestration context before launching a worker.",
          linkedRefs: { critiqueIds: ["critique-001"], ticketIds: ["t-0001"] },
          policySnapshot: { critiqueRequired: true },
          waitingFor: "operator",
          status: "paused",
          phase: "reviewing",
        },
        undefined,
        undefined,
        ctx,
      );
      expect(updated.details).toMatchObject({
        action: "update",
        run: {
          state: {
            waitingFor: "operator",
            status: "paused",
            phase: "reviewing",
          },
        },
      });

      const read = await ralphRead.execute(
        "call-3",
        { ref: "ralph-tool-coverage", mode: "state" },
        undefined,
        undefined,
        ctx,
      );
      expect(read.details).toMatchObject({
        summary: { id: "ralph-tool-coverage", waitingFor: "operator" },
        state: {
          linkedRefs: {
            planIds: ["planning-layer"],
            critiqueIds: ["critique-001"],
            ticketIds: ["t-0001"],
          },
          policySnapshot: { critiqueRequired: true, verifierRequired: true },
        },
      });
      expect(read.content[0]).toMatchObject({ type: "text" });
      if (read.content[0]?.type !== "text") {
        throw new Error("Expected state text content");
      }
      expect(read.content[0].text).toContain('"waitingFor": "operator"');

      await ralphWrite.execute(
        "call-3b",
        {
          action: "update",
          ref: "ralph-tool-coverage",
          waitingFor: "none",
          status: "paused",
          phase: "deciding",
        },
        undefined,
        undefined,
        ctx,
      );

      const launched = await ralphLaunch.execute(
        "call-4",
        {
          ref: "ralph-tool-coverage",
          focus: "Add durable launch assertions",
          instructions: ["Read the Ralph packet before writing evidence."],
        },
        undefined,
        undefined,
        ctx,
      );
      expect(launched.details).toMatchObject({
        launch: {
          runId: "ralph-tool-coverage",
          runtime: "subprocess",
          resume: false,
          instructions: ["Read the Ralph packet before writing evidence."],
        },
        execution: { command: "pi", exitCode: 0 },
        run: {
          summary: { id: "ralph-tool-coverage", status: "active", phase: "executing" },
          state: { launchCount: 1, currentIterationId: "iter-001" },
        },
      });
      expect(runRalphLaunch).toHaveBeenCalledTimes(1);
      expect(launched.content).toEqual([{ type: "text", text: "Fresh Ralph worker persisted iteration evidence." }]);

      const resumed = await ralphResume.execute(
        "call-5",
        {
          ref: "ralph-tool-coverage",
          focus: "Retry after runtime failure",
        },
        undefined,
        undefined,
        ctx,
      );
      expect(resumed.details).toMatchObject({
        launch: {
          runId: "ralph-tool-coverage",
          runtime: "subprocess",
          resume: true,
        },
        execution: { command: "pi", exitCode: 17, stderr: "Fresh Ralph resume failed." },
        run: {
          summary: { id: "ralph-tool-coverage", status: "failed", phase: "halted", decision: "halt" },
          state: {
            latestDecision: {
              reason: "runtime_failure",
              decidedBy: "runtime",
              summary: "Fresh Ralph resume failed.",
            },
            stopReason: "runtime_failure",
          },
        },
      });
      expect(runRalphLaunch).toHaveBeenCalledTimes(2);
      expect(resumed.content[0]).toMatchObject({ type: "text" });
      if (resumed.content[0]?.type !== "text") {
        throw new Error("Expected resume text content");
      }
      expect(resumed.content[0].text).toContain("Resume: yes");

      const dashboard = await ralphDashboard.execute(
        "call-6",
        { ref: "ralph-tool-coverage" },
        undefined,
        undefined,
        ctx,
      );
      expect(dashboard.details).toMatchObject({
        dashboard: {
          run: { id: "ralph-tool-coverage", status: "failed", phase: "halted" },
          latestDecision: { reason: "runtime_failure", kind: "halt" },
          counts: { iterations: 1 },
        },
      });

    } finally {
      cleanup();
    }
  }, 240000);

});
