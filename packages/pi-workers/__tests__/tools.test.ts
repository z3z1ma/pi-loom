import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { createRalphStore } from "../../pi-ralph/extensions/domain/store.js";
import { createSeededGitWorkspace } from "../../pi-storage/__tests__/helpers/git-fixture.js";
import { createTicketStore } from "../../pi-ticketing/extensions/domain/store.js";
import { describe, expect, it, vi } from "vitest";
import { createManagerStore } from "../extensions/domain/manager-store.js";
import { createWorkerStore } from "../extensions/domain/store.js";
import { registerInternalManagerTools, registerManagerTools } from "../extensions/tools/manager.js";

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

vi.mock("../extensions/domain/manager-runtime.js", async () => {
  const actual = await vi.importActual<typeof import("../extensions/domain/manager-runtime.js")>(
    "../extensions/domain/manager-runtime.js",
  );
  return {
    ...actual,
    startManagerDaemon: vi.fn(),
    waitForManagerUpdate: vi.fn(async (cwd: string, ref: string) => createManagerStore(cwd).readManager(ref)),
  };
});

vi.mock("../extensions/domain/runtime.js", async () => {
  const actual = await vi.importActual<typeof import("../extensions/domain/runtime.js")>(
    "../extensions/domain/runtime.js",
  );
  return {
    ...actual,
    runWorkerLaunch: vi.fn(actual.runWorkerLaunch),
  };
});

function createWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-workers-tools-"));
  process.env.PI_LOOM_ROOT = join(cwd, ".pi-loom-test");
  return {
    cwd,
    cleanup: () => {
      delete process.env.PI_LOOM_ROOT;
      rmSync(cwd, { recursive: true, force: true });
    },
  };
}

function createGitWorkspace(): { cwd: string; cleanup: () => void } {
  return createSeededGitWorkspace({ prefix: "pi-workers-tools-git-" });
}

function createMockPi(): { tools: Map<string, ToolDefinition>; registerTool: ReturnType<typeof vi.fn> } {
  const tools = new Map<string, ToolDefinition>();
  return {
    tools,
    registerTool: vi.fn((definition: ToolDefinition) => {
      tools.set(definition.name, definition);
    }),
  };
}

function createCtx(cwd: string): ExtensionContext {
  return { cwd } as ExtensionContext;
}

async function createWorkerTicket(cwd: string, title = "Ticket"): Promise<void> {
  const ticketStore = createTicketStore(cwd);
  await ticketStore.initLedgerAsync();
  await ticketStore.createTicketAsync({ title, summary: "summary", context: "context", plan: "plan" });
}

