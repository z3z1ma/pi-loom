import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRalphStore } from "@pi-loom/pi-ralph/extensions/domain/store.js";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { describe, expect, it, vi } from "vitest";
import { createSeededGitWorkspace } from "../../pi-storage/__tests__/helpers/git-fixture.js";
import { runWorkerLaunch } from "../extensions/domain/runtime.js";
import { createWorkerStore } from "../extensions/domain/store.js";

vi.mock("@pi-loom/pi-ralph/extensions/domain/runtime.js", () => ({
  runRalphLaunch: vi.fn(),
}));

function createGitWorkspace(): { cwd: string; cleanup: () => void } {
  return createSeededGitWorkspace({ prefix: "pi-workers-runtime-" });
}

describe("worker runtime", () => {
  it("provisions and retires Git worktree-backed worker attachments", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      const ticketStore = createTicketStore(cwd);
      await ticketStore.initLedgerAsync();
      await ticketStore.createTicketAsync({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });
      const store = createWorkerStore(cwd);
      store.createWorker({ title: "Runtime Worker", linkedRefs: { ticketIds: ["t-0001"] } });
      const launched = store.prepareLaunch("runtime-worker", false, "prepare launch");
      expect(launched.launch).not.toBeNull();
      expect(launched.launch?.runtime).toBe("subprocess");
      expect(existsSync(launched.launch?.workspaceDir ?? "")).toBe(true);
      expect(launched.launch?.status).toBe("prepared");

      const retired = store.retireWorker("runtime-worker", "retired in test");
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
      store.createWorker({ title: "Runtime Worker", linkedRefs: { ticketIds: ["t-0001"] } });

      const firstLaunch = store.prepareLaunch("runtime-worker", false, "initial launch");
      expect(firstLaunch.launch?.workspaceDir).toBeTruthy();
      expect(firstLaunch.launch?.runtime).toBe("subprocess");
      expect(
        execFileSync("git", ["-C", firstLaunch.launch?.workspaceDir ?? "", "branch", "--show-current"], {
          encoding: "utf-8",
        }).trim(),
      ).toBe("runtime-worker");

      store.updateWorker("runtime-worker", {
        workspace: { branch: "runtime-worker-rebased", baseRef: "HEAD" },
      });

      const secondLaunch = store.prepareLaunch("runtime-worker", true, "resume on new branch");
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

  it("prepares linked Ralph iteration metadata and records durable post-iteration outcomes", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      const ticketStore = createTicketStore(cwd);
      await ticketStore.initLedgerAsync();
      await ticketStore.createTicketAsync({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });
      const store = createWorkerStore(cwd);
      store.createWorker({ title: "Linked Ralph Worker", linkedRefs: { ticketIds: ["t-0001"] } });
      store.appendMessage("linked-ralph-worker", {
        direction: "manager_to_worker",
        kind: "assignment",
        text: "Complete the assigned work and resolve this inbox item",
      });

      const launched = store.prepareLaunch("linked-ralph-worker", false, "linked launch");
      expect(launched.launch?.runtime).toBe("subprocess");

      const launch = launched.launch;
      expect(launch).not.toBeNull();
      if (!launch) throw new Error("Expected linked Ralph launch descriptor");
      expect(launch.ralphRunId).toBe(launched.state.linkedRefs.ralphRunIds[0]);
      expect(launch.iterationId).toBe("iter-001");
      expect(launch.iteration).toBe(1);
      expect(launch.packetRef).toBe(`ralph-run:${launch.ralphRunId}:packet`);
      expect(launch.ralphLaunchRef).toBe(`ralph-run:${launch.ralphRunId}:launch`);
      expect(launch.command).toEqual(["pi", "ralph", "launch", launch.ralphRunId]);
      expect(launch.instructions).toEqual(
        expect.arrayContaining([
          `Execute the next Ralph iteration in worktree ${launch.branch}.`,
          `This worker is the ticket-bound wrapper for linked Ralph run ${launch.ralphRunId}.`,
        ]),
      );

      const { runRalphLaunch } = await import("@pi-loom/pi-ralph/extensions/domain/runtime.js");
      const runRalphLaunchMock = vi.mocked(runRalphLaunch);
      runRalphLaunchMock.mockResolvedValueOnce({
        command: "pi",
        args: ["ralph"],
        exitCode: 0,
        output: "Ralph iteration output",
        stderr: "",
      });

      store.startLaunchExecution("linked-ralph-worker");
      store.resolveMessage(
        "linked-ralph-worker",
        launched.dashboard.unresolvedInbox[0]?.id ?? "",
        "worker",
        "Handled the inbox item",
      );
      const execution = await runWorkerLaunch(launch);
      expect(execution.status).toBe("completed");
      expect(execution.output).toContain("Ralph iteration output");
      expect(runRalphLaunchMock).toHaveBeenCalledWith(
        launch.workspaceDir,
        expect.objectContaining({
          runId: launch.ralphRunId,
          iterationId: launch.iterationId,
          iteration: launch.iteration,
          runtime: launch.runtime,
          packetRef: launch.packetRef,
          launchRef: launch.ralphLaunchRef,
          resume: false,
        }),
        undefined,
        undefined,
      );

      createRalphStore(cwd).appendIteration(launch.ralphRunId, {
        id: launch.iterationId,
        status: "accepted",
        summary: "Processed the inbox assignment",
        workerSummary: "Resolved manager instruction durably",
        decision: {
          kind: "continue",
          reason: "unknown",
          summary: "Manager can inspect the durable worker state between iterations.",
          decidedAt: new Date().toISOString(),
          decidedBy: "runtime",
          blockingRefs: [],
        },
      });

      const finished = store.finishLaunchExecution("linked-ralph-worker", execution);
      expect(finished.state.status).toBe("ready");
      expect(finished.state.latestTelemetry.state).toBe("idle");
      expect(finished.launch?.status).toBe("completed");
      expect(finished.launch?.note).toContain("Processed the inbox assignment");
      expect(finished.launch?.note).toContain("Resolved manager instruction durably");
    } finally {
      cleanup();
    }
  }, 90000);

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

  it("fails a completed launch that leaves no durable Ralph post-iteration evidence behind", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      const ticketStore = createTicketStore(cwd);
      await ticketStore.initLedgerAsync();
      await ticketStore.createTicketAsync({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });
      const store = createWorkerStore(cwd);
      store.createWorker({ title: "No Progress Worker", linkedRefs: { ticketIds: ["t-0001"] } });
      store.appendMessage("no-progress-worker", {
        direction: "manager_to_worker",
        kind: "assignment",
        text: "Process this assignment durably",
      });

      store.prepareLaunch("no-progress-worker", true, "resume");
      store.startLaunchExecution("no-progress-worker");
      const finished = store.finishLaunchExecution("no-progress-worker", {
        status: "completed",
        output: "I looked at it",
        error: null,
      });

      expect(finished.state.status).toBe("failed");
      expect(finished.state.latestTelemetry.state).toBe("blocked");
      expect(finished.launch?.status).toBe("failed");
      expect(finished.launch?.note).toContain(
        "Linked Ralph iteration exited without durable post-iteration state and explicit decision for the prepared iteration.",
      );
      expect(finished.dashboard.unresolvedInbox).toHaveLength(1);
    } finally {
      cleanup();
    }
  }, 90000);
});
