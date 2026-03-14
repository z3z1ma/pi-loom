import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { describe, expect, it, vi } from "vitest";
import { runWorkerLaunch } from "../extensions/domain/runtime.js";
import { createWorkerStore } from "../extensions/domain/store.js";
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
  execFileSync("git", ["init"], { cwd, encoding: "utf-8" });
  execFileSync("git", ["config", "user.name", "Pi Loom Tests"], { cwd, encoding: "utf-8" });
  execFileSync("git", ["config", "user.email", "tests@example.com"], { cwd, encoding: "utf-8" });
  writeFileSync(join(cwd, "README.md"), "seed\n", "utf-8");
  execFileSync("git", ["add", "README.md"], { cwd, encoding: "utf-8" });
  execFileSync("git", ["commit", "-m", "seed"], { cwd, encoding: "utf-8" });
  return { cwd, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
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

function createWorkerTicket(cwd: string): void {
  const ticketStore = createTicketStore(cwd);
  ticketStore.initLedger();
  ticketStore.createTicket({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });
}

describe("worker tools", () => {
  it("registers worker tools and supports create/read/list flow", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      createWorkerTicket(cwd);

      const mockPi = createMockPi();
      registerWorkerTools(mockPi as unknown as ExtensionAPI);
      expect([...mockPi.tools.keys()].sort()).toEqual([
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
    } finally {
      cleanup();
    }
  });

  it("enforces ticket links on create requests", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      const mockPi = createMockPi();
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
    const { cwd, cleanup } = createWorkspace();
    const runWorkerLaunchMock = vi.mocked(runWorkerLaunch);
    runWorkerLaunchMock.mockReset();
    try {
      createWorkerTicket(cwd);

      const mockPi = createMockPi();
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
      expect(worker.launch?.status).toBe("prepared");
      expect(readFileSync(worker.artifacts.launch, "utf-8")).toContain('"status": "prepared"');

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
  });
});
