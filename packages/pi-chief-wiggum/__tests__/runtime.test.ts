import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRalphStore } from "@pi-loom/pi-ralph-wiggum/extensions/domain/store.js";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSeededGitWorkspace } from "../../pi-storage/__tests__/helpers/git-fixture.js";
import {
  scheduleManagerLoop,
  scheduleWorkerLaunch,
  waitForManagerUpdate,
} from "../extensions/domain/manager-runtime.js";
import { createManagerStore } from "../extensions/domain/manager-store.js";
import { runWorkerLaunch } from "../extensions/domain/runtime.js";
import { createWorkerStore } from "../extensions/domain/store.js";

vi.mock("@pi-loom/pi-ralph-wiggum/extensions/domain/runtime.js", async () => {
  const actual = await vi.importActual<typeof import("@pi-loom/pi-ralph-wiggum/extensions/domain/runtime.js")>(
    "@pi-loom/pi-ralph-wiggum/extensions/domain/runtime.js",
  );
  return {
    ...actual,
    runRalphLaunch: vi.fn(),
  };
});

function createGitWorkspace(): { cwd: string; cleanup: () => void } {
  return createSeededGitWorkspace({ prefix: "pi-chief-runtime-" });
}

async function waitFor<T>(read: () => T, predicate: (value: T) => boolean, attempts = 40): Promise<T> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = read();
    if (predicate(value)) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return read();
}

