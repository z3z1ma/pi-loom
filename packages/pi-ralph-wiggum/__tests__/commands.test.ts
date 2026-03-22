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
