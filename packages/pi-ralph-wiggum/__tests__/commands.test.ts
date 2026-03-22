import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleRalphCommand } from "../extensions/commands/ralph.js";
import { findActiveRalphRun } from "../extensions/domain/loop.js";
import { renderRalphDetail } from "../extensions/domain/render.js";
import { createRalphStore } from "../extensions/domain/store.js";
import { resolveTargetRalphRun, startRalphLoopJob, stopRalphLoop } from "../extensions/tools/ralph.js";

const mockStore = {
  initLedgerAsync: vi.fn(async () => ({ initialized: true, root: ".loom" })),
  queueSteeringAsync: vi.fn(async (ref: string, text: string) => createRun(ref, { title: `Steered ${text}` })),
};

vi.mock("../extensions/domain/loop.js", () => ({
  findActiveRalphRun: vi.fn(async () => null),
}));

vi.mock("../extensions/domain/render.js", () => ({
  renderRalphDetail: vi.fn(() => "Rendered Ralph detail"),
}));

vi.mock("../extensions/domain/store.js", () => ({
  createRalphStore: vi.fn(() => mockStore),
}));

vi.mock("../extensions/tools/ralph.js", () => ({
  startRalphLoopJob: vi.fn(),
  stopRalphLoop: vi.fn(),
  resolveTargetRalphRun: vi.fn(),
}));

function createRun(
  ref: string,
  overrides?: Partial<{
    planId: string | null;
    title: string;
    status: string;
    phase: string;
  }>,
) {
  return {
    summary: {
      id: ref,
      status: overrides?.status ?? "active",
      phase: overrides?.phase ?? "executing",
      title: overrides?.title ?? `Loop ${ref}`,
    },
    state: {
      runId: ref,
      scope: { planId: overrides?.planId ?? "plan-1" },
    },
    runtimeArtifacts: [],
    iterations: [],
  };
}

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

