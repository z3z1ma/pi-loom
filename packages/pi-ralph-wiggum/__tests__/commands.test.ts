import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPlanStore } from "@pi-loom/pi-plans/extensions/domain/store.js";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { handleRalphCommand } from "../extensions/commands/ralph.js";
import { executeRalphLoop } from "../extensions/domain/loop.js";
import { renderRalphDetail } from "../extensions/domain/render.js";
import { createRalphStore } from "../extensions/domain/store.js";
import { resolveTargetRalphRun, stopRalphLoop } from "../extensions/tools/ralph.js";

const mockStore = {
  initLedgerAsync: vi.fn(async () => ({ initialized: true, root: ".loom" })),
  queueSteeringAsync: vi.fn(async (ref: string, text: string) => createRun(ref, { title: `Steered ${text}` })),
};

vi.mock("../extensions/domain/render.js", () => ({
  renderRalphDetail: vi.fn(() => "Rendered Ralph detail"),
}));

vi.mock("../extensions/domain/loop.js", () => ({
  executeRalphLoop: vi.fn(async () => ({
    created: false,
    steps: [{ iterationId: "iter-001", iteration: 1, exitCode: 0, output: "ok", stderr: "", finalStatus: "active", finalDecision: "continue" }],
    run: createRun("run-1", { status: "active", phase: "executing" }),
  })),
}));

vi.mock("@pi-loom/pi-plans/extensions/domain/store.js", () => ({
  createPlanStore: vi.fn(() => ({
    readPlan: vi.fn(async (ref: string) => {
      if (!ref.startsWith("plan-")) {
        throw new Error(`Unknown plan: ${ref}`);
      }
      return { state: { linkedTickets: [{ ticketId: "ticket-1" }, { ticketId: "ticket-9" }] } };
    }),
  })),
}));

vi.mock("@pi-loom/pi-ticketing/extensions/domain/store.js", () => ({
  createTicketStore: vi.fn(() => ({
    readTicketAsync: vi.fn(async (ref: string) => {
      if (!ref.startsWith("ticket-")) {
        throw new Error(`Unknown ticket: ${ref}`);
      }
      return { summary: { closed: false } };
    }),
  })),
}));

vi.mock("../extensions/domain/store.js", () => ({
  createRalphStore: vi.fn(() => mockStore),
}));

vi.mock("../extensions/tools/ralph.js", () => ({
  stopRalphLoop: vi.fn(),
  resolveTargetRalphRun: vi.fn(),
}));

