import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findEntityByDisplayId } from "@pi-loom/pi-storage/storage/entities.js";
import { openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTicketStore } from "../extensions/domain/store.js";

describe("ticket attachments", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-ticketing-attachments-"));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(workspace, { recursive: true, force: true });
  });

  it("persists attachment metadata and inline content in the canonical ticket record", async () => {
    const store = createTicketStore(workspace);
    const sourcePath = join(workspace, "evidence.txt");
    writeFileSync(sourcePath, "captured evidence\n", "utf-8");

    vi.setSystemTime(new Date("2024-03-01T10:00:00.000Z"));
    const created = await store.createTicketAsync({ title: "Capture evidence" });
    vi.setSystemTime(new Date("2024-03-01T10:00:01.000Z"));
    const updated = await store.attachArtifactAsync(created.summary.id, {
      label: "incident-log",
      path: sourcePath,
      description: "Original terminal transcript",
      metadata: { sha256: "abc123", retained: true },
    });

    expect(updated.attachments).toEqual([
      expect.objectContaining({
        id: "attachment-0001",
        label: "incident-log",
        description: "Original terminal transcript",
        mediaType: "text/plain",
        artifactPath: null,
        sourcePath: "evidence.txt",
        metadata: {
          sha256: "abc123",
          retained: true,
          inlineContentBase64: Buffer.from("captured evidence\n", "utf-8").toString("base64"),
          inlineEncoding: "base64",
          inlineSourceType: "filesystem",
        },
      }),
    ]);

    const { storage, identity } = await openWorkspaceStorage(workspace);
    const entity = await findEntityByDisplayId(storage, identity.space.id, "ticket", created.summary.id);
    expect(entity).toBeTruthy();
    if (!entity) {
      throw new Error("Expected ticket entity to exist");
    }

    expect(entity.attributes).toMatchObject({
      record: {
        attachments: [
          {
            id: "attachment-0001",
            ticketId: "t-0001",
            label: "incident-log",
            description: "Original terminal transcript",
            mediaType: "text/plain",
            artifactPath: null,
            sourcePath: "evidence.txt",
            metadata: {
              sha256: "abc123",
              retained: true,
              inlineContentBase64: Buffer.from("captured evidence\n", "utf-8").toString("base64"),
              inlineEncoding: "base64",
              inlineSourceType: "filesystem",
            },
          },
        ],
      },
    });
  }, 30000);
});
