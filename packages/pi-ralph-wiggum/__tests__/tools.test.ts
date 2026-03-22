import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockStore = {
  listRunsAsync: vi.fn(async () => [{ id: "run-1", status: "active", phase: "executing", title: "Run One" }]),
  readRunAsync: vi.fn(async (ref: string) => createReadResult(ref)),
  appendIterationAsync: vi.fn(async (ref: string, input: Record<string, unknown>) => ({
    ...createReadResult(ref),
    iterations: [{ id: input.id ?? "iter-001", summary: input.summary ?? "summary", decision: null }],
  })),
  decideRunAsync: vi.fn(async (ref: string) => ({
    ...createReadResult(ref),
    state: {
      ...createReadResult(ref).state,
      latestDecision: { kind: "complete", reason: "goal_reached" },
    },
  })),
  queueSteeringAsync: vi.fn(async (ref: string, text: string) => createReadResult(ref, { title: `Steered ${text}` })),
  requestStopAsync: vi.fn(async (ref: string, summary?: string, cancelRunning?: boolean) =>
    createReadResult(ref, {
      status: "active",
      phase: "executing",
      title: summary?.trim() ? `Stopping ${summary.trim()}` : "Stopping Run",
      stopRequested: { summary: summary ?? null, cancelRunning: cancelRunning !== false },
    }),
  ),
  acknowledgeStopRequestAsync: vi.fn(async (ref: string) =>
    createReadResult(ref, { status: "active", phase: "executing" }),
  ),
  updateRunAsync: vi.fn(async (ref: string, update: Record<string, unknown>) =>
    createReadResult(ref, {
      status: (update.status as string | undefined) ?? "halted",
      phase: (update.phase as string | undefined) ?? "halted",
      latestDecision: update.latestDecision,
      stopReason: update.stopReason as string | undefined,
      scheduler: update.scheduler as Record<string, unknown> | undefined,
    }),
  ),
  setSchedulerAsync: vi.fn(async (ref: string, scheduler: Record<string, unknown>) =>
    createReadResult(ref, { scheduler }),
  ),
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
    run: createReadResult(input.ref ?? "run-1", {
      planId: input.planRef ?? "plan-1",
      status: input.ref ? "active" : "planned",
      phase: input.ref ? "executing" : "preparing",
    }),
  })),
  executeRalphLoop: vi.fn(async (_ctx, input) => ({
    created: false,
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
    run: createReadResult(input.ref ?? "run-1", { status: "completed", phase: "completed" }),
  })),
  findActiveRalphRun: vi.fn(async () => createReadResult("run-1")),
  isRalphLoopExecutionInFlight: vi.fn(() => false),
  renderLoopResult: vi.fn(() => "Rendered Ralph summary"),
}));