function createRun(
  ref: string,
  overrides?: Partial<{
    planId: string | null;
    ticketId: string | null;
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
      scope: { planId: overrides?.planId ?? "plan-1", ticketId: overrides?.ticketId ?? "ticket-1" },
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
    vi.mocked(createPlanStore).mockReturnValue({
      readPlan: vi.fn(async (ref: string) => {
        if (!ref.startsWith("plan-")) {
          throw new Error(`Unknown plan: ${ref}`);
        }
        return { state: { linkedTickets: [{ ticketId: "ticket-1" }, { ticketId: "ticket-9" }] } };
      }),
    } as never);
    vi.mocked(createTicketStore).mockReturnValue({
      readTicketAsync: vi.fn(async (ref: string) => {
        if (!ref.startsWith("ticket-")) {
          throw new Error(`Unknown ticket: ${ref}`);
        }
        return { summary: { closed: false } };
      }),
    } as never);
    mockStore.initLedgerAsync.mockResolvedValue({ initialized: true, root: ".loom" });
    mockStore.queueSteeringAsync.mockImplementation(async (ref: string, text: string) =>
      createRun(ref, { title: `Steered ${text}` }),
    );
    vi.mocked(renderRalphDetail).mockReturnValue("Rendered Ralph detail");
    vi.mocked(executeRalphLoop).mockResolvedValue({
      created: false,
      steps: [{ iterationId: "iter-001", iteration: 1, exitCode: 0, output: "ok", stderr: "", finalStatus: "active", finalDecision: "continue" }],
      run: createRun("run-1"),
    } as never);
    vi.mocked(stopRalphLoop).mockResolvedValue({
      run: createRun("run-1", { phase: "halted", status: "halted" }),
      cancelledJobIds: [],
    } as never);
    vi.mocked(resolveTargetRalphRun).mockResolvedValue(createRun("run-1") as never);
  });

  it("starts a managed Ralph loop for a plan and forwards progress to the status line", async () => {
    const { ctx, ui } = createContext("/workspace/ralph-command");
    vi.mocked(executeRalphLoop).mockImplementationOnce(async (_ctx, input, _signal, options) => {
      expect(input).toEqual({ planRef: "plan-1", ticketRef: "ticket-1", prompt: "tighten verifier gating", iterations: 1 });
      await options?.onUpdate?.("Queued next bounded iteration");
      return {
        created: false,
        steps: [{ iterationId: "iter-001", iteration: 1, exitCode: 0, output: "ok", stderr: "", finalStatus: "completed", finalDecision: "complete" }],
        run: createRun("run-1", { status: "completed", phase: "completed" }),
      } as never;
    });

    const result = await handleRalphCommand("start plan-1 ticket-1 tighten verifier gating", ctx);

    expect(createRalphStore).toHaveBeenCalledWith("/workspace/ralph-command");
    expect(mockStore.initLedgerAsync).toHaveBeenCalledTimes(1);
    expect(executeRalphLoop).toHaveBeenCalledTimes(1);
    expect(ui.setStatus).toHaveBeenCalledWith("ralph-live-run", "⏳ Ralph · Queued next bounded iteration");
    expect(ui.setWidget).not.toHaveBeenCalled();
    expect(result).toEqual({
      text: "Rendered Ralph detail",
      result: expect.objectContaining({ run: expect.objectContaining({ summary: expect.objectContaining({ id: "run-1" }) }) }),
      prompt: "tighten verifier gating",
    });
  });

  it("runs a ticket-only loop when the first token resolves to a ticket", async () => {
    const { ctx } = createContext("/workspace/ralph-command");
    vi.mocked(executeRalphLoop).mockResolvedValueOnce({
      created: false,
      steps: [],
      run: createRun("run-1", { status: "completed", phase: "completed" }),
    } as never);

    const result = await handleRalphCommand("start ticket-1 focus on verifier drift", ctx);

    expect(executeRalphLoop).toHaveBeenCalledWith(
      ctx,
      { ticketRef: "ticket-1", planRef: undefined, prompt: "focus on verifier drift", iterations: 1 },
      undefined,
      expect.objectContaining({ onUpdate: expect.any(Function) }),
    );
    expect(result.result?.run.summary.status).toBe("completed");
  });

  it("runs a plan-wide loop by iterating linked tickets", async () => {
    const { ctx } = createContext("/workspace/ralph-command");
    const ticketReads = new Map<string, number>();
    vi.mocked(createTicketStore).mockReturnValue({
      readTicketAsync: vi.fn(async (ref: string) => {
        const count = (ticketReads.get(ref) ?? 0) + 1;
        ticketReads.set(ref, count);
        return { summary: { closed: count >= 3 } };
      }),
    } as never);
    vi.mocked(executeRalphLoop)
      .mockResolvedValueOnce({ created: false, steps: [{ iterationId: "iter-001", iteration: 1, exitCode: 0, output: "ok", stderr: "", finalStatus: "active", finalDecision: "continue" }], run: createRun("run-1") } as never)
      .mockResolvedValueOnce({ created: false, steps: [{ iterationId: "iter-001", iteration: 1, exitCode: 0, output: "ok", stderr: "", finalStatus: "active", finalDecision: "continue" }], run: createRun("run-9", { ticketId: "ticket-9" }) } as never)
      .mockResolvedValueOnce({ created: false, steps: [], run: createRun("run-1", { status: "completed", phase: "completed" }) } as never)
      .mockResolvedValueOnce({ created: false, steps: [], run: createRun("run-9", { status: "completed", phase: "completed", ticketId: "ticket-9" }) } as never);

    await handleRalphCommand("start plan-9", ctx);

    expect(executeRalphLoop).toHaveBeenCalledWith(
      ctx,
      { planRef: "plan-9", ticketRef: "ticket-1", prompt: undefined, iterations: 1 },
      undefined,
      expect.objectContaining({ onUpdate: expect.any(Function) }),
    );
  });

  it("stops a targeted Ralph loop and clears the status line", async () => {
    const { ctx, ui } = createContext("/workspace/ralph-command");
    vi.mocked(stopRalphLoop).mockResolvedValueOnce({
      run: createRun("run-2", { status: "halted", phase: "halted" }),
      cancelledJobIds: ["job-2", "job-3"],
    } as never);

    const result = await handleRalphCommand("stop plan-2 ticket-2", ctx);

    expect(stopRalphLoop).toHaveBeenCalledWith(ctx, "ticket-2", "plan-2");
    expect(ui.setStatus).toHaveBeenCalledWith("ralph-live-run", undefined);
    expect(result).toEqual({
      text: "Requested stop for Ralph loop run-2 and cancelled jobs job-2, job-3.",
      result: null,
      prompt: null,
    });
  });

  it("queues steering against the bound ticket run", async () => {
    const { ctx } = createContext("/workspace/ralph-command");
    vi.mocked(resolveTargetRalphRun).mockResolvedValueOnce(createRun("run-3") as never);

    const result = await handleRalphCommand("steer plan-3 ticket-3 tighten verifier gating", ctx);

    expect(resolveTargetRalphRun).toHaveBeenCalledWith(ctx, "ticket-3", "plan-3");
    expect(mockStore.queueSteeringAsync).toHaveBeenCalledWith("run-3", "tighten verifier gating");
    expect(result).toEqual({
      text: "Queued steering for Ralph loop run-3.",
      result: null,
      prompt: "tighten verifier gating",
    });
  });

  it("renders status for the targeted ticket run", async () => {
    const { ctx } = createContext("/workspace/ralph-command");
    vi.mocked(resolveTargetRalphRun).mockResolvedValueOnce(createRun("run-5") as never);

    const result = await handleRalphCommand("status plan-5 ticket-5", ctx);

    expect(resolveTargetRalphRun).toHaveBeenCalledWith(ctx, "ticket-5", "plan-5");
    expect(renderRalphDetail).toHaveBeenCalledWith(
      expect.objectContaining({ summary: expect.objectContaining({ id: "run-5" }) }),
    );
    expect(result).toEqual({ text: "Rendered Ralph detail", result: null, prompt: null });
  });

  it("rejects legacy planless and empty commands with the new usage", async () => {
    const { ctx } = createContext("/workspace/ralph-command");

    await expect(handleRalphCommand("resume run-1", ctx)).rejects.toThrow(
      "Usage: /ralph start <ticket-ref> [steering prompt]",
    );
    await expect(handleRalphCommand("   ", ctx)).rejects.toThrow(
      "Usage: /ralph start <ticket-ref> [steering prompt]",
    );
    expect(executeRalphLoop).not.toHaveBeenCalled();
    expect(stopRalphLoop).not.toHaveBeenCalled();
  });
});
