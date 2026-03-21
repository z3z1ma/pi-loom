import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { createRalphStore } from "../extensions/domain/store.js";
import { runRalphLaunch } from "../extensions/domain/runtime.js";

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
  runRalphLaunch: vi.fn(),
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
  return {
    cwd,
    sessionManager: {
      getBranch: () => [
        { type: "message", message: { role: "user", content: [{ type: "text", text: "Drive a careful Ralph loop." }] } },
      ],
    },
  } as unknown as ExtensionContext;
}

describe("ralph tools", () => {
  it("registers the minimal Ralph AI tool set", async () => {
    const mockPi = createMockPi();
    const { registerRalphTools } = await import("../extensions/tools/ralph.js");
    registerRalphTools(mockPi as unknown as ExtensionAPI);

    expect([...mockPi.tools.keys()].sort()).toEqual(["ralph_checkpoint", "ralph_list", "ralph_read", "ralph_run"]);
    expect(getTool(mockPi, "ralph_run").promptSnippet).toContain("primary Ralph loop tool");
    expect(getTool(mockPi, "ralph_checkpoint").promptGuidelines).toContain(
      "This is the safe way for a fresh Ralph worker session to commit its bounded iteration outcome.",
    );
  });

  it("supports run, read, and checkpoint flows with durable state", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    const runRalphLaunchMock = vi.mocked(runRalphLaunch);
    runRalphLaunchMock.mockReset();
    try {
      const mockPi = createMockPi();
      const { registerRalphTools } = await import("../extensions/tools/ralph.js");
      registerRalphTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(cwd);

      runRalphLaunchMock.mockImplementationOnce(async (_cwd, launch) => {
        createRalphStore(cwd).appendIteration(launch.runId, {
          id: launch.iterationId,
          status: "accepted",
          summary: "Completed one bounded Ralph iteration.",
          workerSummary: "Durable checkpoint persisted from the session runtime.",
          decision: {
            kind: "continue",
            reason: "unknown",
            summary: "The next caller may choose whether to continue.",
            decidedAt: new Date().toISOString(),
            decidedBy: "runtime",
            blockingRefs: [],
          },
        });
        return { command: "pi", args: ["--mode", "json"], exitCode: 0, output: "iteration output", stderr: "" };
      });

      const runTool = getTool(mockPi, "ralph_run");
      const readTool = getTool(mockPi, "ralph_read");
      const checkpointTool = getTool(mockPi, "ralph_checkpoint");

      const runResult = await runTool.execute(
        "call-1",
        { prompt: "Investigate a bounded loop", iterations: 1 },
        undefined,
        undefined,
        ctx,
      );
      expect(runResult.details).toMatchObject({
        result: {
          created: true,
          steps: [
            {
              exitCode: 0,
              output: "iteration output",
            },
          ],
        },
      });
      expect(runResult.content[0]).toMatchObject({ type: "text", text: expect.stringContaining("Iterations executed this call: 1") });

      const list = await getTool(mockPi, "ralph_list").execute("call-2", {}, undefined, undefined, ctx);
      expect(JSON.stringify(list)).toContain("investigate-a-bounded-loop");

      const dashboard = await readTool.execute(
        "call-3",
        { ref: "investigate-a-bounded-loop", mode: "dashboard" },
        undefined,
        undefined,
        ctx,
      );
      expect(JSON.stringify(dashboard)).toContain("Post-iteration checkpoint");

      const checkpointed = await checkpointTool.execute(
        "call-4",
        {
          ref: "investigate-a-bounded-loop",
          status: "accepted",
          focus: "Record a follow-up checkpoint",
          summary: "Second checkpoint stored.",
          workerSummary: "Verifier evidence and explicit decision were persisted together.",
          verifierSummary: {
            sourceKind: "test",
            sourceRef: "vitest",
            verdict: "pass",
            summary: "Focused verification passed.",
            required: true,
          },
          decisionInput: {
            workerRequestedCompletion: true,
            summary: "Stop after the second checkpoint.",
          },
        },
        undefined,
        undefined,
        ctx,
      );
      expect(checkpointed.details).toMatchObject({
        run: {
          state: {
            latestDecision: { kind: "complete" },
          },
        },
      });
      expect(checkpointed.content[0]).toMatchObject({ type: "text", text: expect.stringContaining("Latest decision: complete") });
    } finally {
      cleanup();
    }
  });
});
