import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { describe, expect, it } from "vitest";
import { createWorkerStore } from "../extensions/domain/store.js";

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
});
