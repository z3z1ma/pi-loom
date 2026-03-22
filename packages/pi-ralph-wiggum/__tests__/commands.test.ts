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
  reserveDurableLaunch: vi.fn(async (_ctx, _input, run) => run),
}));

vi.mock("../extensions/domain/store.js", () => ({
  createRalphStore: vi.fn(() => ({
    initLedgerAsync: vi.fn(async () => ({ initialized: true, root: ".loom" })),
    readRun: vi.fn((ref: string) => ({
      summary: { id: ref, status: "active", phase: "executing", title: "Loop" },
      state: { latestDecision: null, waitingFor: "none", postIteration: null, lastIterationNumber: 0 },
      runtimeArtifacts: [],
    })),
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
        getBranch: () => [
          {
            type: "message",
            message: { role: "user", content: [{ type: "text", text: "We need a robust retry loop." }] },
          },
        ],
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
    vi.mocked(reserveDurableLaunch).mockImplementation(async (_ctx, _input, run) => run as never);
  });

  it("runs the foreground Ralph happy path and forwards progress to the human UI", async () => {
    const { ctx, ui } = createContext("/workspace/ralph-command");
    vi.mocked(executeRalphLoop).mockImplementationOnce(async (_ctx, input, _signal, options) => {
      options?.onUpdate?.("Ralph iteration progress update");
      expect(input).toMatchObject({ prompt: "investigate bounded loops", iterations: 2 });
      return {
        created: true,
        steps: [],
        run: {
          summary: { id: "investigate-bounded-loops", status: "active", phase: "executing", title: "Loop" },
          state: { latestDecision: null, waitingFor: "none", postIteration: null },
          runtimeArtifacts: [],
        },
      } as never;
    });

    const result = await handleRalphCommand("x2 investigate bounded loops", ctx);

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
      prompt: "investigate bounded loops",
      result: expect.objectContaining({ created: true }),
    });
  });

  it("defaults to one foreground iteration when no xN prefix is supplied", async () => {
    const { ctx } = createContext("/workspace/ralph-command");
    vi.mocked(executeRalphLoop).mockResolvedValueOnce({
      created: true,
      steps: [],
      run: {
        summary: { id: "shape-the-initial-run-carefully", status: "active", phase: "executing", title: "Loop" },
        state: { latestDecision: null, waitingFor: "none", postIteration: null },
        runtimeArtifacts: [],
      },
    } as never);

    await handleRalphCommand("shape the initial run carefully", ctx);

    expect(executeRalphLoop).toHaveBeenCalledWith(
      ctx,
      { ref: "reserved-run", prompt: "shape the initial run carefully", iterations: 1 },
      undefined,
      expect.objectContaining({ onUpdate: expect.any(Function) }),
    );
  });

  it("supports explicitly resuming a durable run without forking a new one", async () => {
    const { ctx } = createContext("/workspace/ralph-command");
    vi.mocked(executeRalphLoop).mockResolvedValueOnce({
      created: false,
      steps: [],
      run: {
        summary: { id: "existing-run", status: "active", phase: "executing", title: "Existing Loop" },
        state: { latestDecision: null, waitingFor: "none", postIteration: null },
        runtimeArtifacts: [],
      },
    } as never);

    await handleRalphCommand("resume existing-run x2 tighten verification gating", ctx);

    expect(executeRalphLoop).toHaveBeenCalledWith(
      ctx,
      {
        ref: "existing-run",
        prompt: "tighten verification gating",
        iterations: 2,
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
          state: { runId: "run-one", objective: "first run", postIteration: null },
          summary: { id: "run-one", status: "planned", phase: "preparing", title: "First Loop" },
          runtimeArtifacts: [],
        },
      } as never)
      .mockResolvedValueOnce({
        created: true,
        run: {
          state: { runId: "run-two", objective: "second run", postIteration: null },
          summary: { id: "run-two", status: "planned", phase: "preparing", title: "Second Loop" },
          runtimeArtifacts: [],
        },
      } as never);

    vi.mocked(reserveDurableLaunch)
      .mockResolvedValueOnce({
        state: { runId: "run-one" },
        launch: { iterationId: "iter-1" },
      } as never)
      .mockResolvedValueOnce({
        state: { runId: "run-two" },
        launch: { iterationId: "iter-2" },
      } as never);

    vi.mocked(executeRalphLoop)
      .mockImplementationOnce(async () => firstDeferred.promise as never)
      .mockImplementationOnce(async () => secondDeferred.promise as never);

    const firstPromise = handleRalphCommand("first run", first.ctx);
    await flushMicrotasks();
    const secondPromise = handleRalphCommand("second run", second.ctx);
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

  it("rejects bare resume input instead of starting a new run", async () => {
    const { ctx } = createContext("/workspace/ralph-command");

    await expect(handleRalphCommand("resume", ctx)).rejects.toThrow("Usage: /ralph [xN] <prompt>");

    expect(executeRalphLoop).not.toHaveBeenCalled();
  });

  it("rejects bare xN input instead of treating it as a prompt", async () => {
    const { ctx } = createContext("/workspace/ralph-command");

    await expect(handleRalphCommand("x2", ctx)).rejects.toThrow("Usage: /ralph [xN] <prompt>");

    expect(executeRalphLoop).not.toHaveBeenCalled();
  });

  it("rejects empty command input with a usage error before launching Ralph", async () => {
    const { ctx } = createContext("/workspace/ralph-command");

    await expect(handleRalphCommand("   ", ctx)).rejects.toThrow("Usage: /ralph [xN] <prompt>");

    expect(executeRalphLoop).not.toHaveBeenCalled();
    expect(renderLoopResult).not.toHaveBeenCalled();
  });
});
