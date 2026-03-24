import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecuteRalphLoopResult } from "../domain/loop.js";
import type {
  RalphContinuationDecision,
  RalphDecisionReason,
  RalphReadResult,
  RalphRunPhase,
  RalphRunStatus,
} from "../domain/models.js";

const mockStore = {
  listRunsAsync: vi.fn(async () => [{ id: "run-1", status: "active", phase: "executing", title: "Run One" }]),
  readRunAsync: vi.fn(async (ref: string) => createReadResult(ref)),
  readRunSummaryAsync: vi.fn(async (ref: string) => createReadResult(ref).summary),
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
      stopRequest: {
        requestedAt: "2026-03-21T00:00:00.000Z",
        requestedBy: "operator",
        summary: summary ?? "Stop requested.",
        cancelRunning: cancelRunning !== false,
        handledAt: null,
      },
    }),
  ),
  acknowledgeStopRequestAsync: vi.fn(async (ref: string) =>
    createReadResult(ref, { status: "active", phase: "executing" }),
  ),
  updateRunAsync: vi.fn(async (ref: string, update: Record<string, unknown>) =>
    createReadResult(ref, {
      status: (update.status as RalphRunStatus | undefined) ?? "halted",
      phase: (update.phase as RalphRunPhase | undefined) ?? "halted",
      latestDecision: update.latestDecision as RalphContinuationDecision | null | undefined,
      stopReason: update.stopReason as RalphDecisionReason | undefined,
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

vi.mock("../domain/store.js", () => ({
  createRalphStore: vi.fn(() => mockStore),
}));

vi.mock("../domain/loop.js", () => ({
  ensureRalphRun: vi.fn(async (_ctx, input) => ({
    created: !input.ref,
    run: createReadResult(input.ref ?? `${input.planRef ?? "plan"}-${input.ticketRef ?? "ticket"}`, {
      planId: input.planRef ?? "plan-1",
      ticketId: input.ticketRef ?? "t-1001",
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
  isRalphLoopExecutionInFlight: vi.fn(() => false),
  resolveRalphRunBinding: vi.fn(async (_cwd, input) => ({
    ticketId: input.ticketRef,
    planId: input.planRef ?? null,
    runId: `${input.planRef ?? "ticket-only"}-${input.ticketRef}`,
    existingRun: null,
  })),
  renderLoopResult: vi.fn(() => "Rendered Ralph summary"),
}));

vi.mock("../domain/loop-worker.js", () => ({
  runRalphLoopInWorker: vi.fn(async (input) => ({
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
    run: createReadResult(input.runId, { status: "completed", phase: "completed" }),
  })),
  toWorkerModel: vi.fn((model) => model ?? null),
}));

function createReadResult(
  ref: string,
  overrides?: Partial<{
    planId: string | null;
    ticketId: string | null;
    status: RalphRunStatus;
    phase: RalphRunPhase;
    title: string;
    scheduler: Record<string, unknown>;
    latestDecision: RalphContinuationDecision | null;
    stopReason: RalphDecisionReason;
    stopRequest: {
      requestedAt: string;
      requestedBy: "operator";
      summary: string;
      cancelRunning: boolean;
      handledAt: string | null;
    };
  }>,
): RalphReadResult {
  const planId = overrides?.planId ?? "plan-1";
  const ticketId = overrides?.ticketId ?? "t-1001";
  return {
    summary: {
      id: ref,
      status: overrides?.status ?? "active",
      phase: overrides?.phase ?? "executing",
      title: overrides?.title ?? "Run One",
      updatedAt: "2026-03-21T00:00:00.000Z",
      iterationCount: 0,
      policyMode: "balanced",
      decision: null,
      waitingFor: "none",
      objectiveSummary: "objective",
      runRef: `ralph-run:${ref}`,
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
        ticketIds: ticketId ? [ticketId] : [],
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
        ticketId,
        roadmapItemIds: [],
        initiativeIds: [],
        researchIds: [],
        critiqueIds: [],
        docIds: [],
      },
      activeTicketId: ticketId,
      packetContext: {
        capturedAt: "2026-03-21T00:00:00.000Z",
        constitutionBrief: "Brief",
        specContext: "Spec",
        planContext: "Plan",
        ticketContext: "Ticket",
        priorIterationLearnings: [],
        operatorNotes: null,
      },
      steeringQueue: [],
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
      stopRequest: overrides?.stopRequest ?? null,
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
        updatedAt: "2026-03-21T00:00:00.000Z",
        iterationCount: 0,
        policyMode: "balanced",
        decision: null,
        waitingFor: "none",
        objectiveSummary: "objective",
        runRef: `ralph-run:${ref}`,
      },
      waitingFor: "none",
      latestDecision: overrides?.latestDecision ?? null,
      counts: {
        iterations: 0,
        byStatus: {
          pending: 0,
          running: 0,
          reviewing: 0,
          accepted: 0,
          rejected: 0,
          failed: 0,
          cancelled: 0,
        },
        verifierVerdicts: { not_run: 0, pass: 0, concerns: 0, fail: 0 },
      },
      critiqueLinks: [],
      packetRef: `ralph-run:${ref}:packet`,
      runRef: `ralph-run:${ref}:run`,
      launchRef: `ralph-run:${ref}:launch`,
      latestBoundedIteration: null,
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
      ticketRef: overrides?.ticketId ?? "t-1001",
      planRef: overrides?.planId ?? null,
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

function createContext(cwd: string): ExtensionContext {
  return { cwd, sessionManager: { getBranch: () => [] } } as unknown as ExtensionContext;
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

describe("ralph tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.listRunsAsync.mockResolvedValue([
      { id: "run-1", status: "active", phase: "executing", title: "Run One" },
    ]);
    mockStore.readRunAsync.mockImplementation(async (ref: string) => createReadResult(ref));
    mockStore.readRunSummaryAsync.mockImplementation(async (ref: string) => createReadResult(ref).summary);
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
        stopRequest: {
          requestedAt: "2026-03-21T00:00:00.000Z",
          requestedBy: "operator",
          summary: summary ?? "Stop requested.",
          cancelRunning: cancelRunning !== false,
          handledAt: null,
        },
      }),
    );
    mockStore.acknowledgeStopRequestAsync.mockImplementation(async (ref: string) => createReadResult(ref));
    mockStore.updateRunAsync.mockImplementation(async (ref: string, update: Record<string, unknown>) =>
      createReadResult(ref, {
        status: (update.status as RalphRunStatus | undefined) ?? "halted",
        phase: (update.phase as RalphRunPhase | undefined) ?? "halted",
        latestDecision: update.latestDecision as RalphContinuationDecision | null | undefined,
        stopReason: update.stopReason as RalphDecisionReason | undefined,
        scheduler: update.scheduler as Record<string, unknown> | undefined,
      }),
    );
    mockStore.setSchedulerAsync.mockImplementation(async (ref: string, scheduler: Record<string, unknown>) =>
      createReadResult(ref, { scheduler }),
    );
  });

  it("registers the managed Ralph tool set with run, steer, and stop commands", async () => {
    const mockPi = createMockPi();
    const { registerRalphTools } = await import("../tools/ralph.js");
    registerRalphTools(mockPi as unknown as ExtensionAPI);

    const runTool = getTool(mockPi, "ralph_run");
    const readTool = getTool(mockPi, "ralph_read");
    const runProperties = getRalphRunProperties(runTool.parameters);
    const readProperties = getRalphRunProperties(readTool.parameters);

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
    expect(runTool.promptSnippet).toContain("worker keeps the bound ticket durably current");
    expect(runTool.promptGuidelines).toContain(
      "Provide `ticketRef`; Ralph binds the run to that exact ticket and uses `planRef` when supplied or inferable.",
    );
    expect(runTool.promptGuidelines).toContain(
      "The system owns run ids. AI callers should identify Ralph work by plan/ticket, not by a chosen run ref.",
    );
    expect(runTool.promptGuidelines).toContain(
      "The bound ticket is the execution ledger. Each bounded iteration should use ticket tools to keep status, notes, verification, and blockers truthful before exit.",
    );
    expect(runTool.promptGuidelines).toContain(
      "Treat `steeringPrompt` as additive context only. It can clarify or reprioritize the next iteration, but it must not override the governing ticket or turn into step-by-step micromanagement.",
    );
    expect(readProperties.planRef).toMatchObject({
      description: expect.stringContaining("Optional governing plan ref for the Ralph run"),
    });
    expect(readProperties.ticketRef).toMatchObject({
      description: expect.stringContaining("Ticket ref bound to the Ralph run"),
    });
    expect(runProperties.planRef).toBeDefined();
    expect(runProperties.ticketRef).toBeDefined();
    expect(runProperties.scope).toBeUndefined();
  });

  it("starts a managed Ralph loop from planRef by defaulting to background execution", async () => {
    const mockPi = createMockPi();
    const { registerRalphTools } = await import("../tools/ralph.js");
    const { ensureRalphRun } = await import("../domain/loop.js");
    registerRalphTools(mockPi as unknown as ExtensionAPI);
    const ctx = createContext("/workspace/ralph-tools");

    const runTool = getTool(mockPi, "ralph_run");
    const result = await runTool.execute(
      "call-1",
      {
        planRef: "plan-1",
        ticketRef: "ticket-1",
        steeringPrompt: "Focus on verifier gating.",
      },
      undefined,
      undefined,
      ctx,
    );

    expect(ensureRalphRun).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ planRef: "plan-1", ticketRef: "ticket-1", prompt: "Focus on verifier gating." }),
    );
    expect(mockStore.setSchedulerAsync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: "running", jobId: expect.any(String) }),
    );
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Started managed Ralph loop"),
    });
  });

  it("waits for all selected Ralph jobs when requested", async () => {
    const mockPi = createMockPi();
    const { registerRalphTools } = await import("../tools/ralph.js");
    const { runRalphLoopInWorker } = await import("../domain/loop-worker.js");
    registerRalphTools(mockPi as unknown as ExtensionAPI);
    const ctx = createContext("/workspace/ralph-tools");
    const first = createDeferred<ExecuteRalphLoopResult>();
    const second = createDeferred<ExecuteRalphLoopResult>();

    vi.mocked(runRalphLoopInWorker)
      .mockImplementationOnce(async () => first.promise)
      .mockImplementationOnce(async () => second.promise);

    const runTool = getTool(mockPi, "ralph_run");
    const waitTool = getTool(mockPi, "ralph_job_wait");
    const firstStart = await runTool.execute(
      "call-bg-1",
      { planRef: "plan-1", ticketRef: "ticket-1" },
      undefined,
      undefined,
      ctx,
    );
    const secondStart = await runTool.execute(
      "call-bg-2",
      { planRef: "plan-1", ticketRef: "ticket-2" },
      undefined,
      undefined,
      ctx,
    );

    const firstJobId = (firstStart as { details: { async: { jobId: string } } }).details.async.jobId;
    const secondJobId = (secondStart as { details: { async: { jobId: string } } }).details.async.jobId;

    expect(firstJobId).not.toBe(secondJobId);
    for (let attempt = 0; attempt < 10 && vi.mocked(runRalphLoopInWorker).mock.calls.length < 2; attempt += 1) {
      await Promise.resolve();
    }
    expect(vi.mocked(runRalphLoopInWorker)).toHaveBeenCalledTimes(2);

    const waitPromise = waitTool.execute(
      "call-wait-all",
      { jobIds: [firstJobId, secondJobId], mode: "all" },
      undefined,
      undefined,
      ctx,
    );

    first.resolve({
      created: false,
      steps: [],
      run: createReadResult("run-1", { status: "active", phase: "executing" }),
    });
    second.resolve({
      created: false,
      steps: [],
      run: createReadResult("run-1", { status: "completed", phase: "completed" }),
    });

    const waited = await waitPromise;
    const jobs = (waited as { details: { jobs: Array<{ id: string; status: string }> } }).details.jobs;
    expect(jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: firstJobId, status: "completed" }),
        expect.objectContaining({ id: secondJobId, status: "completed" }),
      ]),
    );
  });

  it("continues a bound Ralph ticket run and queues steering before foreground execution", async () => {
    const mockPi = createMockPi();
    const { registerRalphTools } = await import("../tools/ralph.js");
    const { ensureRalphRun, executeRalphLoop } = await import("../domain/loop.js");
    registerRalphTools(mockPi as unknown as ExtensionAPI);
    const ctx = createContext("/workspace/ralph-tools");

    vi.mocked(ensureRalphRun).mockResolvedValueOnce({
      created: false,
      run: createReadResult("plan-9-ticket-9", {
        planId: "plan-9",
        ticketId: "ticket-9",
        status: "active",
        phase: "executing",
      }),
    } as never);

    const runTool = getTool(mockPi, "ralph_run");
    const result = await runTool.execute(
      "call-2",
      {
        planRef: "plan-9",
        ticketRef: "ticket-9",
        steeringPrompt: "Re-check stop conditions.",
        background: false,
      },
      undefined,
      undefined,
      ctx,
    );

    expect(mockStore.queueSteeringAsync).toHaveBeenCalledWith(expect.any(String), "Re-check stop conditions.");
    expect(executeRalphLoop).toHaveBeenCalledWith(
      ctx,
      { ref: expect.any(String) },
      undefined,
      expect.objectContaining({ onUpdate: expect.any(Function) }),
    );
    expect(result.content[0]).toMatchObject({ type: "text", text: "Rendered Ralph summary" });
  });

  it("queues steering through the dedicated tool for a bound ticket run", async () => {
    const mockPi = createMockPi();
    const { registerRalphTools } = await import("../tools/ralph.js");
    registerRalphTools(mockPi as unknown as ExtensionAPI);
    const ctx = createContext("/workspace/ralph-tools");

    const result = await getTool(mockPi, "ralph_steer").execute(
      "call-steer",
      { planRef: "plan-3", ticketRef: "ticket-3", text: "Tighten verifier gating." },
      undefined,
      undefined,
      ctx,
    );

    expect(mockStore.readRunAsync).toHaveBeenCalledWith(expect.any(String));
    expect(mockStore.queueSteeringAsync).toHaveBeenCalledWith(expect.any(String), "Tighten verifier gating.");
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Queued Ralph steering for"),
    });
  });

  it("describes steering as additive ticket-scoped guidance", async () => {
    const mockPi = createMockPi();
    const { registerRalphTools } = await import("../tools/ralph.js");
    registerRalphTools(mockPi as unknown as ExtensionAPI);

    const steerTool = getTool(mockPi, "ralph_steer");
    const steerProperties = getRalphRunProperties(steerTool.parameters);

    expect(steerTool.description).toContain("minor additive steering");
    expect(steerTool.promptGuidelines).toContain(
      "Do not use steering to replace the governing ticket, rewrite Ralph's base operating discipline, or micromanage the loop step by step.",
    );
    expect(steerProperties.text).toMatchObject({
      description: expect.stringContaining("without replacing the ticket-driven execution contract"),
    });
  });

  it("requests a stop through the dedicated tool and persists the halted state when no job is running", async () => {
    const mockPi = createMockPi();
    const { registerRalphTools } = await import("../tools/ralph.js");
    registerRalphTools(mockPi as unknown as ExtensionAPI);
    const ctx = createContext("/workspace/ralph-tools");

    const result = await getTool(mockPi, "ralph_stop").execute(
      "call-stop",
      { planRef: "plan-4", ticketRef: "ticket-4", summary: "Operator requested stop.", cancelRunning: false },
      undefined,
      undefined,
      ctx,
    );

    expect(mockStore.readRunAsync).toHaveBeenCalledWith(expect.any(String));
    expect(mockStore.requestStopAsync).toHaveBeenCalledWith(expect.any(String), "Operator requested stop.", false);
    expect(mockStore.acknowledgeStopRequestAsync).toHaveBeenCalledWith(expect.any(String));
    expect(mockStore.updateRunAsync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        status: "halted",
        phase: "halted",
        stopReason: "operator_requested",
        scheduler: expect.objectContaining({ status: "completed", jobId: null }),
      }),
    );
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Requested stop for Ralph loop"),
    });
  });

  it("reads durable Ralph state through list and read tools", async () => {
    const mockPi = createMockPi();
    const { registerRalphTools } = await import("../tools/ralph.js");
    registerRalphTools(mockPi as unknown as ExtensionAPI);
    const ctx = createContext("/workspace/ralph-tools");

    const list = await getTool(mockPi, "ralph_list").execute("call-list", {}, undefined, undefined, ctx);
    expect(list.content[0]).toMatchObject({ type: "text", text: expect.stringContaining("run-1 [active/executing]") });

    const read = await getTool(mockPi, "ralph_read").execute(
      "call-read",
      { planRef: "plan-1", ticketRef: "t-1001", mode: "dashboard" },
      undefined,
      undefined,
      ctx,
    );
    expect(mockStore.readRunAsync).toHaveBeenCalledWith(expect.any(String));
    expect(JSON.stringify(read)).toContain("dashboard");
  });
});