describe("/ralph command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.initLedgerAsync.mockResolvedValue({ initialized: true, root: ".loom" });
    mockStore.queueSteeringAsync.mockImplementation(async (ref: string, text: string) =>
      createRun(ref, { title: `Steered ${text}` }),
    );
    vi.mocked(findActiveRalphRun).mockResolvedValue(null as never);
    vi.mocked(renderRalphDetail).mockReturnValue("Rendered Ralph detail");
    vi.mocked(startRalphLoopJob).mockResolvedValue({
      run: createRun("run-1"),
      created: true,
      jobId: "job-1",
      alreadyRunning: false,
    } as never);
    vi.mocked(stopRalphLoop).mockResolvedValue({
      run: createRun("run-1", { phase: "halted", status: "halted" }),
      cancelledJobId: null,
    } as never);
    vi.mocked(resolveTargetRalphRun).mockResolvedValue(createRun("run-1") as never);
  });

  it("starts a managed Ralph loop for a plan and forwards progress to the status line", async () => {
    const { ctx, ui } = createContext("/workspace/ralph-command");
    vi.mocked(startRalphLoopJob).mockImplementationOnce(async (_ctx, input, onProgress) => {
      expect(input).toEqual({ planRef: "plan-1", prompt: "tighten verifier gating" });
      await onProgress?.("Queued next bounded iteration");
      return {
        run: createRun("run-1"),
        created: true,
        jobId: "job-1",
        alreadyRunning: false,
      } as never;
    });

    const result = await handleRalphCommand("start plan-1 tighten verifier gating", ctx);

    expect(createRalphStore).toHaveBeenCalledWith("/workspace/ralph-command");
    expect(mockStore.initLedgerAsync).toHaveBeenCalledTimes(1);
    expect(startRalphLoopJob).toHaveBeenCalledTimes(1);
    expect(ui.setStatus).toHaveBeenCalledWith("ralph-live-run", "⏳ Ralph · Queued next bounded iteration");
    expect(ui.setWidget).not.toHaveBeenCalled();
    expect(result).toEqual({
      text: "Started managed Ralph loop run-1 for plan plan-1 as job job-1.",
      result: null,
      prompt: "tighten verifier gating",
    });
  });

  it("reuses the current loop for the same plan instead of starting a second one", async () => {
    const { ctx } = createContext("/workspace/ralph-command");
    vi.mocked(findActiveRalphRun).mockResolvedValue(createRun("run-1", { planId: "plan-1" }) as never);
    vi.mocked(startRalphLoopJob).mockResolvedValueOnce({
      run: createRun("run-1", { planId: "plan-1" }),
      created: false,
      jobId: "job-7",
      alreadyRunning: true,
    } as never);

    const result = await handleRalphCommand("start plan-1 focus on verifier drift", ctx);

    expect(startRalphLoopJob).toHaveBeenCalledWith(
      ctx,
      { ref: "run-1", prompt: "focus on verifier drift" },
      expect.any(Function),
    );
    expect(result.text).toBe("Managed Ralph loop run-1 is already running as job job-7.");
  });

  it("rejects starting a second active loop for a different plan in the same workspace", async () => {
    const { ctx } = createContext("/workspace/ralph-command");
    vi.mocked(findActiveRalphRun).mockResolvedValue(createRun("run-9", { planId: "plan-9" }) as never);

    await expect(handleRalphCommand("start plan-1", ctx)).rejects.toThrow(
      "Workspace /workspace/ralph-command already has active Ralph loop run-9 for plan plan-9. Stop it before starting plan plan-1.",
    );
    expect(startRalphLoopJob).not.toHaveBeenCalled();
  });

  it("stops a targeted Ralph loop and clears the status line", async () => {
    const { ctx, ui } = createContext("/workspace/ralph-command");
    vi.mocked(stopRalphLoop).mockResolvedValueOnce({
      run: createRun("run-2", { status: "halted", phase: "halted" }),
      cancelledJobId: "job-2",
    } as never);

    const result = await handleRalphCommand("stop run-2", ctx);

    expect(stopRalphLoop).toHaveBeenCalledWith(ctx, "run-2");
    expect(ui.setStatus).toHaveBeenCalledWith("ralph-live-run", undefined);
    expect(result).toEqual({
      text: "Requested stop for Ralph loop run-2 and cancelled job job-2.",
      result: null,
      prompt: null,
    });
  });

  it("queues steering against the current active loop when no ref is provided", async () => {
    const { ctx } = createContext("/workspace/ralph-command");
    vi.mocked(resolveTargetRalphRun).mockResolvedValueOnce(createRun("run-3") as never);

    const result = await handleRalphCommand("steer tighten verifier gating", ctx);

    expect(resolveTargetRalphRun).toHaveBeenCalledWith(ctx, undefined);
    expect(mockStore.queueSteeringAsync).toHaveBeenCalledWith("run-3", "tighten verifier gating");
    expect(result).toEqual({
      text: "Queued steering for Ralph loop run-3.",
      result: null,
      prompt: "tighten verifier gating",
    });
  });

  it("queues steering against an explicit run ref", async () => {
    const { ctx } = createContext("/workspace/ralph-command");
    vi.mocked(resolveTargetRalphRun).mockResolvedValueOnce(createRun("run-4") as never);

    await handleRalphCommand("steer ref run-4 re-check the stop condition", ctx);

    expect(resolveTargetRalphRun).toHaveBeenCalledWith(ctx, "run-4");
    expect(mockStore.queueSteeringAsync).toHaveBeenCalledWith("run-4", "re-check the stop condition");
  });

  it("renders status for the targeted loop", async () => {
    const { ctx } = createContext("/workspace/ralph-command");
    vi.mocked(resolveTargetRalphRun).mockResolvedValueOnce(createRun("run-5") as never);

    const result = await handleRalphCommand("status run-5", ctx);

    expect(resolveTargetRalphRun).toHaveBeenCalledWith(ctx, "run-5");
    expect(renderRalphDetail).toHaveBeenCalledWith(
      expect.objectContaining({ summary: expect.objectContaining({ id: "run-5" }) }),
    );
    expect(result).toEqual({ text: "Rendered Ralph detail", result: null, prompt: null });
  });

  it("rejects legacy planless and empty commands with the new usage", async () => {
    const { ctx } = createContext("/workspace/ralph-command");

    await expect(handleRalphCommand("resume run-1", ctx)).rejects.toThrow(
      "Usage: /ralph start <plan-ref> [steering prompt]",
    );
    await expect(handleRalphCommand("   ", ctx)).rejects.toThrow("Usage: /ralph start <plan-ref> [steering prompt]");
    expect(startRalphLoopJob).not.toHaveBeenCalled();
    expect(stopRalphLoop).not.toHaveBeenCalled();
  });
});
