import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Model } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { describe, expect, it, vi } from "vitest";
import { createSeededGitWorkspace } from "../../pi-storage/__tests__/helpers/git-fixture.js";
import { runWorkerLaunch } from "../extensions/domain/runtime.js";
import { createWorkerStore } from "../extensions/domain/store.js";
import { registerManagerTools } from "../extensions/tools/manager.js";
import { registerWorkerTools } from "../extensions/tools/worker.js";

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

function createCtxWithRuntimeConfig(cwd: string): ExtensionContext {
  return {
    cwd,
    model: { provider: "openai", id: "gpt-5.4" } as Model<any>,
    modelRegistry: { modelsJsonPath: "/tmp/omp-agent/models.json" } as unknown,
    sessionManager: {
      getEntries: () => [{ type: "thinking_level_change", thinkingLevel: "high" }],
      getLeafId: () => "leaf-1",
      getSessionFile: () => undefined,
      getSessionDir: () => "/tmp/omp-agent/sessions/current-workspace",
    },
  } as unknown as ExtensionContext;
}

async function createWorkerTicket(cwd: string): Promise<void> {
  const ticketStore = createTicketStore(cwd);
  await ticketStore.initLedgerAsync();
  await ticketStore.createTicketAsync({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });
}

describe("worker tools", () => {
  it("registers worker tools and supports create/read/list flow", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      await createWorkerTicket(cwd);

      const mockPi = createMockPi();
      registerManagerTools(mockPi as unknown as ExtensionAPI);
      registerWorkerTools(mockPi as unknown as ExtensionAPI);
      expect([...mockPi.tools.keys()].sort()).toEqual([
        "manager_overview",
        "manager_schedule",
        "manager_supervise",
        "manager_write",
        "worker_dashboard",
        "worker_launch",
        "worker_list",
        "worker_read",
        "worker_resume",
        "worker_supervise",
        "worker_write",
      ]);

      const workerWrite = mockPi.tools.get("worker_write");
      const workerRead = mockPi.tools.get("worker_read");
      const workerList = mockPi.tools.get("worker_list");
      expect(workerWrite && workerRead && workerList).toBeTruthy();
      expect(workerWrite?.promptGuidelines).toContain(
        "Workers require at least one linked ticket id; do not create free-floating workers.",
      );
      expect(mockPi.tools.get("worker_launch")?.promptSnippet).toContain("default SDK-backed runtime");
      expect(mockPi.tools.get("manager_write")?.promptGuidelines).toContain(
        "Leave runtime unset for the common case so resume defaults to the SDK-backed path instead of forcing subprocess unnecessarily.",
      );

      await workerWrite?.execute(
        "call-1",
        { action: "create", title: "Tool Worker", linkedRefs: { ticketIds: ["t-0001"] } },
        undefined,
        undefined,
        createCtx(cwd),
      );
      const listed = await workerList?.execute("call-2", {}, undefined, undefined, createCtx(cwd));
      expect(JSON.stringify(listed)).toContain("tool-worker");
      const read = await workerRead?.execute(
        "call-3",
        { ref: "tool-worker", mode: "dashboard" },
        undefined,
        undefined,
        createCtx(cwd),
      );
      expect(JSON.stringify(read)).toContain("tool-worker");

      await workerWrite?.execute(
        "call-4",
        {
          action: "append_message",
          ref: "tool-worker",
          message: {
            direction: "manager_to_worker",
            kind: "assignment",
            text: "Handle the inbox item",
          },
        },
        undefined,
        undefined,
        createCtx(cwd),
      );
      const inbox = await workerRead?.execute(
        "call-5",
        { ref: "tool-worker", mode: "inbox" },
        undefined,
        undefined,
        createCtx(cwd),
      );
      expect(JSON.stringify(inbox)).toContain("Handle the inbox item");
    } finally {
      cleanup();
    }
  }, 60000);

  it("supports explicit message acknowledgement and resolution actions", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      await createWorkerTicket(cwd);

      const mockPi = createMockPi();
      registerManagerTools(mockPi as unknown as ExtensionAPI);
      registerWorkerTools(mockPi as unknown as ExtensionAPI);
      const workerWrite = mockPi.tools.get("worker_write");
      const workerRead = mockPi.tools.get("worker_read");
      expect(workerWrite && workerRead).toBeTruthy();

      await workerWrite?.execute(
        "call-create",
        { action: "create", title: "Inbox Tool Worker", linkedRefs: { ticketIds: ["t-0001"] } },
        undefined,
        undefined,
        createCtx(cwd),
      );
      await workerWrite?.execute(
        "call-message",
        {
          action: "append_message",
          ref: "inbox-tool-worker",
          message: {
            direction: "manager_to_worker",
            kind: "assignment",
            text: "Acknowledge and resolve this instruction",
          },
        },
        undefined,
        undefined,
        createCtx(cwd),
      );

      const inbox = await workerRead?.execute(
        "call-inbox",
        { ref: "inbox-tool-worker", mode: "inbox" },
        undefined,
        undefined,
        createCtx(cwd),
      );
      const inboxDetails = JSON.parse(((inbox?.content ?? [])[0] as { text?: string } | undefined)?.text ?? "{}") as {
        workerInbox?: Array<{ id: string }>;
      };
      const messageId = inboxDetails.workerInbox?.[0]?.id;
      expect(messageId).toBeTruthy();
      if (!messageId) throw new Error("Expected inbox message id");

      await workerWrite?.execute(
        "call-ack",
        {
          action: "acknowledge_message",
          ref: "inbox-tool-worker",
          message: { replyTo: messageId, text: "Starting the work" },
        },
        undefined,
        undefined,
        createCtx(cwd),
      );
      let worker = createWorkerStore(cwd).readWorker("inbox-tool-worker");
      expect(worker.dashboard.unresolvedInbox[0]?.status).toBe("acknowledged");

      await workerWrite?.execute(
        "call-resolve",
        {
          action: "resolve_message",
          ref: "inbox-tool-worker",
          message: { replyTo: messageId, text: "Completed the instruction" },
        },
        undefined,
        undefined,
        createCtx(cwd),
      );
      worker = createWorkerStore(cwd).readWorker("inbox-tool-worker");
      expect(worker.summary.unresolvedInboxCount).toBe(0);
      expect(worker.messages.at(-1)?.kind).toBe("resolution");
    } finally {
      cleanup();
    }
  }, 90000);

  it("enforces ticket links on create requests", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      const mockPi = createMockPi();
      registerManagerTools(mockPi as unknown as ExtensionAPI);
      registerWorkerTools(mockPi as unknown as ExtensionAPI);
      const workerWrite = mockPi.tools.get("worker_write");
      expect(workerWrite).toBeTruthy();

      await expect(
        workerWrite?.execute(
          "call-create",
          { action: "create", title: "Ticketless Worker" },
          undefined,
          undefined,
          createCtx(cwd),
        ),
      ).rejects.toThrow("Workers require at least one linked ticket id");
    } finally {
      cleanup();
    }
  });

  it("keeps prepare-only launches truthful and persists launch outcomes", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    const runWorkerLaunchMock = vi.mocked(runWorkerLaunch);
    runWorkerLaunchMock.mockReset();
    try {
      await createWorkerTicket(cwd);

      const mockPi = createMockPi();
      registerManagerTools(mockPi as unknown as ExtensionAPI);
      registerWorkerTools(mockPi as unknown as ExtensionAPI);
      const workerWrite = mockPi.tools.get("worker_write");
      const workerLaunch = mockPi.tools.get("worker_launch");
      const workerResume = mockPi.tools.get("worker_resume");
      expect(workerWrite && workerLaunch && workerResume).toBeTruthy();

      await workerWrite?.execute(
        "call-create",
        { action: "create", title: "Runtime Tool Worker", linkedRefs: { ticketIds: ["t-0001"] } },
        undefined,
        undefined,
        createCtx(cwd),
      );

      await workerLaunch?.execute(
        "call-prepare",
        { ref: "runtime-tool-worker", prepareOnly: true, note: "prepare only" },
        undefined,
        undefined,
        createCtx(cwd),
      );

      let worker = createWorkerStore(cwd).readWorker("runtime-tool-worker");
      expect(worker.state.status).toBe("requested");
      expect(worker.state.latestTelemetry.state).toBe("unknown");
      expect(worker.launch?.runtime).toBe("sdk");
      expect(worker.launch?.status).toBe("prepared");
      const canonicalPrepared = await createWorkerStore(cwd).readWorkerAsync("runtime-tool-worker");
      expect(canonicalPrepared.launch?.status).toBe("prepared");
      expect(canonicalPrepared.launch?.runtime).toBe("sdk");

      runWorkerLaunchMock.mockResolvedValueOnce({ status: "completed", output: "Execution finished", error: null });
      await workerLaunch?.execute("call-run", { ref: "runtime-tool-worker" }, undefined, undefined, createCtx(cwd));

      worker = createWorkerStore(cwd).readWorker("runtime-tool-worker");
      expect(worker.launch?.status).toBe("completed");
      expect(worker.launch?.note).toBe("Execution finished");
      expect(worker.state.status).toBe("ready");
      expect(worker.state.latestTelemetry.state).toBe("idle");

      runWorkerLaunchMock.mockResolvedValueOnce({ status: "cancelled", output: "", error: "Cancelled" });
      await workerResume?.execute("call-resume", { ref: "runtime-tool-worker" }, undefined, undefined, createCtx(cwd));

      worker = createWorkerStore(cwd).readWorker("runtime-tool-worker");
      expect(worker.launch?.status).toBe("failed");
      expect(worker.launch?.note).toContain("Execution cancelled: Cancelled");
      expect(worker.state.status).toBe("blocked");
      expect(worker.state.latestTelemetry.summary).toContain("Execution cancelled: Cancelled");
    } finally {
      runWorkerLaunchMock.mockReset();
      cleanup();
    }
  }, 60000);

  it("passes inherited sdk runtime config into worker launches", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    const runWorkerLaunchMock = vi.mocked(runWorkerLaunch);
    runWorkerLaunchMock.mockReset();
    try {
      await createWorkerTicket(cwd);

      const mockPi = createMockPi();
      registerWorkerTools(mockPi as unknown as ExtensionAPI);
      const workerWrite = mockPi.tools.get("worker_write");
      const workerLaunch = mockPi.tools.get("worker_launch");
      expect(workerWrite && workerLaunch).toBeTruthy();

      await workerWrite?.execute(
        "call-create",
        { action: "create", title: "Inherited Runtime Worker", linkedRefs: { ticketIds: ["t-0001"] } },
        undefined,
        undefined,
        createCtx(cwd),
      );

      runWorkerLaunchMock.mockResolvedValueOnce({ status: "completed", output: "Execution finished", error: null });
      await workerLaunch?.execute(
        "call-run",
        { ref: "inherited-runtime-worker" },
        undefined,
        undefined,
        createCtxWithRuntimeConfig(cwd),
      );

      const sdkSessionConfig = runWorkerLaunchMock.mock.calls[0]?.[3];
      expect(sdkSessionConfig).toEqual(
        expect.objectContaining({
          ledgerRoot: cwd,
          extensionRoot: cwd,
          agentDir: "/tmp/omp-agent",
          thinkingLevel: "high",
          model: expect.objectContaining({ provider: "openai", id: "gpt-5.4" }),
        }),
      );
    } finally {
      runWorkerLaunchMock.mockReset();
      cleanup();
    }
  }, 30000);

  it("supports manager overview and manager-write flows", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      await createWorkerTicket(cwd);

      const mockPi = createMockPi();
      registerManagerTools(mockPi as unknown as ExtensionAPI);
      registerWorkerTools(mockPi as unknown as ExtensionAPI);
      const managerOverview = mockPi.tools.get("manager_overview");
      const managerSchedule = mockPi.tools.get("manager_schedule");
      const managerSupervise = mockPi.tools.get("manager_supervise");
      const managerWrite = mockPi.tools.get("manager_write");
      const workerWrite = mockPi.tools.get("worker_write");
      expect(managerOverview && managerSchedule && managerSupervise && managerWrite && workerWrite).toBeTruthy();

      await workerWrite?.execute(
        "call-create",
        { action: "create", title: "Managed Tool Worker", linkedRefs: { ticketIds: ["t-0001"] } },
        undefined,
        undefined,
        createCtx(cwd),
      );
      await managerWrite?.execute(
        "call-message",
        {
          action: "message",
          ref: "managed-tool-worker",
          kind: "assignment",
          text: "Do the work from the manager surface",
        },
        undefined,
        undefined,
        createCtx(cwd),
      );

      const overview = await managerOverview?.execute("call-overview", {}, undefined, undefined, createCtx(cwd));
      expect(JSON.stringify(overview)).toContain("Unresolved worker inbox");

      await workerWrite?.execute(
        "call-worker-escalation",
        {
          action: "append_message",
          ref: "managed-tool-worker",
          message: {
            direction: "worker_to_manager",
            kind: "escalation",
            text: "Need manager decision",
          },
        },
        undefined,
        undefined,
        createCtx(cwd),
      );
      const managerInboxMessageId = createWorkerStore(cwd).readInbox("managed-tool-worker").managerInbox[0]?.id;
      expect(managerInboxMessageId).toBeTruthy();
      if (!managerInboxMessageId) throw new Error("Expected manager inbox message id");

      await managerWrite?.execute(
        "call-manager-resolve",
        {
          action: "resolve_message",
          ref: "managed-tool-worker",
          messageId: managerInboxMessageId,
          text: "Decision applied",
        },
        undefined,
        undefined,
        createCtx(cwd),
      );

      const supervise = await managerSupervise?.execute(
        "call-supervise",
        { refs: ["managed-tool-worker"] },
        undefined,
        undefined,
        createCtx(cwd),
      );
      expect(JSON.stringify(supervise)).toContain("managed-tool-worker");

      const schedule = await managerSchedule?.execute("call-schedule", {}, undefined, undefined, createCtx(cwd));
      expect(JSON.stringify(schedule)).toContain("managed-tool-worker");
    } finally {
      cleanup();
    }
  }, 90000);

  it("bridges inherited runtime/session config into launch preparation and resume", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    const runWorkerLaunchMock = vi.mocked(runWorkerLaunch);
    runWorkerLaunchMock.mockReset();
    try {
      await createWorkerTicket(cwd);

      const mockPi = createMockPi();
      registerManagerTools(mockPi as unknown as ExtensionAPI);
      registerWorkerTools(mockPi as unknown as ExtensionAPI);
      const workerWrite = mockPi.tools.get("worker_write");
      const managerWrite = mockPi.tools.get("manager_write");
      const managerSchedule = mockPi.tools.get("manager_schedule");
      expect(workerWrite && managerWrite && managerSchedule).toBeTruthy();

      await workerWrite?.execute(
        "call-create",
        { action: "create", title: "Scheduled Runtime Worker", linkedRefs: { ticketIds: ["t-0001"] } },
        undefined,
        undefined,
        createCtx(cwd),
      );
      await managerWrite?.execute(
        "call-message",
        { action: "message", ref: "scheduled-runtime-worker", kind: "assignment", text: "Do the work" },
        undefined,
        undefined,
        createCtx(cwd),
      );

      runWorkerLaunchMock.mockResolvedValueOnce({ status: "completed", output: "Execution finished", error: null });
      await managerSchedule?.execute(
        "call-schedule",
        { refs: ["scheduled-runtime-worker"], apply: true, executeResumes: true },
        undefined,
        undefined,
        createCtxWithRuntimeConfig(cwd),
      );

      const sdkSessionConfig = runWorkerLaunchMock.mock.calls[0]?.[3];
      expect(sdkSessionConfig).toEqual(
        expect.objectContaining({
          ledgerRoot: cwd,
          extensionRoot: cwd,
          agentDir: "/tmp/omp-agent",
          thinkingLevel: "high",
          model: expect.objectContaining({ provider: "openai", id: "gpt-5.4" }),
        }),
      );
    } finally {
      runWorkerLaunchMock.mockReset();
      cleanup();
    }
  }, 90000);
});