function createReadResult(
  ref: string,
  overrides?: Partial<{
    planId: string | null;
    status: string;
    phase: string;
    title: string;
    scheduler: Record<string, unknown>;
    latestDecision: unknown;
    stopReason: string;
    stopRequested: { summary: string | null; cancelRunning: boolean };
  }>,
) {
  const planId = overrides?.planId ?? "plan-1";
  return {
    summary: {
      id: ref,
      status: overrides?.status ?? "active",
      phase: overrides?.phase ?? "executing",
      title: overrides?.title ?? "Run One",
      decision: null,
      waitingFor: "none",
    },
    state: {
      runId: ref,
      status: overrides?.status ?? "active",
      phase: overrides?.phase ?? "executing",
      waitingFor: "none",
      latestDecision: overrides?.latestDecision ?? null,
      postIteration: null,
      nextLaunch: { runtime: null, resume: false, preparedAt: null, instructions: [] },
      nextIterationId: null,
      linkedRefs: {
        planIds: planId ? [planId] : [],
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
        planId,
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
      stopReason: overrides?.stopReason ?? null,
      packetSummary: "summary",
      createdAt: "2026-03-21T00:00:00.000Z",
      updatedAt: "2026-03-21T00:00:00.000Z",
      objective: "objective",
      summary: "summary",
      title: overrides?.title ?? "Run One",
      scheduler: {
        status: "running",
        updatedAt: "2026-03-21T00:00:00.000Z",
        jobId: null,
        note: "Managed Ralph loop scheduled.",
        ...(overrides?.scheduler ?? {}),
      },
      stopRequested: overrides?.stopRequested ?? null,
    },
    iterations: [],
    runtimeArtifacts: [],
    packet: "packet",
    run: "run markdown",
    dashboard: {
      run: {
        id: ref,
        status: overrides?.status ?? "active",
        phase: overrides?.phase ?? "executing",
        title: overrides?.title ?? "Run One",
      },
      waitingFor: "none",
      latestDecision: overrides?.latestDecision ?? null,
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
  };
}

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

function getRalphRunProperties(parameters: ToolDefinition["parameters"]): Record<string, unknown> {
  if (!isRecord(parameters) || parameters.type !== "object") {
    throw new Error("Expected ralph_run parameters to be an object schema.");
  }
  const { properties } = parameters;
  if (!isRecord(properties)) {
    throw new Error("Expected ralph_run parameters schema to define properties.");
  }
  return properties;
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
    mockStore.listRunsAsync.mockResolvedValue([
      { id: "run-1", status: "active", phase: "executing", title: "Run One" },
    ]);
    mockStore.readRunAsync.mockImplementation(async (ref: string) => createReadResult(ref));
    mockStore.appendIterationAsync.mockImplementation(async (ref: string, input: Record<string, unknown>) => ({
      ...createReadResult(ref),
      iterations: [{ id: input.id ?? "iter-001", summary: input.summary ?? "summary", decision: null }],
    }));
    mockStore.decideRunAsync.mockImplementation(async (ref: string) => ({
      ...createReadResult(ref),
      state: { ...createReadResult(ref).state, latestDecision: { kind: "complete", reason: "goal_reached" } },
    }));
    mockStore.queueSteeringAsync.mockImplementation(async (ref: string, text: string) =>
      createReadResult(ref, { title: `Steered ${text}` }),
    );
    mockStore.requestStopAsync.mockImplementation(async (ref: string, summary?: string, cancelRunning?: boolean) =>
      createReadResult(ref, {
        title: summary?.trim() ? `Stopping ${summary.trim()}` : "Stopping Run",
        stopRequested: { summary: summary ?? null, cancelRunning: cancelRunning !== false },
      }),
    );
    mockStore.acknowledgeStopRequestAsync.mockImplementation(async (ref: string) => createReadResult(ref));
    mockStore.updateRunAsync.mockImplementation(async (ref: string, update: Record<string, unknown>) =>
      createReadResult(ref, {
        status: (update.status as string | undefined) ?? "halted",
        phase: (update.phase as string | undefined) ?? "halted",
        latestDecision: update.latestDecision,
        stopReason: update.stopReason as string | undefined,
        scheduler: update.scheduler as Record<string, unknown> | undefined,
      }),
    );
    mockStore.setSchedulerAsync.mockImplementation(async (ref: string, scheduler: Record<string, unknown>) =>
      createReadResult(ref, { scheduler }),
    );
  });

  it("registers the managed Ralph tool set with run, steer, and stop commands", async () => {
    const mockPi = createMockPi();
    const { registerRalphTools } = await import("../extensions/tools/ralph.js");
    registerRalphTools(mockPi as unknown as ExtensionAPI);

    const runTool = getTool(mockPi, "ralph_run");
    const checkpointTool = getTool(mockPi, "ralph_checkpoint");
    const runProperties = getRalphRunProperties(runTool.parameters);

    expect([...mockPi.tools.keys()].sort()).toEqual([
      "ralph_checkpoint",
      "ralph_job_cancel",
      "ralph_job_read",
      "ralph_job_wait",
      "ralph_list",
      "ralph_read",
      "ralph_run",
      "ralph_steer",
      "ralph_stop",
    ]);
    expect(runTool.promptSnippet).toContain(
      "durable implementation workplan should advance through ticket-sized iterations",
    );
    expect(runTool.promptGuidelines).toContain(
      "Provide `planRef` to launch a new loop from a durable implementation plan; the governing spec is inherited from that plan when present.",
    );
    expect(runTool.promptGuidelines).toContain(
      "Provide `ref` to continue an existing loop and `steeringPrompt` when the next iteration should absorb new operator direction.",
    );
    expect(runProperties.planRef).toBeDefined();
    expect(runProperties.ref).toBeDefined();
    expect(runProperties.scope).toBeUndefined();
    expect(getRequiredIterationIdSchema(checkpointTool.parameters).optional).toBeUndefined();
  });

  it("starts a managed Ralph loop from planRef by defaulting to background execution", async () => {
    const mockPi = createMockPi();
    const { registerRalphTools } = await import("../extensions/tools/ralph.js");
    const { ensureRalphRun } = await import("../extensions/domain/loop.js");
    registerRalphTools(mockPi as unknown as ExtensionAPI);
    const ctx = createContext("/workspace/ralph-tools");

    const runTool = getTool(mockPi, "ralph_run");
    const result = await runTool.execute(
      "call-1",
      {
        planRef: "plan-1",
        steeringPrompt: "Focus on verifier gating.",
      },
      undefined,
      undefined,
      ctx,
    );

    expect(ensureRalphRun).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ planRef: "plan-1", prompt: "Focus on verifier gating." }),
    );
    expect(mockStore.setSchedulerAsync).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ status: "running", jobId: expect.any(String) }),
    );
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Started managed Ralph loop run-1 as job"),
    });
  });

  it("continues an existing Ralph loop from ref and queues steering before foreground execution", async () => {
    const mockPi = createMockPi();
    const { registerRalphTools } = await import("../extensions/tools/ralph.js");
    const { executeRalphLoop } = await import("../extensions/domain/loop.js");
    registerRalphTools(mockPi as unknown as ExtensionAPI);
    const ctx = createContext("/workspace/ralph-tools");

    const runTool = getTool(mockPi, "ralph_run");
    const result = await runTool.execute(
      "call-2",
      {
        ref: "run-9",
        steeringPrompt: "Re-check stop conditions.",
        background: false,
      },
      undefined,
      undefined,
      ctx,
    );

    expect(mockStore.queueSteeringAsync).toHaveBeenCalledWith("run-9", "Re-check stop conditions.");
    expect(executeRalphLoop).toHaveBeenCalledWith(
      ctx,
      { ref: "run-9" },
      undefined,
      expect.objectContaining({ onUpdate: expect.any(Function) }),
    );
    expect(result.content[0]).toMatchObject({ type: "text", text: "Rendered Ralph summary" });
  });

  it("queues steering through the dedicated tool for an explicit run ref", async () => {
    const mockPi = createMockPi();
    const { registerRalphTools } = await import("../extensions/tools/ralph.js");
    registerRalphTools(mockPi as unknown as ExtensionAPI);
    const ctx = createContext("/workspace/ralph-tools");

    const result = await getTool(mockPi, "ralph_steer").execute(
      "call-steer",
      { ref: "run-3", text: "Tighten verifier gating." },
      undefined,
      undefined,
      ctx,
    );

    expect(mockStore.readRunAsync).toHaveBeenCalledWith("run-3");
    expect(mockStore.queueSteeringAsync).toHaveBeenCalledWith("run-3", "Tighten verifier gating.");
    expect(result.content[0]).toMatchObject({ type: "text", text: "Queued Ralph steering for run-3." });
  });

  it("requests a stop through the dedicated tool and persists the halted state when no job is running", async () => {
    const mockPi = createMockPi();
    const { registerRalphTools } = await import("../extensions/tools/ralph.js");
    registerRalphTools(mockPi as unknown as ExtensionAPI);
    const ctx = createContext("/workspace/ralph-tools");

    const result = await getTool(mockPi, "ralph_stop").execute(
      "call-stop",
      { ref: "run-4", summary: "Operator requested stop.", cancelRunning: false },
      undefined,
      undefined,
      ctx,
    );

    expect(mockStore.readRunAsync).toHaveBeenCalledWith("run-4");
    expect(mockStore.requestStopAsync).toHaveBeenCalledWith("run-4", "Operator requested stop.", false);
    expect(mockStore.acknowledgeStopRequestAsync).toHaveBeenCalledWith("run-4");
    expect(mockStore.updateRunAsync).toHaveBeenCalledWith(
      "run-4",
      expect.objectContaining({
        status: "halted",
        phase: "halted",
        stopReason: "operator_requested",
        scheduler: expect.objectContaining({ status: "completed", jobId: null }),
      }),
    );
    expect(result.content[0]).toMatchObject({ type: "text", text: "Requested stop for Ralph loop run-4." });
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
    expect(checkpoint.content[0]).toMatchObject({ type: "text", text: expect.stringContaining("Run One") });
  });
});
