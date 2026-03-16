import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { describe, expect, it, vi } from "vitest";
import { runWorkerLaunch } from "../extensions/domain/runtime.js";
import { createWorkerStore } from "../extensions/domain/store.js";

vi.mock("@mariozechner/pi-coding-agent", () => ({
  createAgentSession: vi.fn(),
  SessionManager: {
    inMemory: vi.fn(() => ({ kind: "memory" })),
  },
}));

function createWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-workers-runtime-"));
  execFileSync("git", ["init"], { cwd, encoding: "utf-8" });
  execFileSync("git", ["config", "user.name", "Pi Loom Tests"], { cwd, encoding: "utf-8" });
  execFileSync("git", ["config", "user.email", "tests@example.com"], { cwd, encoding: "utf-8" });
  writeFileSync(join(cwd, "README.md"), "seed\n", "utf-8");
  execFileSync("git", ["add", "README.md"], { cwd, encoding: "utf-8" });
  execFileSync("git", ["commit", "-m", "seed"], { cwd, encoding: "utf-8" });
  return { cwd, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

describe("worker runtime", () => {
  it("provisions and retires Git worktree-backed worker attachments", () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      const ticketStore = createTicketStore(cwd);
      ticketStore.initLedger();
      ticketStore.createTicket({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });
      const store = createWorkerStore(cwd);
      store.createWorker({ title: "Runtime Worker", linkedRefs: { ticketIds: ["t-0001"] } });
      const launched = store.prepareLaunch("runtime-worker", false, "prepare launch");
      expect(launched.launch).not.toBeNull();
      expect(existsSync(launched.launch?.workspacePath ?? "")).toBe(true);
      expect(launched.launch?.status).toBe("prepared");

      const retired = store.retireWorker("runtime-worker", "retired in test");
      expect(retired.state.status).toBe("retired");
      expect(retired.launch?.status).toBe("retired");
    } finally {
      cleanup();
    }
  });

  it("recreates a prepared workspace when durable branch state changes", () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      const ticketStore = createTicketStore(cwd);
      ticketStore.initLedger();
      ticketStore.createTicket({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });
      const store = createWorkerStore(cwd);
      store.createWorker({ title: "Runtime Worker", linkedRefs: { ticketIds: ["t-0001"] } });

      const firstLaunch = store.prepareLaunch("runtime-worker", false, "initial launch");
      expect(firstLaunch.launch?.workspacePath).toBeTruthy();
      expect(
        execFileSync("git", ["-C", firstLaunch.launch?.workspacePath ?? "", "branch", "--show-current"], {
          encoding: "utf-8",
        }).trim(),
      ).toBe("runtime-worker");

      store.updateWorker("runtime-worker", {
        workspace: { branch: "runtime-worker-rebased", baseRef: "HEAD" },
      });

      const secondLaunch = store.prepareLaunch("runtime-worker", true, "resume on new branch");
      expect(secondLaunch.launch?.workspacePath).toBe(firstLaunch.launch?.workspacePath);
      expect(
        execFileSync("git", ["-C", secondLaunch.launch?.workspacePath ?? "", "branch", "--show-current"], {
          encoding: "utf-8",
        }).trim(),
      ).toBe("runtime-worker-rebased");
      expect(secondLaunch.launch?.branch).toBe("runtime-worker-rebased");
    } finally {
      cleanup();
    }
  });

  it("records runtime kind for SDK launches and can execute through the SDK runtime path", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      const ticketStore = createTicketStore(cwd);
      ticketStore.initLedger();
      ticketStore.createTicket({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });
      const store = createWorkerStore(cwd);
      store.createWorker({ title: "SDK Worker", linkedRefs: { ticketIds: ["t-0001"] } });

      const launched = store.prepareLaunch("sdk-worker", false, "sdk launch", "sdk");
      expect(launched.launch?.runtime).toBe("sdk");
      expect(launched.state.lastRuntimeKind).toBeNull();

      const { createAgentSession } = await import("@mariozechner/pi-coding-agent");
      const createAgentSessionMock = vi.mocked(createAgentSession);
      const sessionMock: {
        listener?: (event: unknown) => void;
        subscribe: (listener: (event: unknown) => void) => () => void;
        prompt: (_text: string) => Promise<void>;
        abort: () => void;
        dispose: () => Promise<void>;
      } = {
        subscribe(listener: (event: unknown) => void) {
          sessionMock.listener = listener;
          return () => undefined;
        },
        async prompt(_text: string) {
          sessionMock.listener?.({
            type: "message_update",
            assistantMessageEvent: { type: "text_delta", delta: "SDK output" },
          });
        },
        abort() {},
        async dispose() {},
      };
      createAgentSessionMock.mockResolvedValueOnce({
        session: sessionMock,
      } as never);

      const launch = launched.launch;
      expect(launch).not.toBeNull();
      if (!launch) throw new Error("Expected SDK launch descriptor");
      store.startLaunchExecution("sdk-worker");
      const execution = await runWorkerLaunch(launch);
      expect(execution.status).toBe("completed");
      expect(execution.output).toContain("SDK output");
      expect(createWorkerStore(cwd).readWorker("sdk-worker").state.lastRuntimeKind).toBe("sdk");
    } finally {
      cleanup();
    }
  });

  it("keeps rpc runtime as a bounded fallback seam", async () => {
    const result = await runWorkerLaunch({
      workerId: "rpc-worker",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      runtime: "rpc",
      resume: false,
      workspacePath: ".",
      branch: "rpc-worker",
      baseRef: "HEAD",
      launchPrompt: "Prompt",
      command: ["rpc-session", "--mode", "rpc"],
      pid: null,
      status: "prepared",
      note: "rpc seam",
    });
    expect(result.status).toBe("failed");
    expect(result.error).toContain("RPC worker runtime fallback is not implemented yet");
  });

  it("returns a failed execution result when sdk session setup fails", async () => {
    const { createAgentSession } = await import("@mariozechner/pi-coding-agent");
    const createAgentSessionMock = vi.mocked(createAgentSession);
    createAgentSessionMock.mockRejectedValueOnce(new Error("SDK setup failed"));

    const result = await runWorkerLaunch({
      workerId: "sdk-failure-worker",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      runtime: "sdk",
      resume: false,
      workspacePath: ".",
      branch: "sdk-failure-worker",
      baseRef: "HEAD",
      launchPrompt: "Prompt",
      command: ["sdk-session", "Prompt"],
      pid: null,
      status: "prepared",
      note: "sdk setup test",
    });
    expect(result.status).toBe("failed");
    expect(result.error).toContain("SDK setup failed");
  });

  it("reconstructs runtime kind and scheduler visibility from durable state", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      const ticketStore = createTicketStore(cwd);
      ticketStore.initLedger();
      ticketStore.createTicket({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });

      const store = createWorkerStore(cwd);
      store.createWorker({ title: "Recovery Worker", linkedRefs: { ticketIds: ["t-0001"] } });
      store.appendMessage("recovery-worker", {
        direction: "manager_to_worker",
        kind: "assignment",
        text: "Resume me when ready",
      });
      store.prepareLaunch("recovery-worker", false, "sdk prepare", "sdk");
      await store.runManagerSchedulerPass();

      const reread = createWorkerStore(cwd).readWorker("recovery-worker");
      expect(reread.launch?.runtime).toBe("sdk");
      expect(reread.state.lastRuntimeKind).toBeNull();
      expect(reread.summary.runtimeKind).toBeNull();
      expect(reread.state.lastSchedulerSummary).toContain("resume candidate");
      expect(reread.packet).toContain("Pending approval:");
    } finally {
      cleanup();
    }
  });
});
