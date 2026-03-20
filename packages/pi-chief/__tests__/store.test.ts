import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createRalphStore } from "../../pi-ralph/extensions/domain/store.js";
import { createSeededGitWorkspace } from "../../pi-storage/__tests__/helpers/git-fixture.js";
import { hasProjectedArtifactAttributes } from "../../pi-storage/storage/artifacts.js";
import { openWorkspaceStorage } from "../../pi-storage/storage/workspace.js";
import { createTicketStore } from "../../pi-ticketing/extensions/domain/store.js";
import { getWorkerRuntimeDir } from "../extensions/domain/paths.js";
import { createManagerStore } from "../extensions/domain/manager-store.js";
import { createWorkerStore } from "../extensions/domain/store.js";

function createWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-chief-store-"));
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
  return createSeededGitWorkspace({ prefix: "pi-chief-store-git-" });
}

async function createWorkerTicket(cwd: string, title = "Worker ticket"): Promise<void> {
  const ticketStore = createTicketStore(cwd);
  await ticketStore.initLedgerAsync();
  await ticketStore.createTicketAsync({ title, summary: "test", context: "context", plan: "plan" });
}

describe("WorkerStore", () => {
  it("rejects worker creation without a linked ticket", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      const store = createWorkerStore(cwd);
      await expect(store.createWorkerAsync({ title: "Ticketless Worker" } as never)).rejects.toThrow(
        "Workers require exactly one linked ticket id",
      );
    } finally {
      cleanup();
    }
  });

  it("creates portable worker records, linked Ralph runs, and ticket refs", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      await createWorkerTicket(cwd, "Worker-linked ticket");
      const store = createWorkerStore(cwd);
      const created = await store.createWorkerAsync({
        title: "Worker Foundation",
        objective: "Build a durable worker package",
        ticketId: "t-0001",
        managerId: "test-manager",
      });

      expect(created.state.workerId).toBe("worker-foundation");
      expect(created.state.workspace.repositoryRoot).toBe(".");
      expect(created.state.workspace.workspaceKey).toBe("worker-runtime:worker-foundation");
      expect(created.state.ralphRunId).toBe("worker-foundation-loop");
      expect(created.launch).toBeNull();
      expect(JSON.stringify(created.state)).not.toContain(cwd);
      expect(created.summary.ticketId).toBe("t-0001");

      await vi.waitFor(async () => {
        const ticket = await createTicketStore(cwd).readTicketAsync("t-0001");
        expect(ticket.ticket.frontmatter["external-refs"]).toContain("worker:worker-foundation");
      });

      const { storage, identity } = await openWorkspaceStorage(cwd);
      const entity = await storage.getEntityByDisplayId(identity.space.id, "worker", "worker-foundation");
      expect(entity?.attributes).toEqual(
        expect.objectContaining({
          state: expect.objectContaining({ workerId: "worker-foundation", ticketId: "t-0001" }),
        }),
      );
      expect(JSON.stringify(entity?.attributes ?? {})).not.toContain('"launch"');
      expect(JSON.stringify(entity?.attributes ?? {})).not.toContain('"messages"');
      expect(JSON.stringify(entity?.attributes ?? {})).not.toContain('"checkpoints"');
    } finally {
      cleanup();
    }
  }, 30000);

  it("prepares launch descriptors without leaking runtime paths into canonical state", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      await createWorkerTicket(cwd, "Runtime worker ticket");
      const store = createWorkerStore(cwd);
      await store.createWorkerAsync({ title: "Runtime Worker", ticketId: "t-0001", managerId: "test-manager" });
      const prepared = await store.prepareLaunchAsync("runtime-worker");

      expect(prepared.launch).not.toBeNull();
      expect(prepared.state.status).toBe("queued");
      expect(prepared.launch?.workspaceDir).toBe(getWorkerRuntimeDir(cwd, "runtime-worker"));
      expect(existsSync(prepared.launch?.workspaceDir ?? "")).toBe(true);
      expect(prepared.launch?.status).toBe("prepared");

      const { storage, identity } = await openWorkspaceStorage(cwd);
      const workerEntity = await storage.getEntityByDisplayId(identity.space.id, "worker", "runtime-worker");
      expect(JSON.stringify(workerEntity?.attributes ?? {})).not.toContain(prepared.launch?.workspaceDir ?? "");
      const runtimeAttachments = await storage.listRuntimeAttachments(identity.worktree.id);
      expect(runtimeAttachments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "launch_descriptor", locator: "worker:runtime-worker:launch" }),
        ]),
      );
    } finally {
      cleanup();
    }
  }, 90000);

  it("marks successful linked Ralph iterations as waiting for manager review", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      await createWorkerTicket(cwd, "Linked Ralph ticket");
      const store = createWorkerStore(cwd);
      await store.createWorkerAsync({ title: "Linked Ralph Worker", ticketId: "t-0001", managerId: "test-manager" });
      const prepared = await store.prepareLaunchAsync("linked-ralph-worker", false, "linked launch");
      expect(prepared.launch?.iterationId).toBe("iter-001");

      const started = await store.startLaunchExecutionAsync("linked-ralph-worker");
      expect(started.state.status).toBe("running");

      const launch = started.launch;
      if (!launch) throw new Error("Expected launch descriptor");
      createRalphStore(cwd).appendIteration(launch.ralphRunId, {
        id: launch.iterationId,
        status: "accepted",
        summary: "Processed the queued worker iteration",
        workerSummary: "Left a durable worker result for the manager",
      });
      const decided = createRalphStore(cwd).decideRun(launch.ralphRunId, {
        summary: "The manager should inspect this iteration before deciding what comes next.",
        decidedBy: "runtime",
      });
      createRalphStore(cwd).appendIteration(launch.ralphRunId, {
        id: launch.iterationId,
        decision: decided.state.latestDecision ?? undefined,
      });

      const finished = await store.finishLaunchExecutionAsync("linked-ralph-worker", {
        status: "completed",
        output: "Ralph iteration output",
        error: null,
      });

      expect(finished.state.status).toBe("waiting_for_manager");
      expect(finished.launch?.status).toBe("completed");
      expect(finished.state.summary).toContain("Processed the queued worker iteration");
      expect(finished.state.summary).toContain("durable worker result");
    } finally {
      cleanup();
    }
  }, 90000);

  it("records worker outcomes and queued continuation instructions", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      await createWorkerTicket(cwd, "Worker outcome ticket");
      const store = createWorkerStore(cwd);
      await store.createWorkerAsync({ title: "Outcome Worker", ticketId: "t-0001", managerId: "test-manager" });

      const queued = await store.recordWorkerOutcomeAsync("outcome-worker", {
        status: "queued",
        summary: "Manager wants another bounded iteration.",
        instructions: ["Inspect the merge conflict and try a smaller patch."],
      });
      expect(queued.state.status).toBe("queued");
      expect(queued.state.pendingInstructions).toEqual(["Inspect the merge conflict and try a smaller patch."]);

      const completed = await store.recordWorkerOutcomeAsync("outcome-worker", {
        status: "completed",
        summary: "Merged into the target ref.",
        validation: ["npm run test:integration -- packages/pi-chief/__tests__/tools.test.ts"],
      });
      expect(completed.state.status).toBe("completed");
      expect(completed.state.pendingInstructions).toEqual([]);

      await vi.waitFor(async () => {
        const ticket = await createTicketStore(cwd).readTicketAsync("t-0001");
        expect(ticket.journal.map((entry) => entry.text)).toEqual(
          expect.arrayContaining([expect.stringContaining("Worker outcome-worker outcome: completed")]),
        );
      });
    } finally {
      cleanup();
    }
  }, 30000);

  it("creates managers with linked Ralph runs and records manager-side worker updates", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      await createWorkerTicket(cwd, "Chief ticket");
      const managerStore = createManagerStore(cwd);
      const manager = await managerStore.createManagerAsync({
        title: "Chief Manager",
        linkedRefs: { ticketIds: ["t-0001"] },
      });
      expect(manager.state.ralphRunId).toBe("chief-manager-loop");
      expect(manager.managerLoop.runId).toBe("chief-manager-loop");

      const workerStore = createWorkerStore(cwd);
      await workerStore.createWorkerAsync({
        workerId: "chief-manager-t-0001",
        title: "Chief Worker",
        ticketId: "t-0001",
        managerId: manager.state.managerId,
      });

      const updated = await managerStore.recordManagerStepAsync(manager.state.managerId, {
        summary: "Recorded a completed worker and asked for operator input.",
        status: "waiting_for_input",
        operatorMessages: [{ kind: "report", text: "Worker merged cleanly.", workerId: "chief-manager-t-0001" }],
        workerUpdates: [{ workerId: "chief-manager-t-0001", status: "completed", summary: "Merged into target" }],
      });

      expect(updated.state.status).toBe("waiting_for_input");
      expect(updated.messages.some((message) => message.kind === "report")).toBe(true);
      expect(workerStore.readWorker("chief-manager-t-0001").state.status).toBe("completed");
    } finally {
      cleanup();
    }
  }, 30000);
});
