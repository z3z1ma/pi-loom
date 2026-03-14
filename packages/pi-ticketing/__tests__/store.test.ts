import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAuditPath, getLedgerPaths, getTicketPath } from "../extensions/domain/paths.js";
import { createTicketStore } from "../extensions/domain/store.js";

describe("TicketStore durable ledger", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-ticketing-store-"));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(workspace, { recursive: true, force: true });
  });

  it("writes canonical ticket frontmatter and closes by moving the file", () => {
    const store = createTicketStore(workspace);
    vi.setSystemTime(new Date("2024-01-02T03:04:05.000Z"));
    const created = store.createTicket({
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

    const openPath = getTicketPath(workspace, created.ticket.frontmatter.id, false);
    expect(existsSync(openPath)).toBe(true);
    expect(basename(created.ticket.path)).toBe(`${created.ticket.frontmatter.id}.md`);
    expect(created.ticket.path).toBe(relative(workspace, openPath));
    expect(created.summary.path).toBe(relative(workspace, openPath));

    const openMarkdown = readFileSync(openPath, "utf-8");
    expect(openMarkdown).toContain("---\nid: t-0001");
    expect(openMarkdown).toContain('title: "Launch control refuses login"');
    expect(openMarkdown).toContain("status: open");
    expect(openMarkdown).toContain("priority: high");
    expect(openMarkdown).toContain("type: bug");
    expect(openMarkdown).toContain("created-at: 2024-01-02T03:04:05.000Z");
    expect(openMarkdown).toContain("updated-at: 2024-01-02T03:04:05.000Z");
    expect(openMarkdown).toContain("tags:\n  - ops\n  - sev1");
    expect(openMarkdown).toContain("links:\n  - runbook");
    expect(openMarkdown).toContain("initiative-ids:\n  - platform-modernization");
    expect(openMarkdown).toContain("research-ids:\n  - evaluate-theme-architecture");
    expect(openMarkdown).toContain("spec-change: incident-auth-recovery");
    expect(openMarkdown).toContain("spec-capabilities:\n  - auth-recovery");
    expect(openMarkdown).toContain("spec-requirements:\n  - req-001");
    expect(openMarkdown).toContain('acceptance:\n  - "Operators can log in again"');
    expect(openMarkdown).toContain("labels:\n  - auth");
    expect(openMarkdown).toContain("## Summary\nLogin failures block responders.");
    expect(openMarkdown).toContain("## Verification\nSmoke test pending.");

    expect(created.summary.initiativeIds).toEqual(["platform-modernization"]);
    expect(created.summary.researchIds).toEqual(["evaluate-theme-architecture"]);
    expect(created.summary.specChange).toBe("incident-auth-recovery");
    expect(created.summary.specCapabilities).toEqual(["auth-recovery"]);
    expect(created.summary.specRequirements).toEqual(["req-001"]);

    vi.setSystemTime(new Date("2024-01-02T04:00:00.000Z"));
    const checkpointed = store.recordCheckpoint(created.ticket.frontmatter.id, {
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
    const closed = store.closeTicket(created.ticket.frontmatter.id, "Smoke test passed.");
    const closedPath = getTicketPath(workspace, created.ticket.frontmatter.id, true);
    expect(existsSync(openPath)).toBe(false);
    expect(existsSync(closedPath)).toBe(true);
    expect(closed.ticket.closed).toBe(true);
    expect(closed.ticket.path).toBe(relative(workspace, closedPath));
    expect(closed.summary.path).toBe(relative(workspace, closedPath));
    expect(store.listTickets({ includeClosed: true })).toEqual([
      expect.objectContaining({ id: created.ticket.frontmatter.id, path: relative(workspace, closedPath) }),
    ]);

    const closedMarkdown = readFileSync(closedPath, "utf-8");
    expect(closedMarkdown).toContain("status: closed");
    expect(closedMarkdown).toContain("updated-at: 2024-01-02T05:06:07.000Z");
    expect(closedMarkdown).toContain("Smoke test pending.\n\nSmoke test passed.");
    expect(getLedgerPaths(workspace).closedTicketsDir).toContain(".loom/tickets/closed");
  });

  it("appends audit records for each write", () => {
    const store = createTicketStore(workspace);

    vi.setSystemTime(new Date("2024-01-03T00:00:01.000Z"));
    const created = store.createTicket({ title: "Track audit trail" });
    vi.setSystemTime(new Date("2024-01-03T00:00:02.000Z"));
    store.addNote(created.ticket.frontmatter.id, "Captured incident notes");
    vi.setSystemTime(new Date("2024-01-03T00:00:03.000Z"));
    store.closeTicket(created.ticket.frontmatter.id, "Verified closure");

    const auditPath = getAuditPath(workspace, "2024-01-03");
    const auditLines = readFileSync(auditPath, "utf-8").trim().split("\n");
    expect(auditLines).toHaveLength(3);

    const actions = auditLines.map((line) => {
      const entry = JSON.parse(line) as { action: string; ticketId: string | null };
      return { action: entry.action, ticketId: entry.ticketId };
    });
    expect(actions).toEqual([
      { action: "create_ticket", ticketId: "t-0001" },
      { action: "add_note", ticketId: "t-0001" },
      { action: "close_ticket", ticketId: "t-0001" },
    ]);
  });
});
