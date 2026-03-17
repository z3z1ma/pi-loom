import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { findEntityByDisplayId } from "@pi-loom/pi-storage/storage/entities.js";
import { openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLedgerPaths, getTicketPath } from "../extensions/domain/paths.js";
import { createTicketStore } from "../extensions/domain/store.js";

describe("TicketStore durable ledger", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-ticketing-store-"));
    process.env.PI_LOOM_ROOT = join(workspace, ".pi-loom-test");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.PI_LOOM_ROOT;
    rmSync(workspace, { recursive: true, force: true });
  });

  it("writes canonical ticket records and preserves path semantics across close and reopen", async () => {
    const store = createTicketStore(workspace);
    vi.setSystemTime(new Date("2024-01-02T03:04:05.000Z"));
    const created = await store.createTicketAsync({
      title: "Launch control refuses login",
      type: "bug",
      priority: "high",
      tags: ["ops", "sev1"],
      links: ["runbook"],
      initiativeIds: ["platform-modernization"],
      researchIds: ["evaluate-theme-architecture"],
      specChange: "incident-auth-recovery",
      specCapabilities: ["auth-recovery"],
      specRequirements: ["req-001"],
      acceptance: ["Operators can log in again"],
      labels: ["auth"],
      summary: "Login failures block responders.",
      context: "Observed during morning cutover.",
      plan: "Inspect auth gateway and revert bad rollout.",
      notes: "Pager engaged.",
      verification: "Smoke test pending.",
      journalSummary: "Initial intake recorded.",
    });

    const openPath = getTicketPath(workspace, created.summary.id, false);
    expect(created.ticket.closed).toBe(false);
    expect(created.ticket.path).toBe(relative(workspace, openPath));
    expect(created.summary.path).toBe(relative(workspace, openPath));
    expect(created.ticket.frontmatter).toMatchObject({
      id: "t-0001",
      title: "Launch control refuses login",
      status: "open",
      priority: "high",
      type: "bug",
      tags: ["ops", "sev1"],
      links: ["runbook"],
      "initiative-ids": ["platform-modernization"],
      "research-ids": ["evaluate-theme-architecture"],
      "spec-change": "incident-auth-recovery",
      "spec-capabilities": ["auth-recovery"],
      "spec-requirements": ["req-001"],
      acceptance: ["Operators can log in again"],
      labels: ["auth"],
      "created-at": "2024-01-02T03:04:05.000Z",
      "updated-at": "2024-01-02T03:04:05.000Z",
    });
    expect(created.ticket.body).toMatchObject({
      summary: "Login failures block responders.",
      context: "Observed during morning cutover.",
      plan: "Inspect auth gateway and revert bad rollout.",
      notes: "Pager engaged.",
      verification: "Smoke test pending.",
      journalSummary: "Initial intake recorded.",
    });
    expect(created.summary.initiativeIds).toEqual(["platform-modernization"]);
    expect(created.summary.researchIds).toEqual(["evaluate-theme-architecture"]);
    expect(created.summary.specChange).toBe("incident-auth-recovery");
    expect(created.summary.specCapabilities).toEqual(["auth-recovery"]);
    expect(created.summary.specRequirements).toEqual(["req-001"]);

    vi.setSystemTime(new Date("2024-01-02T04:00:00.000Z"));
    const checkpointed = await store.recordCheckpointAsync(created.summary.id, {
      title: "Captured login traces",
      body: "Saved packet captures for later comparison.",
    });
    expect(checkpointed.checkpoints).toEqual([
      expect.objectContaining({
        id: "cp-0001",
        path: relative(workspace, join(workspace, ".loom", "checkpoints", "cp-0001.md")),
      }),
    ]);

    vi.setSystemTime(new Date("2024-01-02T05:06:07.000Z"));
    const closed = await store.closeTicketAsync(created.summary.id, "Smoke test passed.");
    const closedPath = getTicketPath(workspace, created.summary.id, true);
    expect(closed.ticket.closed).toBe(true);
    expect(closed.ticket.path).toBe(relative(workspace, closedPath));
    expect(closed.summary.path).toBe(relative(workspace, closedPath));
    expect(closed.ticket.frontmatter.status).toBe("closed");
    expect(closed.ticket.frontmatter["updated-at"]).toBe("2024-01-02T05:06:07.000Z");
    expect(closed.ticket.body.verification).toBe("Smoke test pending.\n\nSmoke test passed.");
    expect(getLedgerPaths(workspace).closedTicketsDir).toContain(".loom/tickets/closed");
    expect(await store.listTicketsAsync({ includeClosed: true })).toEqual([
      expect.objectContaining({ id: created.summary.id, path: relative(workspace, closedPath) }),
    ]);

    vi.setSystemTime(new Date("2024-01-02T06:00:00.000Z"));
    const reopened = await store.reopenTicketAsync(created.summary.id);
    expect(reopened.ticket.closed).toBe(false);
    expect(reopened.ticket.frontmatter.status).toBe("open");
    expect(reopened.ticket.frontmatter["updated-at"]).toBe("2024-01-02T06:00:00.000Z");
    expect(reopened.ticket.path).toBe(relative(workspace, openPath));
    expect(reopened.summary.path).toBe(relative(workspace, openPath));

    const { storage, identity } = await openWorkspaceStorage(workspace);
    const entity = await findEntityByDisplayId(storage, identity.space.id, "ticket", created.summary.id);
    expect(entity).toBeTruthy();
    if (!entity) {
      throw new Error("Expected ticket entity to exist");
    }

    expect(entity.version).toBe(4);
    expect(entity.attributes).toMatchObject({
      record: {
        ticket: {
          closed: false,
          path: openPath,
          frontmatter: {
            status: "open",
            "updated-at": "2024-01-02T06:00:00.000Z",
          },
          body: {
            verification: "Smoke test pending.\n\nSmoke test passed.",
          },
        },
        checkpoints: [
          {
            id: "cp-0001",
            title: "Captured login traces",
            body: "Saved packet captures for later comparison.",
          },
        ],
      },
    });
  }, 30000);

  it("persists sequential ticket writes in sqlite by incrementing the canonical entity version", async () => {
    const store = createTicketStore(workspace);

    vi.setSystemTime(new Date("2024-01-03T00:00:01.000Z"));
    const created = await store.createTicketAsync({ title: "Track audit trail" });
    vi.setSystemTime(new Date("2024-01-03T00:00:02.000Z"));
    await store.addNoteAsync(created.summary.id, "Captured incident notes");
    vi.setSystemTime(new Date("2024-01-03T00:00:03.000Z"));
    await store.closeTicketAsync(created.summary.id, "Verified closure");
    vi.setSystemTime(new Date("2024-01-03T00:00:04.000Z"));
    await store.reopenTicketAsync(created.summary.id);

    const { storage, identity } = await openWorkspaceStorage(workspace);
    const entity = await findEntityByDisplayId(storage, identity.space.id, "ticket", created.summary.id);
    expect(entity).toBeTruthy();
    if (!entity) {
      throw new Error("Expected ticket entity to exist");
    }

    expect(entity.version).toBe(4);
    expect(entity.attributes).toMatchObject({
      record: {
        ticket: {
          closed: false,
          frontmatter: {
            status: "open",
            "updated-at": "2024-01-03T00:00:04.000Z",
          },
          body: {
            notes: "- 2024-01-03T00:00:02.000Z Captured incident notes",
            verification: "Verified closure",
          },
        },
        journal: [
          { kind: "state", text: "Created ticket Track audit trail", metadata: { action: "create" } },
          { kind: "note", text: "Captured incident notes", metadata: {} },
          { kind: "verification", text: "Verified closure", metadata: { action: "close" } },
          { kind: "state", text: "Reopened ticket", metadata: { action: "reopen", status: "open" } },
        ],
      },
    });
  }, 30000);
});
