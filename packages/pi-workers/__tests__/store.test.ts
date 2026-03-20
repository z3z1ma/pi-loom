import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createPlanStore } from "../../pi-plans/extensions/domain/store.js";
import { createRalphStore } from "../../pi-ralph/extensions/domain/store.js";
import { createSeededGitWorkspace } from "../../pi-storage/__tests__/helpers/git-fixture.js";
import { hasProjectedArtifactAttributes } from "../../pi-storage/storage/artifacts.js";
import { openWorkspaceStorage } from "../../pi-storage/storage/workspace.js";
import { createTicketStore } from "../../pi-ticketing/extensions/domain/store.js";
import { getWorkerRuntimeDir } from "../extensions/domain/paths.js";
import { createWorkerStore } from "../extensions/domain/store.js";

function createWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-workers-store-"));
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
  return createSeededGitWorkspace({ prefix: "pi-workers-store-git-" });
}

async function createWorkerTicket(cwd: string, title = "Worker ticket"): Promise<void> {
  const ticketStore = createTicketStore(cwd);
  await ticketStore.initLedgerAsync();
  await ticketStore.createTicketAsync({ title, summary: "test", context: "context", plan: "plan" });
}

describe("WorkerStore", () => {
  it("rejects worker creation without a linked ticket", () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      const store = createWorkerStore(cwd);
      expect(() => store.createWorker({ title: "Ticketless Worker" })).toThrow(
        "Workers require at least one linked ticket id",
      );
    } finally {
      cleanup();
    }
  });

  it("creates portable worker records and links tickets", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      await createWorkerTicket(cwd, "Worker-linked ticket");

      const planStore = createPlanStore(cwd);
      const ralphStore = createRalphStore(cwd);
      const ticketStore = createTicketStore(cwd);
      const store = createWorkerStore(cwd);
      const plan = await planStore.createPlan({ title: "Worker plan", sourceTarget: { kind: "workspace", ref: "." } });
      const ralphRun = ralphStore.createRun({ title: "Worker Ralph Run" });
      const created = store.createWorker({
        title: "Worker Foundation",
        objective: "Build a durable worker package",
        linkedRefs: { ticketIds: ["t-0001"], planIds: [plan.state.planId], ralphRunIds: [ralphRun.state.runId] },
      });

      expect(created.state.workerId).toBe("worker-foundation");
      expect(created.state.workspace.repositoryRoot).toBe(".");
      expect(created.state.workspace.workspaceKey).toBe("worker-runtime:worker-foundation");
      expect(created.state.linkedRefs.ralphRunIds).toEqual([ralphRun.state.runId]);
      expect(created.launch).toBeNull();
      expect(JSON.stringify(created.state)).not.toContain(cwd);
      expect(created.summary.ticketCount).toBe(1);

      await vi.waitFor(async () => {
        const ticket = await ticketStore.readTicketAsync("t-0001");
        expect(ticket.ticket.frontmatter["external-refs"]).toContain("worker:worker-foundation");
      });

      const { storage, identity } = await openWorkspaceStorage(cwd);
      const entity = await storage.getEntityByDisplayId(identity.space.id, "worker", "worker-foundation");
      expect(entity?.attributes).toEqual(
        expect.objectContaining({
          state: expect.objectContaining({ workerId: "worker-foundation" }),
          messages: [],
        }),
      );
      expect(JSON.stringify(entity?.attributes ?? {})).not.toContain('"packet"');
      expect(JSON.stringify(entity?.attributes ?? {})).not.toContain('"dashboard"');
      expect(JSON.stringify(entity?.attributes ?? {})).not.toContain('"launch"');
      expect(JSON.stringify(entity?.attributes ?? {})).not.toContain('"checkpoints"');
    } finally {
      cleanup();
    }
  }, 30000);

  it("removes stale worker external refs when linked ticket ids shrink", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      await createWorkerTicket(cwd, "Worker-linked ticket 1");
      await createWorkerTicket(cwd, "Worker-linked ticket 2");

      const ticketStore = createTicketStore(cwd);
      const store = createWorkerStore(cwd);
      store.createWorker({ title: "Shrinking Worker", linkedRefs: { ticketIds: ["t-0001", "t-0002"] } });

      await vi.waitFor(async () => {
        const first = await ticketStore.readTicketAsync("t-0001");
        const second = await ticketStore.readTicketAsync("t-0002");
        expect(first.ticket.frontmatter["external-refs"]).toContain("worker:shrinking-worker");
        expect(second.ticket.frontmatter["external-refs"]).toContain("worker:shrinking-worker");
      });

      store.updateWorker("shrinking-worker", { linkedRefs: { ticketIds: ["t-0001"] } });

      await vi.waitFor(async () => {
        const first = await ticketStore.readTicketAsync("t-0001");
        const second = await ticketStore.readTicketAsync("t-0002");
        expect(first.ticket.frontmatter["external-refs"]).toContain("worker:shrinking-worker");
        expect(second.ticket.frontmatter["external-refs"]).not.toContain("worker:shrinking-worker");
      });
    } finally {
      cleanup();
    }
  }, 30000);

  it("tracks unresolved inbox backlog and explicit acknowledgment/resolution transitions", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      await createWorkerTicket(cwd, "Inbox ticket");

      const store = createWorkerStore(cwd);
      store.createWorker({ title: "Inbox Worker", linkedRefs: { ticketIds: ["t-0001"] } });
      const withInstruction = store.appendMessage("inbox-worker", {
        direction: "manager_to_worker",
        kind: "assignment",
        text: "Process the queued work",
      });

      expect(withInstruction.summary.unresolvedInboxCount).toBe(1);
      expect(withInstruction.dashboard.unresolvedInbox).toHaveLength(1);
      expect(withInstruction.dashboard.unresolvedInbox[0]?.status).toBe("pending");

      const instructionId = withInstruction.dashboard.unresolvedInbox[0]?.id;
      expect(instructionId).toBeTruthy();
      if (!instructionId) throw new Error("Expected unresolved instruction id");

      const acknowledged = store.acknowledgeMessage(
        "inbox-worker",
        instructionId,
        "worker",
        "Acknowledged and starting work",
      );
      expect(acknowledged.dashboard.unresolvedInbox[0]?.status).toBe("acknowledged");
      expect(acknowledged.messages.at(-1)?.kind).toBe("acknowledgement");

      const resolved = store.resolveMessage("inbox-worker", instructionId, "worker", "Finished the assignment");
      expect(resolved.summary.unresolvedInboxCount).toBe(0);
      expect(resolved.dashboard.unresolvedInbox).toHaveLength(0);
      expect(resolved.messages.at(-1)?.kind).toBe("resolution");

      const inbox = store.readInbox("inbox-worker");
      expect(inbox.workerInbox).toHaveLength(0);
      expect(inbox.managerInbox).toHaveLength(0);
    } finally {
      cleanup();
    }
  }, 30000);

  it("renders worker packets with unresolved inbox and explicit stop-condition contract", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      await createWorkerTicket(cwd, "Packet ticket");

      const store = createWorkerStore(cwd);
      store.createWorker({ title: "Packet Worker", linkedRefs: { ticketIds: ["t-0001"] } });
      store.appendMessage("packet-worker", {
        direction: "manager_to_worker",
        kind: "assignment",
        text: "Drain the inbox before stopping",
      });

      const prepared = store.prepareLaunch("packet-worker", false, "launch packet");
      expect(prepared.packet).toContain("Run contract:");
      expect(prepared.packet).toContain("Drain the inbox before stopping");

      const checkpointed = store.appendCheckpoint("packet-worker", {
        summary: "Inbox work processed",
        understanding: "Handled the outstanding instruction",
        acknowledgedMessageIds: [prepared.dashboard.unresolvedInbox[0]?.id ?? ""],
        resolvedMessageIds: [prepared.dashboard.unresolvedInbox[0]?.id ?? ""],
        remainingInboxCount: 0,
        nextAction: "Stop because inbox is empty",
      });
      expect(checkpointed.checkpoints.at(-1)?.remainingInboxCount).toBe(0);
      expect(checkpointed.packet).toContain("Remaining inbox count: 0");
    } finally {
      cleanup();
    }
  }, 60000);

  it("records messages checkpoints approvals and consolidation outcomes durably", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      await createWorkerTicket(cwd, "Worker lifecycle ticket");

      const store = createWorkerStore(cwd);
      store.createWorker({ title: "Lifecycle Worker", linkedRefs: { ticketIds: ["t-0001"] } });
      store.appendMessage("lifecycle-worker", {
        direction: "worker_to_manager",
        kind: "escalation",
        text: "Need clarification about workspace provisioning",
      });
      store.appendCheckpoint("lifecycle-worker", {
        summary: "Blocked on workspace contract",
        understanding: "Need a durable workspace key and branch naming rule",
        blockers: ["Workspace branch naming not finalized"],
        nextAction: "Wait for manager input",
        managerInputRequired: true,
      });
      store.requestCompletion("lifecycle-worker", {
        summary: "Completion requested with evidence",
        validationEvidence: ["npm run typecheck"],
      });
      store.decideApproval("lifecycle-worker", {
        status: "approved",
        summary: "Looks good",
        rationale: ["Evidence is sufficient"],
      });
      const result = store.recordConsolidation("lifecycle-worker", {
        status: "merged",
        strategy: "merge",
        summary: "Merged onto feature branch",
        validation: ["npm run typecheck"],
      });

      expect(result.state.status).toBe("completed");
      expect(result.state.approval.status).toBe("approved");
      expect(result.state.consolidation.status).toBe("merged");
      expect(result.messages).toHaveLength(1);
      expect(result.checkpoints).toHaveLength(1);

      await store.readWorkerAsync("lifecycle-worker");

      const { storage, identity } = await openWorkspaceStorage(cwd);
      const workerEntity = await storage.getEntityByDisplayId(identity.space.id, "worker", "lifecycle-worker");
      expect(workerEntity?.attributes).toEqual(
        expect.objectContaining({
          state: expect.objectContaining({ workerId: "lifecycle-worker" }),
          messages: expect.any(Array),
        }),
      );
      expect(JSON.stringify(workerEntity?.attributes ?? {})).not.toContain('"checkpoints"');

      const checkpointArtifact = await storage.getEntityByDisplayId(
        identity.space.id,
        "artifact",
        result.checkpoints[0]?.id ?? "",
      );
      expect(checkpointArtifact).not.toBeNull();
      const checkpointAttributes = checkpointArtifact?.attributes ?? {};
      expect(hasProjectedArtifactAttributes(checkpointAttributes)).toBe(true);
      if (!hasProjectedArtifactAttributes(checkpointAttributes)) {
        throw new Error("Expected projected checkpoint artifact attributes");
      }
      expect(checkpointAttributes.projectionOwner).toBe("worker-store:checkpoints");
      expect(checkpointAttributes.payload).toEqual(expect.objectContaining({ id: result.checkpoints[0]?.id }));

      const events = workerEntity ? await storage.listEvents(workerEntity.id) : [];
      expect(events.map((event) => event.payload.change)).toEqual(
        expect.arrayContaining([
          "message_appended",
          "checkpoint_appended",
          "completion_requested",
          "approval_decided",
          "consolidation_recorded",
        ]),
      );

      await vi.waitFor(
        async () => {
          const linkedTicket = await createTicketStore(cwd).readTicketAsync("t-0001");
          expect(linkedTicket.journal.map((entry) => entry.text)).toEqual(
            expect.arrayContaining([expect.stringContaining("consolidation outcome: merged")]),
          );
        },
        { timeout: 5000 },
      );
    } finally {
      cleanup();
    }
  }, 90000);

  it("requires approval before recording consolidation outcomes", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      await createWorkerTicket(cwd, "Approval gate ticket");

      const store = createWorkerStore(cwd);
      store.createWorker({ title: "Approval Gate Worker", linkedRefs: { ticketIds: ["t-0001"] } });
      expect(() =>
        store.recordConsolidation("approval-gate-worker", {
          status: "merged",
          strategy: "merge",
          summary: "Should fail before approval",
        }),
      ).toThrow("Consolidation requires prior approved_for_consolidation status");
      expect(() =>
        store.recordConsolidation("approval-gate-worker", {
          status: "deferred",
          summary: "Waiting on another branch",
          followUps: ["Retry after dependency lands"],
        }),
      ).toThrow("Consolidation requires prior approved_for_consolidation status");

      store.requestCompletion("approval-gate-worker", {
        summary: "Ready for approval",
        validationEvidence: ["npm run typecheck"],
      });
      store.decideApproval("approval-gate-worker", {
        status: "approved",
        summary: "Approved for fan-in",
      });

      const deferred = store.recordConsolidation("approval-gate-worker", {
        status: "deferred",
        summary: "Waiting on another branch",
        followUps: ["Retry after dependency lands"],
      });
      expect(deferred.state.status).toBe("approved_for_consolidation");
      expect(deferred.state.consolidation.status).toBe("deferred");
    } finally {
      cleanup();
    }
  }, 90000);

  it("prepares launch descriptors without leaking runtime paths into canonical state or claiming activity", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      await createWorkerTicket(cwd, "Runtime worker ticket");

      const store = createWorkerStore(cwd);
      store.createWorker({ title: "Runtime Worker", linkedRefs: { ticketIds: ["t-0001"] } });
      const prepared = store.prepareLaunch("runtime-worker");

      expect(prepared.launch).not.toBeNull();
      expect(prepared.state.status).toBe("requested");
      expect(prepared.state.latestTelemetry.state).toBe("unknown");
      expect(prepared.launch?.runtime).toBe("subprocess");
      expect(prepared.launch?.ralphRunId).toBe(prepared.state.linkedRefs.ralphRunIds[0]);
      expect(prepared.launch?.workspaceDir).toBe(getWorkerRuntimeDir(cwd, "runtime-worker"));
      expect(existsSync(prepared.launch?.workspaceDir ?? "")).toBe(true);
      expect(prepared.launch?.status).toBe("prepared");

      await store.readWorkerAsync("runtime-worker");

      const { storage, identity } = await openWorkspaceStorage(cwd);
      const workerEntity = await storage.getEntityByDisplayId(identity.space.id, "worker", "runtime-worker");
      expect(JSON.stringify(workerEntity?.attributes ?? {})).not.toContain('"launch"');
      const runtimeAttachments = await storage.listRuntimeAttachments(identity.worktree.id);
      expect(runtimeAttachments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "launch_descriptor",
            locator: "worker:runtime-worker:launch",
          }),
        ]),
      );

      const canonicalPrepared = await store.readWorkerAsync("runtime-worker");
      expect(canonicalPrepared.launch?.workspaceDir).toBe(prepared.launch?.workspaceDir);
      expect(canonicalPrepared.launch?.status).toBe("prepared");
      expect(JSON.stringify(canonicalPrepared.state)).not.toContain(prepared.launch?.workspaceDir ?? "");

      const attachment = runtimeAttachments.find((entry) => entry.locator === "worker:runtime-worker:launch");
      if (!attachment) {
        throw new Error("Expected launch runtime attachment");
      }
      await storage.removeRuntimeAttachment(attachment.id);
      expect((await store.readWorkerAsync("runtime-worker")).launch).toBeNull();
    } finally {
      cleanup();
    }
  }, 90000);

  it("refuses retirement cleanup for paths outside or different from the owning worker runtime", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    const outsideDir = mkdtempSync(join(tmpdir(), "pi-workers-outside-"));
    try {
      await createWorkerTicket(cwd, "Retire worker ticket");

      const store = createWorkerStore(cwd);
      store.createWorker({ title: "Retire Worker", linkedRefs: { ticketIds: ["t-0001"] } });
      store.createWorker({ title: "Sibling Worker", linkedRefs: { ticketIds: ["t-0001"] } });
      const prepared = store.prepareLaunch("retire-worker");
      const siblingLaunch = store.prepareLaunch("sibling-worker");
      const persist = (store as unknown as { persist: (worker: typeof prepared) => void }).persist.bind(store);
      persist({
        ...prepared,
        launch: {
          ...(prepared.launch ??
            (() => {
              throw new Error("Expected launch descriptor");
            })()),
          workspaceDir: outsideDir,
          status: "prepared",
          note: "unsafe workspace dir injected for test",
        },
      });

      expect(() => store.retireWorker("retire-worker", "retire requested")).toThrow(
        "Refusing to retire workspace not owned by worker retire-worker",
      );
      expect(existsSync(outsideDir)).toBe(true);

      persist({
        ...prepared,
        launch: {
          ...(prepared.launch ??
            (() => {
              throw new Error("Expected launch descriptor");
            })()),
          workspaceDir: siblingLaunch.launch?.workspaceDir ?? "",
          status: "prepared",
          note: "sibling workspace dir injected for test",
        },
      });

      expect(() => store.retireWorker("retire-worker", "retire requested")).toThrow(
        "Refusing to retire workspace not owned by worker retire-worker",
      );
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
      cleanup();
    }
  }, 30000);

  it("produces durable supervision decisions and persists applied interventions", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      await createWorkerTicket(cwd, "Supervision worker ticket");

      const store = createWorkerStore(cwd);
      store.createWorker({ title: "Supervise Worker", linkedRefs: { ticketIds: ["t-0001"] } });
      store.appendCheckpoint("supervise-worker", {
        summary: "Still blocked on the same issue",
        understanding: "Need manager help",
        blockers: ["Missing manager decision"],
        nextAction: "Wait",
        managerInputRequired: true,
      });
      store.appendCheckpoint("supervise-worker", {
        summary: "Still blocked on the same issue",
        understanding: "Need manager help",
        blockers: ["Missing manager decision"],
        nextAction: "Wait",
        managerInputRequired: true,
      });
      store.appendCheckpoint("supervise-worker", {
        summary: "Still blocked on the same issue",
        understanding: "Need manager help",
        blockers: ["Missing manager decision"],
        nextAction: "Wait",
        managerInputRequired: true,
      });

      const decision = store.superviseWorker("supervise-worker", true);
      expect(decision.decision.action).toBe("escalate");
      expect(decision.worker.state.interventionCount).toBe(1);
      expect(decision.worker.messages.at(-1)?.direction).toBe("manager_to_worker");
    } finally {
      cleanup();
    }
  }, 90000);

  it("runs a bounded manager scheduler pass over unresolved inbox and approval backlog", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      await createWorkerTicket(cwd, "Scheduler worker ticket");

      const store = createWorkerStore(cwd);
      store.createWorker({ title: "Scheduler Worker", linkedRefs: { ticketIds: ["t-0001"] } });
      store.appendMessage("scheduler-worker", {
        direction: "manager_to_worker",
        kind: "assignment",
        text: "Process queued work",
      });
      store.createWorker({ title: "Approval Worker", linkedRefs: { ticketIds: ["t-0001"] } });
      store.requestCompletion("approval-worker", {
        summary: "Ready for approval",
        validationEvidence: ["npm run typecheck"],
      });

      const decisions = await store.runManagerSchedulerPass();
      expect(decisions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ workerId: "scheduler-worker", action: "resume", applied: false }),
          expect.objectContaining({ workerId: "approval-worker", action: "needs_approval", applied: false }),
        ]),
      );
      const linkedRunId = store.readWorker("scheduler-worker").state.linkedRefs.ralphRunIds[0];
      expect(store.readWorker("scheduler-worker").state.lastSchedulerSummary).toContain(
        `linked Ralph run ${linkedRunId} is ready for another iteration`,
      );
    } finally {
      cleanup();
    }
  }, 30000);

  it("treats blocked workers with new inbox instructions as resume candidates", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      await createWorkerTicket(cwd, "Blocked worker ticket");

      const store = createWorkerStore(cwd);
      store.createWorker({ title: "Blocked Worker", linkedRefs: { ticketIds: ["t-0001"] } });
      store.setTelemetry("blocked-worker", { state: "blocked", summary: "Waiting for manager input" });
      store.appendMessage("blocked-worker", {
        direction: "manager_to_worker",
        kind: "unblock",
        text: "Manager has provided the missing clarification",
      });

      const decisions = await store.runManagerSchedulerPass();
      expect(decisions).toEqual(
        expect.arrayContaining([expect.objectContaining({ workerId: "blocked-worker", action: "resume" })]),
      );
    } finally {
      cleanup();
    }
  }, 90000);

  it("does not double-resume workers that already have a running launch", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      await createWorkerTicket(cwd, "Running worker ticket");

      const store = createWorkerStore(cwd);
      store.createWorker({ title: "Running Worker", linkedRefs: { ticketIds: ["t-0001"] } });
      store.appendMessage("running-worker", {
        direction: "manager_to_worker",
        kind: "assignment",
        text: "Work is queued",
      });
      store.prepareLaunch("running-worker", true, "prepare run");
      store.startLaunchExecution("running-worker");

      const decisions = await store.runManagerSchedulerPass();
      expect(decisions).toEqual(
        expect.arrayContaining([expect.objectContaining({ workerId: "running-worker", action: "wait" })]),
      );
    } finally {
      cleanup();
    }
  }, 30000);
});
