import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { describe, expect, it } from "vitest";
import { handleManagerCommand } from "../extensions/commands/manager.js";
import { handleWorkerCommand } from "../extensions/commands/worker.js";

function createWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-workers-commands-"));
  process.env.PI_LOOM_ROOT = join(cwd, ".pi-loom-test");
  return {
    cwd,
    cleanup: () => {
      delete process.env.PI_LOOM_ROOT;
      rmSync(cwd, { recursive: true, force: true });
    },
  };
}

function createCtx(cwd: string): ExtensionCommandContext {
  return { cwd, ui: { notify() {}, setEditorText() {} } } as unknown as ExtensionCommandContext;
}

describe("/worker command", () => {
  it("creates lists and shows workers", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      const ticketStore = createTicketStore(cwd);
      await ticketStore.initLedgerAsync();
      await ticketStore.createTicketAsync({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });
      const ctx = createCtx(cwd);

      const created = await handleWorkerCommand("create Foundation Worker :: Build the package :: t-0001", ctx);
      expect(created).toContain("foundation-worker [requested]");

      const listed = await handleWorkerCommand("list", ctx);
      expect(listed).toContain("foundation-worker [requested/unknown/none]");

      const shown = await handleWorkerCommand("show foundation-worker", ctx);
      expect(shown).toContain("Tickets: t-0001");
    } finally {
      cleanup();
    }
  });

  it("supports checkpoint approval and retirement flows", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      const ticketStore = createTicketStore(cwd);
      await ticketStore.initLedgerAsync();
      await ticketStore.createTicketAsync({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });
      const ctx = createCtx(cwd);
      await handleWorkerCommand("create Flow Worker :: Build the workflow :: t-0001", ctx);
      await handleWorkerCommand(
        "checkpoint flow-worker Blocked :: Need manager decision :: blocker one | blocker two :: Wait",
        ctx,
      );
      await handleWorkerCommand("complete flow-worker :: Ready for review :: npm run typecheck", ctx);
      const approved = await handleWorkerCommand(
        "approve flow-worker approve :: Looks good :: Evidence sufficient",
        ctx,
      );
      expect(approved).toContain("approved_for_consolidation");
      const retired = await handleWorkerCommand("retire flow-worker", ctx);
      expect(retired).toContain("[retired]");
    } finally {
      cleanup();
    }
  }, 30000);

  it("supports inbox inspection and explicit ack/resolve flows", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      const ticketStore = createTicketStore(cwd);
      await ticketStore.initLedgerAsync();
      await ticketStore.createTicketAsync({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });
      const ctx = createCtx(cwd);

      await handleWorkerCommand("create Inbox Worker :: Process manager messages :: t-0001", ctx);
      await handleWorkerCommand("message inbox-worker manager_to_worker assignment :: Handle the inbox item", ctx);

      const inbox = await handleWorkerCommand("inbox inbox-worker", ctx);
      expect(inbox).toContain("Handle the inbox item");
      expect(inbox).toContain('"status": "pending"');

      const workerStore = (await import("../extensions/domain/store.js")).createWorkerStore(cwd);
      const messageId = workerStore.readInbox("inbox-worker").workerInbox[0]?.id;
      expect(messageId).toBeTruthy();
      if (!messageId) throw new Error("Expected worker inbox message id");

      const acknowledged = await handleWorkerCommand(`ack inbox-worker ${messageId} :: Starting now`, ctx);
      expect(acknowledged).toContain("Inbox backlog: 1");

      const resolved = await handleWorkerCommand(`resolve inbox-worker ${messageId} :: Done`, ctx);
      expect(resolved).toContain("Inbox backlog: 0");
    } finally {
      cleanup();
    }
  }, 30000);

  it("supports manager overview supervision and messaging flows", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      const ticketStore = createTicketStore(cwd);
      await ticketStore.initLedgerAsync();
      await ticketStore.createTicketAsync({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });
      const ctx = createCtx(cwd);

      await handleWorkerCommand("create Managed Worker :: Managed by manager surface :: t-0001", ctx);
      await handleManagerCommand("message managed-worker assignment :: Start the managed work", ctx);

      const overview = await handleManagerCommand("overview", ctx);
      expect(overview).toContain("Workers: 1");
      expect(overview).toContain("Unresolved worker inbox: 1");

      const supervise = await handleManagerCommand("supervise managed-worker", ctx);
      expect(supervise).toContain("managed-worker:");

      const schedule = await handleManagerCommand("schedule", ctx);
      expect(schedule).toContain("managed-worker:");

      const approved = await handleManagerCommand("approve managed-worker approve :: Looks good", ctx);
      expect(approved).toContain("approved_for_consolidation");
    } finally {
      cleanup();
    }
  }, 30000);

  it("lets the manager surface resolve manager-owned inbox backlog", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      const ticketStore = createTicketStore(cwd);
      await ticketStore.initLedgerAsync();
      await ticketStore.createTicketAsync({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });
      const ctx = createCtx(cwd);

      await handleWorkerCommand("create Escalation Worker :: Needs manager action :: t-0001", ctx);
      await handleWorkerCommand(
        "message escalation-worker worker_to_manager escalation :: Need a decision from the manager",
        ctx,
      );

      const workerStore = (await import("../extensions/domain/store.js")).createWorkerStore(cwd);
      const messageId = workerStore.readInbox("escalation-worker").managerInbox[0]?.id;
      expect(messageId).toBeTruthy();
      if (!messageId) throw new Error("Expected manager inbox message id");

      const resolved = await handleManagerCommand(`resolve escalation-worker ${messageId} :: Decision applied`, ctx);
      expect(resolved).toContain("Manager backlog: 0");
    } finally {
      cleanup();
    }
  }, 90000);
});
