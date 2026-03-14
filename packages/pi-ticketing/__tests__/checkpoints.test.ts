import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCheckpointIndexPath, getCheckpointPath } from "../extensions/domain/paths.js";
import { createTicketStore } from "../extensions/domain/store.js";

describe("ticket checkpoints", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-ticketing-checkpoints-"));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(workspace, { recursive: true, force: true });
  });

  it("persists checkpoints and links them back to the ticket", () => {
    const store = createTicketStore(workspace);

    vi.setSystemTime(new Date("2024-04-01T12:00:00.000Z"));
    const created = store.createTicket({ title: "Snapshot remediation state" });
    vi.setSystemTime(new Date("2024-04-01T12:05:00.000Z"));
    const checkpointed = store.recordCheckpoint(created.ticket.frontmatter.id, {
      title: "After rollout revert",
      body: "Traffic normalized after reverting release.",
    });

    const checkpointPath = getCheckpointPath(workspace, "cp-0001");
    const indexPath = getCheckpointIndexPath(workspace, created.ticket.frontmatter.id);
    expect(existsSync(checkpointPath)).toBe(true);
    expect(existsSync(indexPath)).toBe(true);
    expect(JSON.parse(readFileSync(indexPath, "utf-8"))).toEqual(["cp-0001"]);

    const checkpointMarkdown = readFileSync(checkpointPath, "utf-8");
    expect(checkpointMarkdown).toContain("---\nid: cp-0001");
    expect(checkpointMarkdown).toContain("ticket: t-0001");
    expect(checkpointMarkdown).toContain('title: "After rollout revert"');
    expect(checkpointMarkdown).toContain("created-at: 2024-04-01T12:05:00.000Z");
    expect(checkpointMarkdown).toContain("Traffic normalized after reverting release.");

    expect(checkpointed.checkpoints).toEqual([
      expect.objectContaining({
        id: "cp-0001",
        ticketId: "t-0001",
        title: "After rollout revert",
        body: "Traffic normalized after reverting release.",
      }),
    ]);
  });
});
