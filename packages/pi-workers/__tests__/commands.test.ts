import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { describe, expect, it } from "vitest";
import { handleWorkerCommand } from "../extensions/commands/worker.js";

function createWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-workers-commands-"));
  execFileSync("git", ["init"], { cwd, encoding: "utf-8" });
  execFileSync("git", ["config", "user.name", "Pi Loom Tests"], { cwd, encoding: "utf-8" });
  execFileSync("git", ["config", "user.email", "tests@example.com"], { cwd, encoding: "utf-8" });
  writeFileSync(join(cwd, "README.md"), "seed\n", "utf-8");
  execFileSync("git", ["add", "README.md"], { cwd, encoding: "utf-8" });
  execFileSync("git", ["commit", "-m", "seed"], { cwd, encoding: "utf-8" });
  return { cwd, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

function createCtx(cwd: string): ExtensionCommandContext {
  return { cwd, ui: { notify() {}, setEditorText() {} } } as unknown as ExtensionCommandContext;
}

describe("/worker command", () => {
  it("creates lists and shows workers", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      const ticketStore = createTicketStore(cwd);
      ticketStore.initLedger();
      ticketStore.createTicket({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });
      const ctx = createCtx(cwd);

      const created = await handleWorkerCommand("create Foundation Worker :: Build the package :: t-0001", ctx);
      expect(created).toContain("foundation-worker [requested]");

      const listed = await handleWorkerCommand("list", ctx);
      expect(listed).toContain("foundation-worker [requested/unknown]");

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
      ticketStore.initLedger();
      ticketStore.createTicket({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });
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
  });
});