afterEach(async () => {
  vi.clearAllMocks();
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe("chief async-job-backed scheduler", () => {
  it("coalesces duplicate manager scheduling and preserves runtime env", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      const managerStore = createManagerStore(cwd);
      const manager = await managerStore.createManagerAsync({
        title: "Scheduled Manager",
      });
      const { runRalphLaunch } = await import("@pi-loom/pi-ralph-wiggum/extensions/domain/runtime.js");
      const runRalphLaunchMock = vi.mocked(runRalphLaunch);
      runRalphLaunchMock.mockImplementationOnce(async (launchCwd, launch, _signal, _onUpdate, extraEnv) => {
        createRalphStore(launchCwd).appendIteration(launch.runId, {
          id: launch.iterationId,
          status: "accepted",
          summary: "Completed one bounded manager iteration.",
          workerSummary: "Durable checkpoint persisted from the session runtime.",
          decision: {
            kind: "pause",
            reason: "operator_requested",
            summary: "Pause after one pass.",
            decidedAt: new Date().toISOString(),
            decidedBy: "runtime",
            blockingRefs: [],
          },
        });
        expect(extraEnv).toMatchObject({
          PI_PARENT_SESSION_MODEL_PROVIDER: "anthropic",
          PI_CHIEF_INTERNAL_MANAGER: "1",
        });
        return {
          command: "session-runtime",
          args: [launch.runId],
          exitCode: 0,
          output: "manager pass complete",
          stderr: "",
        };
      });

      scheduleManagerLoop(cwd, manager.state.managerId, {
        PI_PARENT_SESSION_MODEL_PROVIDER: "anthropic",
      });
      scheduleManagerLoop(cwd, manager.state.managerId, {
        PI_PARENT_SESSION_MODEL_PROVIDER: "anthropic",
      });

      const updated = await waitFor(
        () => createManagerStore(cwd).readManager(manager.state.managerId),
        (value) => value.state.status === "waiting_for_input",
      );

      expect(updated.state.status).toBe("waiting_for_input");
      expect(runRalphLaunchMock).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  }, 90000);

  it("does not treat report-only manager output as terminal while waiting for durable advancement", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      const managerStore = createManagerStore(cwd);
      const manager = await managerStore.createManagerAsync({ title: "Reporting Wait Manager" });

      await managerStore.recordManagerStepAsync(manager.state.managerId, {
        summary: "Shared a durable report without blocking the operator.",
        operatorMessages: [{ kind: "report", text: "Still processing queued work." }],
      });

      const startedAt = Date.now();
      const waitPromise = waitForManagerUpdate(cwd, manager.state.managerId, {
        timeoutMs: 15_000,
        pollIntervalMs: 100,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      await managerStore.recordManagerStepAsync(manager.state.managerId, {
        summary: "Durable manager progress after the informational report.",
      });

      const updated = await waitPromise;
      const elapsedMs = Date.now() - startedAt;

      expect(elapsedMs).toBeGreaterThanOrEqual(100);
      expect(elapsedMs).toBeLessThan(1_000);
      expect(updated.state.status).toBe("active");
      expect(updated.state.summary).toBe("Durable manager progress after the informational report.");
    } finally {
      cleanup();
    }
  }, 90000);

  it("keeps scheduling after a report-only manager pass and reaches worker launch reconciliation", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      const ticketStore = createTicketStore(cwd);
      await ticketStore.initLedgerAsync();
      await ticketStore.createTicketAsync({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });

      const managerStore = createManagerStore(cwd);
      const manager = await managerStore.createManagerAsync({
        title: "Report Then Reconcile",
        linkedRefs: { ticketIds: ["t-0001"] },
      });

      const { runRalphLaunch } = await import("@pi-loom/pi-ralph-wiggum/extensions/domain/runtime.js");
      const runRalphLaunchMock = vi.mocked(runRalphLaunch);
      let managerPasses = 0;
      let releaseWorkerLaunch: (() => void) | undefined;
      runRalphLaunchMock.mockImplementation(async (launchCwd, launch) => {
        if (launch.runId === manager.state.ralphRunId) {
          managerPasses += 1;
          if (managerPasses === 1) {
            await managerStore.recordManagerStepAsync(manager.state.managerId, {
              summary: "Reported progress before reconciling workers.",
              operatorMessages: [{ kind: "report", text: "Reconciling workers next." }],
            });
          } else if (managerPasses === 2) {
            await managerStore.reconcileManagerWorkersAsync(manager.state.managerId);
          } else {
            await managerStore.recordManagerStepAsync(manager.state.managerId, {
              status: "waiting_for_input",
              summary: "Stop after verifying that worker launch was scheduled.",
              operatorMessages: [{ kind: "escalation", text: "Worker launch verification complete." }],
            });
          }
          createRalphStore(launchCwd).appendIteration(launch.runId, {
            id: launch.iterationId,
            status: "accepted",
            summary: `Completed manager pass ${managerPasses}.`,
            workerSummary: "Durable manager checkpoint persisted.",
            decision: {
              kind: "pause",
              reason: "operator_requested",
              summary: `Pause after manager pass ${managerPasses}.`,
              decidedAt: new Date().toISOString(),
              decidedBy: "runtime",
              blockingRefs: [],
            },
          });
          return {
            command: "session-runtime",
            args: [launch.runId],
            exitCode: 0,
            output: `manager pass ${managerPasses}`,
            stderr: "",
          };
        }

        return await new Promise((resolve) => {
          releaseWorkerLaunch = () => {
            resolve({
              command: "session-runtime",
              args: [launch.runId],
              exitCode: 0,
              output: "worker run complete",
              stderr: "",
            });
          };
        });
      });

      scheduleManagerLoop(cwd, manager.state.managerId);

      const workerId = await waitFor(
        () => createManagerStore(cwd).readManager(manager.state.managerId).state.workerIds[0] ?? null,
        (value) => Boolean(value),
      );
      const worker = await waitFor(
        () => (workerId ? createWorkerStore(cwd).readWorker(workerId) : null),
        (value) => value?.state.status === "running",
      );

      const updatedManager = createManagerStore(cwd).readManager(manager.state.managerId);
      expect(managerPasses).toBe(2);
      expect(updatedManager.state.status).toBe("active");
      expect(updatedManager.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ direction: "manager_to_operator", kind: "report", status: "pending" }),
        ]),
      );
      expect(worker?.state.status).toBe("running");
      expect(worker?.launch?.status).toBe("running");

      releaseWorkerLaunch?.();

      const blockedManager = await waitFor(
        () => createManagerStore(cwd).readManager(manager.state.managerId),
        (value) => value.state.status === "waiting_for_input",
      );
      expect(blockedManager.state.status).toBe("waiting_for_input");
    } finally {
      cleanup();
    }
  }, 90000);

  it("coalesces duplicate worker scheduling and keeps manager-only env out of workers", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      const ticketStore = createTicketStore(cwd);
      await ticketStore.initLedgerAsync();
      await ticketStore.createTicketAsync({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });

      const managerStore = createManagerStore(cwd);
      const manager = await managerStore.createManagerAsync({ title: "Worker Scheduler" });

      const workerStore = createWorkerStore(cwd);
      await workerStore.createWorkerAsync({
        workerId: "worker-scheduler-t-0001",
        title: "Worker Scheduler",
        ticketId: "t-0001",
        managerId: manager.state.managerId,
      });
      await workerStore.prepareLaunchAsync("worker-scheduler-t-0001", false, "prepare worker launch");
      await workerStore.startLaunchExecutionAsync("worker-scheduler-t-0001");
      const preparedWorker = createWorkerStore(cwd).readWorker("worker-scheduler-t-0001");

      scheduleManagerLoop(cwd, manager.state.managerId, {
        PI_PARENT_SESSION_MODEL_PROVIDER: "anthropic",
      });

      const { runRalphLaunch } = await import("@pi-loom/pi-ralph-wiggum/extensions/domain/runtime.js");
      const runRalphLaunchMock = vi.mocked(runRalphLaunch);
      runRalphLaunchMock.mockResolvedValueOnce({
        command: "session-runtime",
        args: ["worker"],
        exitCode: 17,
        output: "",
        stderr: "linked run failed",
      });

      scheduleWorkerLaunch(cwd, "worker-scheduler-t-0001");
      scheduleWorkerLaunch(cwd, "worker-scheduler-t-0001");

      const worker = await waitFor(
        () => createWorkerStore(cwd).readWorker("worker-scheduler-t-0001"),
        (value) => value.state.status === "failed",
      );

      expect(worker.state.status).toBe("failed");
      const workerCalls = runRalphLaunchMock.mock.calls.filter(
        (call) => call[1]?.runId === preparedWorker.state.ralphRunId,
      );
      expect(workerCalls).toHaveLength(1);
      expect(workerCalls[0]?.[4]).toMatchObject({
        PI_PARENT_SESSION_MODEL_PROVIDER: "anthropic",
      });
      expect(workerCalls[0]?.[4]).not.toHaveProperty("PI_CHIEF_INTERNAL_MANAGER");
    } finally {
      cleanup();
    }
  }, 90000);

  it("does not start queued worker work after the manager explicitly waits for input, even with a report", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      const ticketStore = createTicketStore(cwd);
      await ticketStore.initLedgerAsync();
      await ticketStore.createTicketAsync({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });

      const managerStore = createManagerStore(cwd);
      const manager = await managerStore.createManagerAsync({ title: "Paused Manager" });

      const workerStore = createWorkerStore(cwd);
      await workerStore.createWorkerAsync({
        workerId: "paused-manager-t-0001",
        title: "Paused Worker",
        ticketId: "t-0001",
        managerId: manager.state.managerId,
      });
      await workerStore.prepareLaunchAsync("paused-manager-t-0001", false, "prepare worker launch");
      await workerStore.startLaunchExecutionAsync("paused-manager-t-0001");

      await managerStore.recordManagerStepAsync(manager.state.managerId, {
        status: "waiting_for_input",
        summary: "Hold all work until the operator responds.",
        operatorMessages: [{ kind: "report", text: "Paused after the latest worker update." }],
      });

      const { runRalphLaunch } = await import("@pi-loom/pi-ralph-wiggum/extensions/domain/runtime.js");
      const runRalphLaunchMock = vi.mocked(runRalphLaunch);

      scheduleWorkerLaunch(cwd, "paused-manager-t-0001");

      const worker = await waitFor(
        () => createWorkerStore(cwd).readWorker("paused-manager-t-0001"),
        (value) => value.state.status === "queued",
      );

      expect(worker.state.status).toBe("queued");
      expect(worker.launch?.status).toBe("prepared");
      const workerCalls = runRalphLaunchMock.mock.calls.filter((call) => call[1]?.runId === worker.state.ralphRunId);
      expect(workerCalls).toHaveLength(0);
    } finally {
      cleanup();
    }
  }, 90000);

  it("wakes manager waiters when durable worker state changes become visible", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      const ticketStore = createTicketStore(cwd);
      await ticketStore.initLedgerAsync();
      await ticketStore.createTicketAsync({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });

      const managerStore = createManagerStore(cwd);
      const manager = await managerStore.createManagerAsync({
        title: "Worker Visibility",
        linkedRefs: { ticketIds: ["t-0001"] },
      });
      const { runRalphLaunch } = await import("@pi-loom/pi-ralph-wiggum/extensions/domain/runtime.js");
      const runRalphLaunchMock = vi.mocked(runRalphLaunch);
      let releaseWorkerLaunch: (() => void) | undefined;
      runRalphLaunchMock.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseWorkerLaunch = () => {
              resolve({
                command: "session-runtime",
                args: ["worker-visibility-t-0001"],
                exitCode: 17,
                output: "",
                stderr: "linked run failed",
              });
            };
          }),
      );

      const reconciled = await managerStore.reconcileManagerWorkersAsync(manager.state.managerId);
      const workerId = reconciled.workers[0]?.id;
      expect(workerId).toBeTruthy();

      const workerStore = createWorkerStore(cwd);
      await waitFor(
        () => workerStore.readWorker(workerId ?? ""),
        (value) => value.state.status === "running",
      );

      const startedAt = Date.now();
      const waitPromise = waitForManagerUpdate(cwd, manager.state.managerId, {
        timeoutMs: 15_000,
        pollIntervalMs: 2_000,
      });
      await waitFor(
        () => Boolean(releaseWorkerLaunch),
        (value) => value,
      );
      releaseWorkerLaunch?.();

      const updated = await waitPromise;
      const elapsedMs = Date.now() - startedAt;

      expect(elapsedMs).toBeLessThan(2_000);
      expect(updated.workers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: workerId, status: "failed", latestSummary: "linked run failed" }),
        ]),
      );
    } finally {
      cleanup();
    }
  }, 90000);

  it("moves managers to waiting_for_input when a manager pass runtime fails after leaving chief state behind", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      const managerStore = createManagerStore(cwd);
      const manager = await managerStore.createManagerAsync({ title: "Runtime Failure Manager" });

      const { runRalphLaunch } = await import("@pi-loom/pi-ralph-wiggum/extensions/domain/runtime.js");
      const runRalphLaunchMock = vi.mocked(runRalphLaunch);
      runRalphLaunchMock.mockImplementationOnce(async (_launchCwd, launch) => {
        await managerStore.recordManagerStepAsync(manager.state.managerId, {
          summary: "Manager recorded work before failing.",
        });
        return {
          command: "session-runtime",
          args: [launch.runId],
          exitCode: 1,
          output: "",
          stderr: "manager runtime failed",
        };
      });

      scheduleManagerLoop(cwd, manager.state.managerId, {
        PI_PARENT_SESSION_MODEL_PROVIDER: "anthropic",
      });

      const updated = await waitFor(
        () => createManagerStore(cwd).readManager(manager.state.managerId),
        (value) => value.state.status === "waiting_for_input",
      );

      expect(updated.state.status).toBe("waiting_for_input");
      expect(
        updated.messages.some(
          (message) => message.direction === "manager_to_operator" && message.kind === "escalation",
        ),
      ).toBe(true);
    } finally {
      cleanup();
    }
  }, 90000);
});

