import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { findEntityByDisplayId } from "@pi-loom/pi-storage/storage/entities.js";
import { openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCheckpointPath } from "../extensions/domain/paths.js";
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

  it("persists checkpoints in the canonical ticket record and links them back to the ticket", async () => {
    const store = createTicketStore(workspace);

    vi.setSystemTime(new Date("2024-04-01T12:00:00.000Z"));
    const created = await store.createTicketAsync({ title: "Snapshot remediation state" });
    vi.setSystemTime(new Date("2024-04-01T12:05:00.000Z"));
    const checkpointed = await store.recordCheckpointAsync(created.summary.id, {
      title: "After rollout revert",
      body: "Traffic normalized after reverting release.",
    });

    expect(checkpointed.checkpoints).toEqual([
      expect.objectContaining({
        id: "cp-0001",
        ticketId: "t-0001",
        title: "After rollout revert",
        createdAt: "2024-04-01T12:05:00.000Z",
        body: "Traffic normalized after reverting release.",
        path: relative(workspace, getCheckpointPath(workspace, "cp-0001")),
      }),
    ]);

    const reread = await createTicketStore(workspace).readTicketAsync(created.summary.id);
    expect(reread.checkpoints).toEqual(checkpointed.checkpoints);

    const { storage, identity } = await openWorkspaceStorage(workspace);
    const entity = await findEntityByDisplayId(storage, identity.space.id, "ticket", created.summary.id);
    expect(entity).toBeTruthy();
    if (!entity) {
      throw new Error("Expected ticket entity to exist");
    }

    expect(entity.attributes).toMatchObject({
      record: {
        checkpoints: [
          {
            id: "cp-0001",
            ticketId: "t-0001",
            title: "After rollout revert",
            createdAt: "2024-04-01T12:05:00.000Z",
            body: "Traffic normalized after reverting release.",
            path: relative(workspace, getCheckpointPath(workspace, "cp-0001")),
          },
        ],
      },
    });
  }, 30000);
});
