import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { runRalphLaunch } from "../extensions/domain/runtime.js";
import { createRalphStore } from "../extensions/domain/store.js";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getRequiredIterationIdSchema(parameters: ToolDefinition["parameters"]): Record<string, unknown> {
  if (!isRecord(parameters) || parameters.type !== "object") {
    throw new Error("Expected checkpoint tool parameters to be an object schema.");
  }

  const { properties } = parameters;
  if (!isRecord(properties)) {
    throw new Error("Expected checkpoint tool parameters schema to define properties.");
  }

  const iterationId = properties.iterationId;
  if (!isRecord(iterationId)) {
    throw new Error("Expected checkpoint tool parameters schema to define properties.iterationId.");
  }

  return iterationId;
}

function createContext(cwd: string): ExtensionContext {
  return {
    cwd,
    sessionManager: {
      getBranch: () => [
        {
          type: "message",
          message: { role: "user", content: [{ type: "text", text: "Drive a careful Ralph loop." }] },
        },
      ],
    },
  } as unknown as ExtensionContext;
}

function continueDecision(summary: string) {
  return {
    kind: "continue" as const,
    reason: "unknown" as const,
    summary,
    decidedAt: new Date().toISOString(),
    decidedBy: "policy" as const,
    blockingRefs: [],
  };
}

