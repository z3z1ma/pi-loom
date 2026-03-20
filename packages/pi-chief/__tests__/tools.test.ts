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
    startWorkerLaunchProcess: vi.fn(),
    waitForManagerUpdate: vi.fn(async (cwd: string, ref: string) => createManagerStore(cwd).readManager(ref)),
  };
});

function createWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-chief-tools-"));
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
  return createSeededGitWorkspace({ prefix: "pi-chief-tools-git-" });
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

  it("starts a manager with its own linked Ralph run and background daemon", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      await createWorkerTicket(cwd);
      const mockPi = createMockPi();
      registerManagerTools(mockPi as unknown as ExtensionAPI);
      const managerStart = mockPi.tools.get("manager_start");
      expect(managerStart).toBeTruthy();

      await managerStart?.execute(
        "call-start",
        {
          title: "Chief Manager",
          linkedRefs: { ticketIds: ["t-0001"] },
        },
        undefined,
        undefined,
        createCtx(cwd),
      );

      const manager = await createManagerStore(cwd).readManagerAsync("chief-manager");
      expect(manager.state.ralphRunId).toBe("chief-manager-loop");
      expect(createRalphStore(cwd).readRun(manager.state.ralphRunId).state.title).toBe("Chief Manager");
      const { startManagerDaemon } = await import("../extensions/domain/manager-runtime.js");
      expect(vi.mocked(startManagerDaemon)).toHaveBeenCalledWith(cwd, "chief-manager");
    } finally {
      cleanup();
    }
  });

  it("registers internal reconcile and record tools for the chief loop runtime", async () => {
    const mockPi = createMockPi();
    registerInternalManagerTools(mockPi as unknown as ExtensionAPI);
    expect([...mockPi.tools.keys()].sort()).toEqual(["manager_reconcile", "manager_record"]);
  });

  it("reconciles ticket-bound workers and starts queued Ralph-backed launches", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      await createWorkerTicket(cwd);
      const manager = await createManagerStore(cwd).createManagerAsync({
        title: "Dispatch Manager",
        linkedRefs: { ticketIds: ["t-0001"] },
      });

      const mockPi = createMockPi();
      registerInternalManagerTools(mockPi as unknown as ExtensionAPI);
      const reconcile = mockPi.tools.get("manager_reconcile");
      expect(reconcile).toBeTruthy();

      await reconcile?.execute("call-reconcile", { ref: manager.state.managerId }, undefined, undefined, createCtx(cwd));

      const reread = createManagerStore(cwd).readManager(manager.state.managerId);
      expect(reread.workers).toHaveLength(1);
      expect(reread.workers[0]?.ticketId).toBe("t-0001");
      const worker = createWorkerStore(cwd).readWorker(reread.workers[0]!.id);
      expect(worker.state.status).toBe("running");
      expect(worker.launch?.status).toBe("running");
      const { startWorkerLaunchProcess } = await import("../extensions/domain/manager-runtime.js");
      expect(vi.mocked(startWorkerLaunchProcess)).toHaveBeenCalledWith(cwd, worker.state.workerId);
    } finally {
      cleanup();
    }
  }, 90000);

  it("records operator-facing messages and worker outcomes", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      await createWorkerTicket(cwd);
      const managerStore = createManagerStore(cwd);
      const manager = await managerStore.createManagerAsync({
        title: "Record Manager",
        linkedRefs: { ticketIds: ["t-0001"] },
      });
      const workerStore = createWorkerStore(cwd);
      await workerStore.createWorkerAsync({
        workerId: "record-manager-t-0001",
        title: "Record Worker",
        ticketId: "t-0001",
        managerId: manager.state.managerId,
      });
      const mockPi = createMockPi();
      registerManagerTools(mockPi as unknown as ExtensionAPI);
      registerInternalManagerTools(mockPi as unknown as ExtensionAPI);
      const steer = mockPi.tools.get("manager_steer");
      const record = mockPi.tools.get("manager_record");
      expect(steer && record).toBeTruthy();

      await steer?.execute(
        "call-steer",
        { ref: manager.state.managerId, text: "Please summarize after merge", workerId: "record-manager-t-0001", reviewDecision: "approved" },
        undefined,
        undefined,
        createCtx(cwd),
      );

      await record?.execute(
        "call-record",
        {
          ref: manager.state.managerId,
          resolveOperatorInput: true,
          status: "waiting_for_input",
          summary: "Need operator attention after merge.",
          operatorMessages: [{ kind: "report", text: "Merged the worker branch.", workerId: "record-manager-t-0001" }],
          workerUpdates: [
            {
              workerId: "record-manager-t-0001",
              status: "completed",
              summary: "Merged into target ref",
            },
          ],
        },
        undefined,
        undefined,
        createCtx(cwd),
      );

      const reread = createManagerStore(cwd).readManager(manager.state.managerId);
      expect(reread.state.status).toBe("waiting_for_input");
      expect(reread.messages.some((message) => message.direction === "manager_to_operator" && message.kind === "report")).toBe(true);
      expect(createWorkerStore(cwd).readWorker("record-manager-t-0001").state.status).toBe("completed");
    } finally {
      cleanup();
    }
  }, 90000);
});
