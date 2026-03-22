import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockStore = {
  listRunsAsync: vi.fn(async () => [{ id: "run-1", status: "active", phase: "executing", title: "Run One" }]),
  readRunAsync: vi.fn(async (ref: string) => ({
    summary: { id: ref, status: "active", phase: "executing", title: "Run One", decision: null, waitingFor: "none" },
    state: {
      runId: ref,
      status: "active",
      phase: "executing",
      waitingFor: "none",
      latestDecision: null,
      postIteration: null,
      nextLaunch: { runtime: null, resume: false, preparedAt: null, instructions: [] },
      nextIterationId: null,
      linkedRefs: {
        planIds: ["plan-1"],
        ticketIds: ["t-1001"],
        critiqueIds: [],
        specChangeIds: ["spec-1"],
        researchIds: [],
        initiativeIds: [],
        roadmapItemIds: [],
        docIds: [],
      },
      scope: {
        mode: "execute",
        specChangeId: "spec-1",
        planId: "plan-1",
        ticketId: "t-1001",
        roadmapItemIds: [],
        initiativeIds: [],
        researchIds: [],
        critiqueIds: [],
        docIds: [],
      },
      packetContext: {
        capturedAt: "2026-03-21T00:00:00.000Z",
        constitutionBrief: "Brief",
        specContext: "Spec",
        planContext: "Plan",
        ticketContext: "Ticket",
        priorIterationLearnings: [],
        operatorNotes: null,
      },
      policySnapshot: {
        mode: "balanced",
        maxIterations: null,
        maxRuntimeMinutes: null,
        tokenBudget: null,
        verifierRequired: true,
        critiqueRequired: false,
        stopWhenVerified: true,
        manualApprovalRequired: false,
        allowOperatorPause: true,
        notes: [],
      },
      verifierSummary: {
        iterationId: null,
        sourceKind: "manual",
        sourceRef: "none",
        verdict: "not_run",
        summary: "",
        required: true,
        blocker: false,
        checkedAt: null,
        evidence: [],
      },
      critiqueLinks: [],
      latestDecisionIterationId: null,
      lastIterationNumber: 0,
      stopReason: null,
      packetSummary: "summary",
      createdAt: "2026-03-21T00:00:00.000Z",
      updatedAt: "2026-03-21T00:00:00.000Z",
      objective: "objective",
      summary: "summary",
      title: "Run One",
    },
    iterations: [],
    runtimeArtifacts: [],
    packet: "packet",
    run: "run markdown",
    dashboard: {
      run: { id: ref, status: "active", phase: "executing", title: "Run One" },
      waitingFor: "none",
      latestDecision: null,
      counts: { iterations: 0, byStatus: {}, verifierVerdicts: {} },
      critiqueLinks: [],
      packetRef: `ralph-run:${ref}:packet`,
      runRef: `ralph-run:${ref}:run`,
      launchRef: `ralph-run:${ref}:launch`,
      latestIteration: null,
      latestRuntime: null,
    },
    artifacts: {
      dir: `ralph-run:${ref}`,
      state: `ralph-run:${ref}:state`,
      packet: `ralph-run:${ref}:packet`,
      run: `ralph-run:${ref}:run`,
      iterations: `ralph-run:${ref}:iterations`,
      launch: `ralph-run:${ref}:launch`,
      runtime: `ralph-run:${ref}:runtime`,
    },
    launch: {
      runId: ref,
      iterationId: "iter-001",
      iteration: 1,
      createdAt: "2026-03-21T00:00:00.000Z",
      runtime: "descriptor_only",
      packetRef: `ralph-run:${ref}:packet`,
      launchRef: `ralph-run:${ref}:launch`,
      resume: false,
      instructions: [],
    },
  })),
  appendIterationAsync: vi.fn(async (ref: string, input: Record<string, unknown>) => ({
    ...(await mockStore.readRunAsync(ref)),
    iterations: [{ id: input.id ?? "iter-001", summary: input.summary ?? "summary", decision: null }],
  })),
  decideRunAsync: vi.fn(async (ref: string) => ({
    ...(await mockStore.readRunAsync(ref)),
    state: {
      ...(await mockStore.readRunAsync(ref)).state,
      latestDecision: { kind: "complete", reason: "goal_reached" },
    },
  })),
  resumeRunAsync: vi.fn(),
  prepareLaunchAsync: vi.fn(),
};

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

vi.mock("../extensions/domain/store.js", () => ({
  createRalphStore: vi.fn(() => mockStore),
}));