describe("manager tools", () => {
  it("registers only the public manager-first surface by default", () => {
    const mockPi = createMockPi();
    registerManagerTools(mockPi as unknown as ExtensionAPI);
    expect([...mockPi.tools.keys()].sort()).toEqual([
      "manager_list",
      "manager_read",
      "manager_start",
      "manager_steer",
      "manager_wait",
    ]);
  });

  it("starts a manager, spawns the background daemon, and supports list/read/wait", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      await createWorkerTicket(cwd);
      const mockPi = createMockPi();
      registerManagerTools(mockPi as unknown as ExtensionAPI);
      const managerStart = mockPi.tools.get("manager_start");
      const managerList = mockPi.tools.get("manager_list");
      const managerRead = mockPi.tools.get("manager_read");
      const managerWait = mockPi.tools.get("manager_wait");
      expect(managerStart && managerList && managerRead && managerWait).toBeTruthy();

      await managerStart?.execute(
        "call-start",
        {
          title: "Ticket Manager",
          linkedRefs: { ticketIds: ["t-0001"] },
        },
        undefined,
        undefined,
        createCtx(cwd),
      );

      const listed = await managerList?.execute("call-list", {}, undefined, undefined, createCtx(cwd));
      expect(JSON.stringify(listed)).toContain("ticket-manager");
      const read = await managerRead?.execute(
        "call-read",
        { ref: "ticket-manager" },
        undefined,
        undefined,
        createCtx(cwd),
      );
      expect(JSON.stringify(read)).toContain("Target ref");
      const waited = await managerWait?.execute(
        "call-wait",
        { ref: "ticket-manager" },
        undefined,
        undefined,
        createCtx(cwd),
      );
      expect(JSON.stringify(waited)).toContain("ticket-manager");
    } finally {
      cleanup();
    }
  });

  it("dispatches workers and starts bounded Ralph-backed iterations", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    const { runWorkerLaunch } = await import("../extensions/domain/runtime.js");
    const runWorkerLaunchMock = vi.mocked(runWorkerLaunch);
    runWorkerLaunchMock.mockReset();
    try {
      await createWorkerTicket(cwd);
      const manager = await createManagerStore(cwd).createManagerAsync({
        title: "Dispatch Manager",
        linkedRefs: { ticketIds: ["t-0001"] },
      });
      const mockPi = createMockPi();
      registerManagerTools(mockPi as unknown as ExtensionAPI);
      registerInternalManagerTools(mockPi as unknown as ExtensionAPI);
      const managerDispatch = mockPi.tools.get("manager_dispatch");
      expect(managerDispatch).toBeTruthy();

      runWorkerLaunchMock.mockImplementationOnce(async (launch) => {
        const ralphStore = createRalphStore(cwd);
        await ralphStore.appendIterationAsync(launch.ralphRunId, {
          id: launch.iterationId,
          status: "accepted",
          summary: "Manager dispatch started one worker iteration.",
          workerSummary: "Worker iteration completed.",
        });
        const decided = await ralphStore.decideRunAsync(launch.ralphRunId, {
          summary: "Another bounded iteration may be scheduled later.",
          decidedBy: "runtime",
        });
        await ralphStore.appendIterationAsync(launch.ralphRunId, {
          id: launch.iterationId,
          decision: decided.state.latestDecision ?? undefined,
        });
        return { status: "completed", output: "Dispatch finished", error: null };
      });

      await managerDispatch?.execute(
        "call-dispatch",
        { ref: manager.state.managerId },
        undefined,
        undefined,
        createCtx(cwd),
      );

      const reread = createManagerStore(cwd).readManager(manager.state.managerId);
      expect(reread.workers).toHaveLength(1);
      expect(reread.workers[0]?.id).toBe("dispatch-manager-t-0001");
      expect(createWorkerStore(cwd).readWorker("dispatch-manager-t-0001").launch?.status).toBe("running");
    } finally {
      runWorkerLaunchMock.mockReset();
      cleanup();
    }
  }, 90000);

  it("checkpoints operator-facing messages and worker outcome updates", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      await createWorkerTicket(cwd);
      const workerStore = createWorkerStore(cwd);
      await workerStore.createWorkerAsync({
        workerId: "checkpoint-manager-t-0001",
        title: "Checkpoint Worker",
        linkedRefs: { ticketIds: ["t-0001"] },
      });
      await workerStore.requestCompletionAsync("checkpoint-manager-t-0001", {
        summary: "Ready for review",
      });

      const manager = await createManagerStore(cwd).createManagerAsync({
        title: "Checkpoint Manager",
        linkedRefs: { ticketIds: ["t-0001"] },
      });
      const mockPi = createMockPi();
      registerManagerTools(mockPi as unknown as ExtensionAPI);
      registerInternalManagerTools(mockPi as unknown as ExtensionAPI);
      const managerCheckpoint = mockPi.tools.get("manager_checkpoint");
      const managerSteer = mockPi.tools.get("manager_steer");
      expect(managerCheckpoint && managerSteer).toBeTruthy();

      await managerSteer?.execute(
        "call-steer",
        { ref: manager.state.managerId, text: "Please summarize after merge" },
        undefined,
        undefined,
        createCtx(cwd),
      );

      await managerCheckpoint?.execute(
        "call-checkpoint",
        {
          ref: manager.state.managerId,
          resolveOperatorInput: true,
          status: "waiting_for_input",
          summary: "Need operator attention after merge.",
          operatorMessages: [
            { kind: "report", text: "Merged the worker branch.", workerId: "checkpoint-manager-t-0001" },
          ],
          workerUpdates: [
            {
              workerId: "checkpoint-manager-t-0001",
              status: "completed",
              summary: "Merged into target ref",
              validation: ["git log --oneline"],
            },
          ],
        },
        undefined,
        undefined,
        createCtx(cwd),
      );

      const reread = createManagerStore(cwd).readManager(manager.state.managerId);
      expect(reread.state.status).toBe("waiting_for_input");
      expect(
        reread.messages.some((message) => message.direction === "manager_to_operator" && message.kind === "report"),
      ).toBe(true);
      expect(createWorkerStore(cwd).readWorker("checkpoint-manager-t-0001").state.status).toBe("completed");
    } finally {
      cleanup();
    }
  }, 90000);
});
