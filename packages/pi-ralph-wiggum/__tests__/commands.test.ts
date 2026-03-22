import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleRalphCommand } from "../extensions/commands/ralph.js";
import {
  ensureRalphRun,
  executeRalphLoop,
  isRalphLoopExecutionInFlight,
  renderLoopResult,
  reserveDurableLaunch,
} from "../extensions/domain/loop.js";
import { createRalphStore } from "../extensions/domain/store.js";

vi.mock("../extensions/domain/loop.js", () => ({
  executeRalphLoop: vi.fn(),
  renderLoopResult: vi.fn(() => "Rendered Ralph summary"),
  ensureRalphRun: vi.fn(async (_ctx, input) => ({
    created: !input.ref,
    run: {
      state: {
        runId: input.ref ?? "reserved-run",
        objective: input.prompt ?? "",
        postIteration: null,
        nextLaunch: { runtime: null, resume: false, preparedAt: null, instructions: [] },
        nextIterationId: null,
      },
      summary: {
        id: input.ref ?? "reserved-run",
        status: "planned",
        phase: "preparing",
        title: "Loop",
      },
      runtimeArtifacts: [],
    },
  })),
  isRalphLoopExecutionInFlight: vi.fn(() => false),
  reserveDurableLaunch: vi.fn(async (_ctx, _input, run) => ({
    ...run,
    launch: { iterationId: "iter-001" },
  })),
}));

vi.mock("../extensions/domain/store.js", () => ({
  createRalphStore: vi.fn(() => ({
    initLedgerAsync: vi.fn(async () => ({ initialized: true, root: ".loom" })),
    readRun: vi.fn((ref: string) => ({
      summary: { id: ref, status: "active", phase: "executing", title: "Loop" },
      state: {
        latestDecision: null,
        waitingFor: "none",
        postIteration: null,
        lastIterationNumber: 0,
        nextLaunch: { runtime: null, resume: false, preparedAt: null, instructions: [] },
        nextIterationId: null,
      },
      runtimeArtifacts: [],
      iterations: [],
    })),
    readRunAsync: vi.fn(async (ref: string) => ({
      summary: { id: ref, status: "active", phase: "executing", title: "Loop" },
      state: {
        latestDecision: null,
        waitingFor: "none",
        postIteration: null,
        lastIterationNumber: 0,
        nextLaunch: { runtime: null, resume: false, preparedAt: null, instructions: [] },
        nextIterationId: null,
      },
      runtimeArtifacts: [],
      iterations: [],
    })),
    cancelLaunchAsync: vi.fn(async () => ({})),
  })),
}));

