import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleRalphCommand } from "../extensions/commands/ralph.js";
import { executeRalphLoop, renderLoopResult } from "../extensions/domain/loop.js";
import { createRalphStore } from "../extensions/domain/store.js";

vi.mock("../extensions/domain/loop.js", () => ({
  executeRalphLoop: vi.fn(),
  renderLoopResult: vi.fn(() => "Rendered Ralph summary"),
}));

vi.mock("../extensions/domain/store.js", () => ({
  createRalphStore: vi.fn(() => ({
    initLedgerAsync: vi.fn(async () => ({ initialized: true, root: ".loom" })),
  })),
}));

function createContext(cwd: string): { ctx: ExtensionCommandContext; ui: { notify: ReturnType<typeof vi.fn> } } {
  const ui = { notify: vi.fn() };
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
    expect(ui.notify).toHaveBeenCalledWith("Ralph iteration progress update", "info");
    expect(renderLoopResult).toHaveBeenCalledTimes(1);
    expect(result).toBe("Rendered Ralph summary");
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
      { prompt: "shape the initial run carefully", iterations: 1 },
      undefined,
      expect.objectContaining({ onUpdate: expect.any(Function) }),
    );
  });

  it("rejects empty command input with a usage error before launching Ralph", async () => {
    const { ctx } = createContext("/workspace/ralph-command");

    await expect(handleRalphCommand("   ", ctx)).rejects.toThrow("Usage: /ralph [xN] <prompt>");

    expect(executeRalphLoop).not.toHaveBeenCalled();
    expect(renderLoopResult).not.toHaveBeenCalled();
  });
});