vi.mock("../extensions/domain/loop.js", () => ({
  ensureRalphRun: vi.fn(async (_ctx, input) => ({
    created: !input.ref,
    run: {
      state: {
        runId: input.ref ?? "run-1",
        nextLaunch: { runtime: null, resume: false, preparedAt: null, instructions: [] },
        nextIterationId: null,
      },
      summary: { id: input.ref ?? "run-1", status: "planned", phase: "preparing", title: "Run One" },
      runtimeArtifacts: [],
    },
  })),
  executeRalphLoop: vi.fn(async (_ctx, input) => ({
    created: !input.ref,
    steps: [
      {
        iterationId: "iter-001",
        iteration: 1,
        exitCode: 0,
        output: "iteration output",
        stderr: "",
        finalStatus: "completed",
        finalDecision: "complete",
      },
    ],
    run: {
      ...(await mockStore.readRunAsync(input.ref ?? "run-1")),
      state: { ...(await mockStore.readRunAsync(input.ref ?? "run-1")).state, latestDecision: { kind: "complete" } },
      summary: {
        ...(await mockStore.readRunAsync(input.ref ?? "run-1")).summary,
        status: "completed",
        phase: "completed",
      },
    },
  })),
  hasDurableActiveLaunch: vi.fn(() => false),
  reserveDurableLaunch: vi.fn(async (_ctx, _input, run) => ({
    ...run,
    launch: { iterationId: "iter-001" },
    state: { runId: run.state.runId },
  })),
  isRalphLoopExecutionInFlight: vi.fn(() => false),
  renderLoopResult: vi.fn(() => "Rendered Ralph summary"),
}));

type MockPi = {
  tools: Map<string, ToolDefinition>;
  registerTool: ReturnType<typeof vi.fn>;
};

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
  return { cwd, sessionManager: { getBranch: () => [] } } as unknown as ExtensionContext;
}

describe("ralph tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers the anchored Ralph AI tool set", async () => {
    const mockPi = createMockPi();
    const { registerRalphTools } = await import("../extensions/tools/ralph.js");
    registerRalphTools(mockPi as unknown as ExtensionAPI);

    const runTool = getTool(mockPi, "ralph_run");
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
    expect(runTool.promptSnippet).toContain("Loom-native Ralph loop tool");
    expect(runTool.promptGuidelines).toContain(
      "For execute-mode runs, `specRef`, `planRef`, and `ticketRef` are all required so Ralph executes one explicit ticket instead of a loose prompt.",
    );
    expect(getRequiredIterationIdSchema(checkpointTool.parameters).optional).toBeUndefined();
  });

  it("maps anchored run input through the primary ralph_run tool", async () => {
    const mockPi = createMockPi();
    const { registerRalphTools } = await import("../extensions/tools/ralph.js");
    const { executeRalphLoop } = await import("../extensions/domain/loop.js");
    registerRalphTools(mockPi as unknown as ExtensionAPI);
    const ctx = createContext("/workspace/ralph-tools");

    const runTool = getTool(mockPi, "ralph_run");
    const result = await runTool.execute(
      "call-1",
      {
        scope: { mode: "execute", specRef: "spec-1", planRef: "plan-1", ticketRef: "t-1001" },
        steeringPrompt: "Focus on verifier gating.",
      },
      undefined,
      undefined,
      ctx,
    );

    expect(executeRalphLoop).toHaveBeenCalledWith(
      ctx,
      {
        ref: "run-1",
        prompt: "Focus on verifier gating.",
        scope: { mode: "execute", specRef: "spec-1", planRef: "plan-1", ticketRef: "t-1001" },
        policySnapshot: undefined,
      },
      undefined,
      expect.objectContaining({ onUpdate: expect.any(Function) }),
    );
    expect(result.content[0]).toMatchObject({ type: "text", text: "Rendered Ralph summary" });
  });

  it("reads durable Ralph state through list and read tools", async () => {
    const mockPi = createMockPi();
    const { registerRalphTools } = await import("../extensions/tools/ralph.js");
    registerRalphTools(mockPi as unknown as ExtensionAPI);
    const ctx = createContext("/workspace/ralph-tools");

    const list = await getTool(mockPi, "ralph_list").execute("call-list", {}, undefined, undefined, ctx);
    expect(list.content[0]).toMatchObject({ type: "text", text: expect.stringContaining("run-1 [active/executing]") });

    const read = await getTool(mockPi, "ralph_read").execute(
      "call-read",
      { ref: "run-1", mode: "dashboard" },
      undefined,
      undefined,
      ctx,
    );
    expect(JSON.stringify(read)).toContain("run-1");
  });

  it("records checkpoints through append-then-decide semantics", async () => {
    const mockPi = createMockPi();
    const { registerRalphTools } = await import("../extensions/tools/ralph.js");
    registerRalphTools(mockPi as unknown as ExtensionAPI);
    const ctx = createContext("/workspace/ralph-tools");

    const checkpoint = await getTool(mockPi, "ralph_checkpoint").execute(
      "call-checkpoint",
      {
        ref: "run-1",
        iterationId: "iter-001",
        status: "accepted",
        summary: "Accepted the bounded ticket.",
        workerSummary: "Verifier passed.",
        decisionInput: { workerRequestedCompletion: true, summary: "Complete the run." },
      },
      undefined,
      undefined,
      ctx,
    );

    expect(mockStore.appendIterationAsync).toHaveBeenCalled();
    expect(mockStore.decideRunAsync).toHaveBeenCalledWith("run-1", {
      workerRequestedCompletion: true,
      summary: "Complete the run.",
    });
    expect(checkpoint.content[0]).toMatchObject({ type: "text", text: expect.stringContaining("Latest decision") });
  });
});
