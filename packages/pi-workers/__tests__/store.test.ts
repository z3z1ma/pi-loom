import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { describe, expect, it } from "vitest";
import { createWorkerStore } from "../extensions/domain/store.js";

function createGitWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-workers-store-"));
  execFileSync("git", ["init"], { cwd, encoding: "utf-8" });
  execFileSync("git", ["config", "user.name", "Pi Loom Tests"], { cwd, encoding: "utf-8" });
  execFileSync("git", ["config", "user.email", "tests@example.com"], { cwd, encoding: "utf-8" });
  writeFileSync(join(cwd, "README.md"), "seed\n", "utf-8");
  execFileSync("git", ["add", "README.md"], { cwd, encoding: "utf-8" });
  execFileSync("git", ["commit", "-m", "seed"], { cwd, encoding: "utf-8" });
  return { cwd, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

function createWorkerTicket(cwd: string, title = "Worker ticket"): void {
  const ticketStore = createTicketStore(cwd);
  ticketStore.initLedger();
  ticketStore.createTicket({ title, summary: "test", context: "context", plan: "plan" });
}

describe("WorkerStore", () => {
  it("rejects worker creation without a linked ticket", () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      const store = createWorkerStore(cwd);
      expect(() => store.createWorker({ title: "Ticketless Worker" })).toThrow(
        "Workers require at least one linked ticket id",
      );
    } finally {
      cleanup();
    }
  });

  it("creates portable worker records and links tickets", () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      createWorkerTicket(cwd, "Worker-linked ticket");

      const ticketStore = createTicketStore(cwd);
      const store = createWorkerStore(cwd);
      const created = store.createWorker({
        title: "Worker Foundation",
        objective: "Build a durable worker package",
        linkedRefs: { ticketIds: ["t-0001"], planIds: ["worker-plan"], ralphRunIds: ["ralph-run-1"] },
      });

      expect(created.state.workerId).toBe("worker-foundation");
      expect(created.state.workspace.repositoryRoot).toBe(".");
      expect(created.state.workspace.logicalPath).toBe(".loom/runtime/workers/worker-foundation");
      expect(readFileSync(created.artifacts.state, "utf-8")).not.toContain(cwd);
      expect(created.summary.ticketCount).toBe(1);

      const ticket = ticketStore.readTicket("t-0001");
      expect(ticket.ticket.frontmatter["external-refs"]).toContain("worker:worker-foundation");
    } finally {
      cleanup();
    }
  });

  it("tracks unresolved inbox backlog and explicit acknowledgment/resolution transitions", () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      createWorkerTicket(cwd, "Inbox ticket");

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
  });

  it("renders worker packets with unresolved inbox and explicit stop-condition contract", () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      createWorkerTicket(cwd, "Packet ticket");

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
  });

  it("records messages checkpoints approvals and consolidation outcomes durably", () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      createWorkerTicket(cwd, "Worker lifecycle ticket");

      const store = createWorkerStore(cwd);
      store.createWorker({ title: "Lifecycle Worker", linkedRefs: { ticketIds: ["t-0001"] } });
      store.appendMessage("lifecycle-worker", {
        direction: "worker_to_manager",
        kind: "escalation",
        text: "Need clarification about workspace provisioning",
      });
      store.appendCheckpoint("lifecycle-worker", {
        summary: "Blocked on workspace contract",
        understanding: "Need a durable logical path and branch naming rule",
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

      const journal = readFileSync(join(cwd, ".loom", "tickets", "t-0001.journal.jsonl"), "utf-8");
      expect(journal).toContain("requested completion");
      expect(journal).toContain("approval decision: approved");
      expect(journal).toContain("consolidation outcome: merged");
    } finally {
      cleanup();
    }
  });

  it("requires approval before recording consolidation outcomes", () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      createWorkerTicket(cwd, "Approval gate ticket");

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
  });

  it("prepares launch descriptors without leaking runtime paths into canonical state or claiming activity", () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      createWorkerTicket(cwd, "Runtime worker ticket");

      const store = createWorkerStore(cwd);
      store.createWorker({ title: "Runtime Worker", linkedRefs: { ticketIds: ["t-0001"] } });
      const prepared = store.prepareLaunch("runtime-worker");

      expect(prepared.launch).not.toBeNull();
      expect(prepared.state.status).toBe("requested");
      expect(prepared.state.latestTelemetry.state).toBe("unknown");
      expect(prepared.launch?.workspacePath).toContain(".loom/runtime/workers/runtime-worker");
      expect(existsSync(prepared.launch?.workspacePath ?? "")).toBe(true);
      expect(prepared.launch?.status).toBe("prepared");
      expect(readFileSync(prepared.artifacts.state, "utf-8")).not.toContain(prepared.launch?.workspacePath ?? "");
      expect(readFileSync(prepared.artifacts.launch, "utf-8")).toContain(prepared.launch?.workspacePath ?? "");
    } finally {
      cleanup();
    }
  });

  it("refuses retirement cleanup for paths outside or different from the owning worker runtime", () => {
    const { cwd, cleanup } = createGitWorkspace();
    const outsideDir = mkdtempSync(join(tmpdir(), "pi-workers-outside-"));
    try {
      createWorkerTicket(cwd, "Retire worker ticket");

      const store = createWorkerStore(cwd);
      const prepared = store.createWorker({ title: "Retire Worker", linkedRefs: { ticketIds: ["t-0001"] } });
      store.createWorker({ title: "Sibling Worker", linkedRefs: { ticketIds: ["t-0001"] } });
      const siblingLaunch = store.prepareLaunch("sibling-worker");
      writeFileSync(
        prepared.artifacts.launch,
        `${JSON.stringify(
          {
            ...prepared.launch,
            workspacePath: outsideDir,
            status: "prepared",
            note: "unsafe path injected for test",
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      expect(() => store.retireWorker("retire-worker", "retire requested")).toThrow(
        "Refusing to retire workspace not owned by worker retire-worker",
      );
      expect(existsSync(outsideDir)).toBe(true);

      writeFileSync(
        prepared.artifacts.launch,
        `${JSON.stringify(
          {
            ...prepared.launch,
            workspacePath: siblingLaunch.launch?.workspacePath,
            status: "prepared",
            note: "sibling path injected for test",
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      expect(() => store.retireWorker("retire-worker", "retire requested")).toThrow(
        "Refusing to retire workspace not owned by worker retire-worker",
      );
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
      cleanup();
    }
  });

  it("produces durable supervision decisions and persists applied interventions", () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      createWorkerTicket(cwd, "Supervision worker ticket");

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
  });

  it("runs a bounded manager scheduler pass over unresolved inbox and approval backlog", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      createWorkerTicket(cwd, "Scheduler worker ticket");

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
      expect(store.readWorker("scheduler-worker").state.lastSchedulerSummary).toContain("resume candidate");
    } finally {
      cleanup();
    }
  });

  it("treats blocked workers with new inbox instructions as resume candidates", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      createWorkerTicket(cwd, "Blocked worker ticket");

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
  });

  it("does not double-resume workers that already have a running launch", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      createWorkerTicket(cwd, "Running worker ticket");

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
  });
});
