import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSeededGitWorkspace } from "../../pi-storage/__tests__/helpers/git-fixture.js";
import { runWorkerLaunch } from "../extensions/domain/runtime.js";
import { createWorkerStore } from "../extensions/domain/store.js";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    spawn: spawnMock,
  };
});

vi.mock("@pi-loom/pi-ralph/extensions/domain/runtime.js", async () => {
  const actual = await vi.importActual<typeof import("@pi-loom/pi-ralph/extensions/domain/runtime.js")>(
    "@pi-loom/pi-ralph/extensions/domain/runtime.js",
  );
  return {
    ...actual,
    runRalphLaunch: vi.fn(),
  };
});

afterEach(() => {
  spawnMock.mockReset();
});

function createGitWorkspace(): { cwd: string; cleanup: () => void } {
  return createSeededGitWorkspace({ prefix: "pi-chief-runtime-" });
}

describe("worker runtime", () => {
  it("propagates original parent harness metadata through detached daemon hops", async () => {
    const originalExecPath = process.execPath;
    const originalExecArgv = [...process.execArgv];
    const originalArgv1 = process.argv[1];
    const originalParentExecPath = process.env.PI_PARENT_HARNESS_EXEC_PATH;
    const originalParentExecArgv = process.env.PI_PARENT_HARNESS_EXEC_ARGV;
    const originalParentArgv1 = process.env.PI_PARENT_HARNESS_ARGV1;
    const unref = vi.fn();
    spawnMock.mockReturnValue({ unref } as never);

    try {
      process.execArgv = ["--experimental-strip-types"];
      process.argv[1] = "/daemon/manager-daemon.ts";
      process.env.PI_PARENT_HARNESS_EXEC_PATH = "/usr/local/bin/node";
      process.env.PI_PARENT_HARNESS_EXEC_ARGV = JSON.stringify(["--import", "tsx"]);
      process.env.PI_PARENT_HARNESS_ARGV1 = "/original/bin/pi.js";

      const { startManagerDaemon, startWorkerLaunchProcess } = await import("../extensions/domain/manager-runtime.js");
      startManagerDaemon("/workspace/project", "manager-001");
      startWorkerLaunchProcess("/workspace/project", "worker-001");

      expect(spawnMock).toHaveBeenNthCalledWith(
        1,
        originalExecPath,
        ["--experimental-strip-types", expect.stringContaining("manager-daemon.ts"), "/workspace/project", "manager-001"],
        expect.objectContaining({
          cwd: "/workspace/project",
          detached: true,
          stdio: "ignore",
          shell: false,
          env: expect.objectContaining({
            PI_PARENT_HARNESS_EXEC_PATH: "/usr/local/bin/node",
            PI_PARENT_HARNESS_EXEC_ARGV: JSON.stringify(["--import", "tsx"]),
            PI_PARENT_HARNESS_ARGV1: "/original/bin/pi.js",
          }),
        }),
      );
      expect(spawnMock).toHaveBeenNthCalledWith(
        2,
        originalExecPath,
        ["--experimental-strip-types", expect.stringContaining("worker-launcher.ts"), "/workspace/project", "worker-001"],
        expect.objectContaining({
          env: expect.objectContaining({
            PI_PARENT_HARNESS_EXEC_PATH: "/usr/local/bin/node",
            PI_PARENT_HARNESS_EXEC_ARGV: JSON.stringify(["--import", "tsx"]),
            PI_PARENT_HARNESS_ARGV1: "/original/bin/pi.js",
          }),
        }),
      );
      expect(unref).toHaveBeenCalledTimes(2);
    } finally {
      process.execArgv = originalExecArgv;
      process.argv[1] = originalArgv1;
      if (originalParentExecPath === undefined) {
        delete process.env.PI_PARENT_HARNESS_EXEC_PATH;
      } else {
        process.env.PI_PARENT_HARNESS_EXEC_PATH = originalParentExecPath;
      }
      if (originalParentExecArgv === undefined) {
        delete process.env.PI_PARENT_HARNESS_EXEC_ARGV;
      } else {
        process.env.PI_PARENT_HARNESS_EXEC_ARGV = originalParentExecArgv;
      }
      if (originalParentArgv1 === undefined) {
        delete process.env.PI_PARENT_HARNESS_ARGV1;
      } else {
        process.env.PI_PARENT_HARNESS_ARGV1 = originalParentArgv1;
      }
    }
  });

  it("provisions and retires Git worktree-backed worker attachments", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      const ticketStore = createTicketStore(cwd);
      await ticketStore.initLedgerAsync();
      await ticketStore.createTicketAsync({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });
      const store = createWorkerStore(cwd);
      await store.createWorkerAsync({ title: "Runtime Worker", ticketId: "t-0001", managerId: "test-manager" });
      const launched = await store.prepareLaunchAsync("runtime-worker", false, "prepare launch");
      expect(launched.launch).not.toBeNull();
      expect(launched.launch?.runtime).toBe("subprocess");
      expect(existsSync(launched.launch?.workspaceDir ?? "")).toBe(true);
      expect(launched.launch?.status).toBe("prepared");

      const retired = await store.retireWorkerAsync("runtime-worker", "retired in test");
      expect(retired.state.status).toBe("retired");
      expect(retired.launch?.status).toBe("retired");
    } finally {
      cleanup();
    }
  }, 30000);

  it("recreates a prepared workspace when durable branch state changes", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      const ticketStore = createTicketStore(cwd);
      await ticketStore.initLedgerAsync();
      await ticketStore.createTicketAsync({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });
      const store = createWorkerStore(cwd);
      await store.createWorkerAsync({ title: "Runtime Worker", ticketId: "t-0001", managerId: "test-manager" });

      const firstLaunch = await store.prepareLaunchAsync("runtime-worker", false, "initial launch");
      expect(firstLaunch.launch?.workspaceDir).toBeTruthy();
      expect(firstLaunch.launch?.runtime).toBe("subprocess");
      expect(
        execFileSync("git", ["-C", firstLaunch.launch?.workspaceDir ?? "", "branch", "--show-current"], {
          encoding: "utf-8",
        }).trim(),
      ).toBe("runtime-worker");

      await store.updateWorkerAsync("runtime-worker", {
        workspace: { branch: "runtime-worker-rebased", baseRef: "HEAD" },
      });

      const secondLaunch = await store.prepareLaunchAsync("runtime-worker", true, "resume on new branch");
      expect(secondLaunch.launch?.workspaceDir).toBe(firstLaunch.launch?.workspaceDir);
      expect(
        execFileSync("git", ["-C", secondLaunch.launch?.workspaceDir ?? "", "branch", "--show-current"], {
          encoding: "utf-8",
        }).trim(),
      ).toBe("runtime-worker-rebased");
      expect(secondLaunch.launch?.branch).toBe("runtime-worker-rebased");
    } finally {
      cleanup();
    }
  }, 60000);

  it("passes pending instructions through to linked Ralph launch metadata", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      const ticketStore = createTicketStore(cwd);
      await ticketStore.initLedgerAsync();
      await ticketStore.createTicketAsync({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });
      const store = createWorkerStore(cwd);
      await store.createWorkerAsync({ title: "Instruction Worker", ticketId: "t-0001", managerId: "test-manager" });
      await store.recordWorkerOutcomeAsync("instruction-worker", {
        status: "queued",
        summary: "Queue another pass",
        instructions: ["Fix the merge conflict first."],
      });

      const launched = await store.prepareLaunchAsync("instruction-worker", true, "resume linked launch");
      expect(launched.launch?.instructions).toEqual(expect.arrayContaining(["Fix the merge conflict first."]));
      expect(launched.state.pendingInstructions).toEqual([]);
    } finally {
      cleanup();
    }
  }, 60000);

  it("fails worker launches when the linked Ralph metadata is incomplete", async () => {
    const result = await runWorkerLaunch({
      workerId: "metadata-worker",
      ralphRunId: "",
      iterationId: "",
      iteration: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      runtime: "subprocess",
      resume: false,
      workspaceDir: ".",
      branch: "metadata-worker",
      baseRef: "HEAD",
      packetRef: "",
      ralphLaunchRef: "",
      instructions: [],
      command: ["pi", "ralph", "launch", "run-001"],
      pid: null,
      status: "prepared",
      note: "metadata test",
    });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("Worker launch descriptor is missing linked Ralph run metadata.");
  });

  it("propagates linked Ralph runtime failures instead of inventing worker-local fallback behavior", async () => {
    const { runRalphLaunch } = await import("@pi-loom/pi-ralph/extensions/domain/runtime.js");
    const runRalphLaunchMock = vi.mocked(runRalphLaunch);
    runRalphLaunchMock.mockResolvedValueOnce({
      command: "pi",
      args: ["ralph"],
      exitCode: 17,
      output: "",
      stderr: "linked run failed",
    });

    const result = await runWorkerLaunch({
      workerId: "failing-worker",
      ralphRunId: "run-001",
      iterationId: "iter-001",
      iteration: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      runtime: "subprocess",
      resume: true,
      workspaceDir: ".",
      branch: "failing-worker",
      baseRef: "HEAD",
      packetRef: "ralph-run:run-001:packet",
      ralphLaunchRef: "ralph-run:run-001:launch",
      instructions: ["Inspect durable state"],
      command: ["pi", "ralph", "resume", "run-001"],
      pid: null,
      status: "prepared",
      note: "failure test",
    });

    expect(result.status).toBe("failed");
    expect(result.output).toBe("");
    expect(result.error).toBe("linked run failed");
  });
});