describe("ralph tools", () => {
  it("registers the minimal Ralph AI tool set", async () => {
    const mockPi = createMockPi();
    const { registerRalphTools } = await import("../extensions/tools/ralph.js");
    registerRalphTools(mockPi as unknown as ExtensionAPI);

    const checkpointTool = getTool(mockPi, "ralph_checkpoint");
    expect([...mockPi.tools.keys()].sort()).toEqual([
      "ralph_checkpoint",
      "ralph_job_cancel",
      "ralph_job_read",
      "ralph_job_wait",
      "ralph_list",
      "ralph_read",
      "ralph_run",
    ]);
    expect(getTool(mockPi, "ralph_run").promptSnippet).toContain("primary Ralph loop tool");
    expect(getTool(mockPi, "ralph_run").renderCall).toEqual(expect.any(Function));
    expect(getTool(mockPi, "ralph_run").renderResult).toEqual(expect.any(Function));
    expect(checkpointTool.promptGuidelines).toContain(
      "This is the safe way for a fresh Ralph worker session to commit its bounded iteration outcome for the launched iteration id.",
    );
    expect(checkpointTool.promptGuidelines).toContain(
      "Always pass the explicit `iterationId` from the launch packet; repeated updates for the same bounded iteration must reuse that same id.",
    );
    expect(checkpointTool.parameters).toMatchObject({
      properties: {
        iterationId: expect.objectContaining({
          type: "string",
          description: expect.stringContaining("Explicit launched iteration id"),
        }),
        status: expect.objectContaining({ type: "string" }),
        decisionInput: expect.any(Object),
      },
    });
    expect(getRequiredIterationIdSchema(checkpointTool.parameters).optional).toBeUndefined();
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
        return {
          command: "pi",
          args: ["--mode", "json"],
          exitCode: 0,
          output: "iteration output",
          stderr: "",
          usage: { measured: true, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
        };
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
              iterationId: "iter-001",
              exitCode: 0,
              output: "iteration output",
            },
          ],
        },
      });
      expect(runResult.content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("Iterations executed this call: 1"),
      });

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
          iterationId: "iter-001",
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
          iterations: [
            expect.objectContaining({
              id: "iter-001",
              summary: "Second checkpoint stored.",
              decision: expect.objectContaining({ kind: "complete" }),
            }),
          ],
        },
      });
      expect(checkpointed.content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("Latest decision: complete"),
      });
    } finally {
      cleanup();
    }
  });

  it("rejects stale checkpoint iteration ids once a newer launch is active", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const mockPi = createMockPi();
      const { registerRalphTools } = await import("../extensions/tools/ralph.js");
      registerRalphTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(cwd);
      const store = createRalphStore(cwd);
      const created = store.createRun({
        title: "Checkpoint Guard",
        objective: "Reject stale iteration checkpoints.",
        policySnapshot: { verifierRequired: false },
      });
      const firstLaunch = store.prepareLaunch(created.state.runId, { focus: "First bounded step" });
      store.appendIteration(created.state.runId, {
        id: firstLaunch.launch.iterationId,
        status: "accepted",
        summary: "Stored the first checkpoint.",
        decision: continueDecision("Continue after the first checkpoint."),
      });
      store.resumeRun(created.state.runId, { focus: "Second bounded step" });

      const checkpointTool = getTool(mockPi, "ralph_checkpoint");
      await expect(
        checkpointTool.execute(
          "call-stale-checkpoint",
          {
            ref: created.state.runId,
            iterationId: firstLaunch.launch.iterationId,
            status: "accepted",
            summary: "Attempt to overwrite the stale iteration.",
            workerSummary: "Should be rejected.",
            decisionInput: { summary: "Reject stale checkpoint ids." },
          },
          undefined,
          undefined,
          ctx,
        ),
      ).rejects.toThrow("cannot checkpoint iteration iter-001");
    } finally {
      cleanup();
    }
  });

  it("reuses an already prepared durable launch when ralph_run resumes without a new prompt", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    const runRalphLaunchMock = vi.mocked(runRalphLaunch);
    runRalphLaunchMock.mockReset();
    try {
      const mockPi = createMockPi();
      const { registerRalphTools } = await import("../extensions/tools/ralph.js");
      registerRalphTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(cwd);
      const store = createRalphStore(cwd);
      const created = store.createRun({
        title: "Durable launch guard",
        objective: "Reject overlapping launches when a session launch is already reserved.",
        policySnapshot: { verifierRequired: false },
      });
      const prepared = store.prepareLaunch(created.state.runId, { focus: "Reserved iteration" });

      runRalphLaunchMock.mockImplementationOnce(async (_cwd, launch) => {
        createRalphStore(cwd).appendIteration(created.state.runId, {
          id: launch.iterationId,
          status: "accepted",
          summary: "Reused the prepared launch.",
          decision: continueDecision("Prepared launch remained resumable."),
        });
        return {
          command: "pi",
          args: ["session-runtime"],
          exitCode: 0,
          output: "done",
          stderr: "",
          usage: { measured: true, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
          status: "completed",
        };
      });

      const runTool = getTool(mockPi, "ralph_run");
      const resumed = await runTool.execute(
        "call-durable-guard",
        { ref: created.state.runId },
        undefined,
        undefined,
        ctx,
      );

      expect(resumed).toMatchObject({
        details: {
          result: {
            steps: [expect.objectContaining({ iterationId: prepared.launch.iterationId, exitCode: 0 })],
          },
        },
      });
    } finally {
      cleanup();
    }
  });

  it("rejects repeated checkpoints after a Ralph run has already reached a terminal state", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const mockPi = createMockPi();
      const { registerRalphTools } = await import("../extensions/tools/ralph.js");
      registerRalphTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(cwd);
      const store = createRalphStore(cwd);
      const created = store.createRun({
        title: "Terminal checkpoint guard",
        objective: "Do not reopen completed runs through repeated checkpoints.",
        policySnapshot: { verifierRequired: false },
      });
      const launch = store.prepareLaunch(created.state.runId, { focus: "Only bounded step" });
      store.appendIteration(created.state.runId, {
        id: launch.launch.iterationId,
        status: "accepted",
        summary: "Checkpoint before completion.",
        decision: continueDecision("Finish after this step."),
      });
      store.decideRun(created.state.runId, {
        workerRequestedCompletion: true,
        summary: "Complete the run.",
      });

      const checkpointTool = getTool(mockPi, "ralph_checkpoint");
      await expect(
        checkpointTool.execute(
          "call-terminal-checkpoint",
          {
            ref: created.state.runId,
            iterationId: launch.launch.iterationId,
            status: "accepted",
            summary: "Attempt to rewrite the terminal iteration.",
            workerSummary: "Should be rejected after completion.",
            decisionInput: { summary: "Reject terminal repeated checkpoints." },
          },
          undefined,
          undefined,
          ctx,
        ),
      ).rejects.toThrow("cannot checkpoint iteration iter-001");
    } finally {
      cleanup();
    }
  });

  it("prevents concurrent background jobs for the same Ralph run and scopes jobs to the workspace", async () => {
    const firstWorkspace = createTempWorkspace();
    const secondWorkspace = createTempWorkspace();
    const runRalphLaunchMock = vi.mocked(runRalphLaunch);
    runRalphLaunchMock.mockReset();

    try {
      const mockPi = createMockPi();
      const { registerRalphTools } = await import("../extensions/tools/ralph.js");
      registerRalphTools(mockPi as unknown as ExtensionAPI);
      const runTool = getTool(mockPi, "ralph_run");
      const readJobTool = getTool(mockPi, "ralph_job_read");
      const waitJobTool = getTool(mockPi, "ralph_job_wait");
      const cancelJobTool = getTool(mockPi, "ralph_job_cancel");

      runRalphLaunchMock.mockImplementation(
        async (_cwd, _launch, signal) =>
          await new Promise((resolve) => {
            signal?.addEventListener(
              "abort",
              () => {
                resolve({
                  command: "pi",
                  args: ["session-runtime"],
                  exitCode: 1,
                  output: "",
                  stderr: "Aborted",
                  usage: { measured: false, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
                  status: "cancelled",
                });
              },
              { once: true },
            );
          }),
      );

      const firstCtx = createContext(firstWorkspace.cwd);
      const secondCtx = createContext(secondWorkspace.cwd);
      const started = await runTool.execute(
        "call-bg-1",
        { prompt: "Investigate background run integrity", background: true },
        undefined,
        undefined,
        firstCtx,
      );
      const runId = (started.details as { run: { id: string } }).run.id;
      const jobId = (started.details as { async: { jobId: string } }).async.jobId;

      await expect(
        runTool.execute("call-bg-2", { ref: runId, background: true }, undefined, undefined, firstCtx),
      ).rejects.toThrow(`Ralph run ${runId} already has running background job`);

      const foreignRead = await readJobTool.execute("call-foreign-read", { jobId }, undefined, undefined, secondCtx);
      expect(foreignRead).toMatchObject({
        details: { job: null },
        content: [
          {
            type: "text",
            text: `Unknown Ralph job ${jobId} for workspace ${secondWorkspace.cwd}.`,
          },
        ],
      });

      await expect(
        waitJobTool.execute("call-foreign-wait", { jobIds: [jobId], timeoutMs: 1 }, undefined, undefined, secondCtx),
      ).rejects.toThrow("belong to a different workspace");

      const cancelled = await cancelJobTool.execute("call-cancel", { jobId }, undefined, undefined, firstCtx);
      expect(JSON.stringify(cancelled)).toContain(`Cancelled Ralph job ${jobId}.`);
    } finally {
      firstWorkspace.cleanup();
      secondWorkspace.cleanup();
    }
  });

  it("returns retained terminal jobs by default, but prioritizes running jobs when they exist", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    const runRalphLaunchMock = vi.mocked(runRalphLaunch);
    runRalphLaunchMock.mockReset();

    try {
      const mockPi = createMockPi();
      const { registerRalphTools } = await import("../extensions/tools/ralph.js");
      registerRalphTools(mockPi as unknown as ExtensionAPI);
      const runTool = getTool(mockPi, "ralph_run");
      const waitJobTool = getTool(mockPi, "ralph_job_wait");
      const cancelJobTool = getTool(mockPi, "ralph_job_cancel");
      const ctx = createContext(cwd);

      let invocation = 0;
      runRalphLaunchMock.mockImplementation(async (_cwd, launch, signal) => {
        invocation += 1;
        if (invocation === 1) {
          createRalphStore(cwd).appendIteration(launch.runId, {
            id: launch.iterationId,
            status: "accepted",
            summary: "Completed background iteration.",
            decision: continueDecision("Completed once for the retained finished job."),
          });
          return {
            command: "pi",
            args: ["session-runtime"],
            exitCode: 0,
            output: "done",
            stderr: "",
            usage: { measured: true, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
            status: "completed",
          };
        }

        return await new Promise((resolve) => {
          signal?.addEventListener(
            "abort",
            () => {
              resolve({
                command: "pi",
                args: ["session-runtime"],
                exitCode: 1,
                output: "",
                stderr: "Aborted",
                usage: { measured: false, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
                status: "cancelled",
              });
            },
            { once: true },
          );
        });
      });

      const completedStart = await runTool.execute(
        "call-bg-finished",
        { prompt: "Finish immediately", background: true },
        undefined,
        undefined,
        ctx,
      );
      const completedJobId = (completedStart.details as { async: { jobId: string } }).async.jobId;

      await waitJobTool.execute(
        "call-wait-complete",
        { jobIds: [completedJobId], timeoutMs: 50 },
        undefined,
        undefined,
        ctx,
      );

      const retained = await waitJobTool.execute("call-wait-retained", { timeoutMs: 1 }, undefined, undefined, ctx);
      expect(retained).toMatchObject({
        details: {
          jobs: [expect.objectContaining({ id: completedJobId, status: "completed" })],
        },
        content: [
          {
            type: "text",
            text: expect.stringContaining(completedJobId),
          },
        ],
      });

      const runningStart = await runTool.execute(
        "call-bg-running",
        { prompt: "Keep running", background: true },
        undefined,
        undefined,
        ctx,
      );
      const runningJobId = (runningStart.details as { async: { jobId: string } }).async.jobId;

      const waited = await waitJobTool.execute("call-wait-running", { timeoutMs: 1 }, undefined, undefined, ctx);
      expect(waited).toMatchObject({
        details: {
          jobs: [expect.objectContaining({ id: runningJobId, status: "running" })],
        },
      });

      await cancelJobTool.execute("call-cancel-running", { jobId: runningJobId }, undefined, undefined, ctx);
    } finally {
      cleanup();
    }
  });
});