describe("worker runtime", () => {
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
      expect(launched.launch?.runtime).toBe("session");
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
      expect(firstLaunch.launch?.runtime).toBe("session");
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
      runtime: "session",
      resume: false,
      workspaceDir: ".",
      branch: "metadata-worker",
      baseRef: "HEAD",
      packetRef: "",
      ralphLaunchRef: "",
      instructions: [],
      command: ["session-runtime", "ralph", "launch", "run-001"],
      pid: null,
      status: "prepared",
      note: "metadata test",
    });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("Worker launch descriptor is missing linked Ralph run metadata.");
  });

  it("propagates linked Ralph runtime failures instead of inventing worker-local fallback behavior", async () => {
    const { runRalphLaunch } = await import("@pi-loom/pi-ralph-wiggum/extensions/domain/runtime.js");
    const runRalphLaunchMock = vi.mocked(runRalphLaunch);
    runRalphLaunchMock.mockResolvedValueOnce({
      command: "session-runtime",
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
      runtime: "session",
      resume: true,
      workspaceDir: ".",
      branch: "failing-worker",
      baseRef: "HEAD",
      packetRef: "ralph-run:run-001:packet",
      ralphLaunchRef: "ralph-run:run-001:launch",
      instructions: ["Inspect durable state"],
      command: ["session-runtime", "ralph", "resume", "run-001"],
      pid: null,
      status: "prepared",
      note: "failure test",
    });

    expect(result.status).toBe("failed");
    expect(result.output).toBe("");
    expect(result.error).toBe("linked run failed");
  });
});