function createContext(cwd: string): {
  ctx: ExtensionCommandContext;
  ui: { notify: ReturnType<typeof vi.fn>; setStatus: ReturnType<typeof vi.fn>; setWidget: ReturnType<typeof vi.fn> };
} {
  const ui = { notify: vi.fn(), setStatus: vi.fn(), setWidget: vi.fn() };
  return {
    ctx: {
      cwd,
      hasUI: true,
      ui,
      sessionManager: {
        getBranch: () => [],
      },
    } as unknown as ExtensionCommandContext,
    ui,
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("/ralph command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ensureRalphRun).mockImplementation(
      async (_ctx, input) =>
        ({
          created: !input.ref,
          run: {
            state: {
              runId: input.ref ?? "reserved-run",
              objective: input.prompt ?? "",
              postIteration: null,
              nextLaunch: { runtime: null, resume: false, preparedAt: null, instructions: [] },
              nextIterationId: null,
            },
            summary: {
              id: input.ref ?? "reserved-run",
              status: "planned",
              phase: "preparing",
              title: "Loop",
            },
            runtimeArtifacts: [],
          },
        }) as never,
    );
    vi.mocked(isRalphLoopExecutionInFlight).mockReturnValue(false);
    vi.mocked(reserveDurableLaunch).mockImplementation(
      async (_ctx, _input, run) =>
        ({
          ...run,
          launch: { iterationId: "iter-001" },
        }) as never,
    );
  });

  it("runs an anchored execute-mode Ralph command and forwards progress to the UI status line", async () => {
    const { ctx, ui } = createContext("/workspace/ralph-command");
    vi.mocked(executeRalphLoop).mockImplementationOnce(async (_ctx, input, _signal, options) => {
      options?.onUpdate?.("Ralph iteration progress update");
      expect(input).toMatchObject({
        ref: "reserved-run",
        prompt: "tighten verifier gating",
        scope: { mode: "execute", specRef: "spec-1", planRef: "plan-1", ticketRef: "t-1001" },
      });
      return {
        created: true,
        steps: [],
        run: {
          summary: { id: "t-1001", status: "active", phase: "executing", title: "Loop" },
          state: { latestDecision: null, waitingFor: "none", postIteration: null },
          runtimeArtifacts: [],
        },
      } as never;
    });

    const result = await handleRalphCommand("run spec-1 plan-1 t-1001 tighten verifier gating", ctx);

    expect(createRalphStore).toHaveBeenCalledWith("/workspace/ralph-command");
    expect(executeRalphLoop).toHaveBeenCalledTimes(1);
    expect(ui.setStatus.mock.calls[0]?.[0]).toBe("ralph-live-run");
    expect(ui.setStatus.mock.calls[0]?.[1]).toEqual(expect.stringContaining("Ralph"));
    expect(ui.setStatus).toHaveBeenLastCalledWith("ralph-live-run", undefined);
    expect(ui.setWidget).not.toHaveBeenCalled();
    expect(ui.notify).not.toHaveBeenCalledWith("Ralph iteration progress update", "info");
    expect(renderLoopResult).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      text: "Rendered Ralph summary",
      prompt: "tighten verifier gating",
      result: expect.objectContaining({ created: true }),
    });
  });

  it("supports planning-mode Ralph commands anchored to a spec", async () => {
    const { ctx } = createContext("/workspace/ralph-command");
    vi.mocked(executeRalphLoop).mockResolvedValueOnce({
      created: true,
      steps: [],
      run: {
        summary: { id: "spec-1", status: "active", phase: "executing", title: "Loop" },
        state: { latestDecision: null, waitingFor: "none", postIteration: null },
        runtimeArtifacts: [],
      },
    } as never);

    await handleRalphCommand("plan spec-1 refresh workplan sequencing", ctx);

    expect(executeRalphLoop).toHaveBeenCalledWith(
      ctx,
      {
        ref: "reserved-run",
        prompt: "refresh workplan sequencing",
        scope: { mode: "plan", specRef: "spec-1" },
      },
      undefined,
      expect.objectContaining({ onUpdate: expect.any(Function) }),
    );
  });

  it("supports explicitly resuming a durable run without forking a new one", async () => {
    const { ctx } = createContext("/workspace/ralph-command");
    vi.mocked(ensureRalphRun).mockResolvedValueOnce({
      created: false,
      run: {
        state: {
          runId: "existing-run",
          objective: "resume",
          postIteration: null,
          nextLaunch: { runtime: null, resume: false, preparedAt: null, instructions: [] },
          nextIterationId: null,
        },
        summary: { id: "existing-run", status: "active", phase: "deciding", title: "Existing Loop" },
        runtimeArtifacts: [],
      },
    } as never);
    vi.mocked(executeRalphLoop).mockResolvedValueOnce({
      created: false,
      steps: [],
      run: {
        summary: { id: "existing-run", status: "active", phase: "executing", title: "Existing Loop" },
        state: { latestDecision: null, waitingFor: "none", postIteration: null },
        runtimeArtifacts: [],
      },
    } as never);

    await handleRalphCommand("resume existing-run tighten verification gating", ctx);

    expect(executeRalphLoop).toHaveBeenCalledWith(
      ctx,
      {
        ref: "existing-run",
        prompt: "tighten verification gating",
      },
      undefined,
      expect.objectContaining({ onUpdate: expect.any(Function) }),
    );
  });

  it("shows aggregate status when multiple Ralph commands overlap and restores the prior line afterward", async () => {
    const first = createContext("/workspace/ralph-command");
    const second = createContext("/workspace/ralph-command");
    const firstDeferred = deferred<never>();
    const secondDeferred = deferred<never>();

    vi.mocked(ensureRalphRun)
      .mockResolvedValueOnce({
        created: true,
        run: {
          state: {
            runId: "run-one",
            objective: "first run",
            postIteration: null,
            nextLaunch: { runtime: null, resume: false, preparedAt: null, instructions: [] },
            nextIterationId: null,
          },
          summary: { id: "run-one", status: "planned", phase: "preparing", title: "First Loop" },
          runtimeArtifacts: [],
        },
      } as never)
      .mockResolvedValueOnce({
        created: true,
        run: {
          state: {
            runId: "run-two",
            objective: "second run",
            postIteration: null,
            nextLaunch: { runtime: null, resume: false, preparedAt: null, instructions: [] },
            nextIterationId: null,
          },
          summary: { id: "run-two", status: "planned", phase: "preparing", title: "Second Loop" },
          runtimeArtifacts: [],
        },
      } as never);

    vi.mocked(reserveDurableLaunch)
      .mockResolvedValueOnce({ state: { runId: "run-one" }, launch: { iterationId: "iter-1" } } as never)
      .mockResolvedValueOnce({ state: { runId: "run-two" }, launch: { iterationId: "iter-2" } } as never);

    vi.mocked(executeRalphLoop)
      .mockImplementationOnce(async () => firstDeferred.promise as never)
      .mockImplementationOnce(async () => secondDeferred.promise as never);

    const firstPromise = handleRalphCommand("run spec-1 plan-1 t-1001 first run", first.ctx);
    await flushMicrotasks();
    const secondPromise = handleRalphCommand("run spec-1 plan-1 t-1002 second run", second.ctx);
    await flushMicrotasks();

    expect(second.ui.setStatus).toHaveBeenCalledWith(
      "ralph-live-run",
      expect.stringContaining("2 active · showing newest"),
    );
    expect(first.ui.setStatus).toHaveBeenCalledWith("ralph-live-run", undefined);

    secondDeferred.resolve({
      created: true,
      steps: [],
      run: {
        summary: { id: "run-two", status: "active", phase: "executing", title: "Second Loop" },
        state: { latestDecision: null, waitingFor: "none", postIteration: null },
        runtimeArtifacts: [],
      },
    } as never);
    await secondPromise;
    await flushMicrotasks();

    const restoredStatus = first.ui.setStatus.mock.calls.at(-1)?.[1];
    expect(restoredStatus).toEqual(expect.stringContaining("⏳ Ralph · Loop"));
    expect(restoredStatus).not.toContain("2 active");

    firstDeferred.resolve({
      created: true,
      steps: [],
      run: {
        summary: { id: "run-one", status: "active", phase: "executing", title: "First Loop" },
        state: { latestDecision: null, waitingFor: "none", postIteration: null },
        runtimeArtifacts: [],
      },
    } as never);
    await firstPromise;
    await flushMicrotasks();

    expect(first.ui.setStatus).toHaveBeenLastCalledWith("ralph-live-run", undefined);
    expect(second.ui.setWidget).not.toHaveBeenCalled();
  });

  it("rejects bare resume input with the new anchored usage", async () => {
    const { ctx } = createContext("/workspace/ralph-command");

    await expect(handleRalphCommand("resume", ctx)).rejects.toThrow("Usage: /ralph plan <spec-ref>");
    expect(executeRalphLoop).not.toHaveBeenCalled();
  });

  it("rejects legacy prompt-first commands", async () => {
    const { ctx } = createContext("/workspace/ralph-command");

    await expect(handleRalphCommand("investigate bounded loops", ctx)).rejects.toThrow("Usage: /ralph plan <spec-ref>");
    expect(executeRalphLoop).not.toHaveBeenCalled();
  });

  it("rejects empty command input with anchored usage", async () => {
    const { ctx } = createContext("/workspace/ralph-command");

    await expect(handleRalphCommand("   ", ctx)).rejects.toThrow("Usage: /ralph plan <spec-ref>");
    expect(executeRalphLoop).not.toHaveBeenCalled();
  });
});
