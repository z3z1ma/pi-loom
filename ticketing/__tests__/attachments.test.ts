import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findEntityByDisplayId } from "#storage/entities.js";
import { openWorkspaceStorage } from "#storage/workspace.js";
import { createTicketStore } from "../domain/store.js";

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
    const sourceFile = join(workspace, "evidence.txt");
    writeFileSync(sourceFile, "captured evidence\n", "utf-8");

    vi.setSystemTime(new Date("2024-03-01T10:00:00.000Z"));
    const created = await store.createTicketAsync({ title: "Capture evidence" });
    vi.setSystemTime(new Date("2024-03-01T10:00:01.000Z"));
    const updated = await store.attachArtifactAsync(created.summary.id, {
      label: "incident-log",
      path: sourceFile,
      description: "Original terminal transcript",
      metadata: { sha256: "abc123", retained: true },
    });

    expect(updated.attachments).toEqual([
      expect.objectContaining({
        id: "attachment-0001",
        ticketId: "t-0001",
        label: "incident-log",
        description: "Original terminal transcript",
        mediaType: "text/plain",
        artifactRef: null,
        sourceRef: "attachment-source:t-0001:attachment-0001:evidence.txt",
        metadata: expect.objectContaining({
          sha256: "abc123",
          retained: true,
          inlineContentBase64: Buffer.from("captured evidence\n", "utf-8").toString("base64"),
          inlineEncoding: "base64",
          inlineSourceType: "filesystem",
          sourceName: "evidence.txt",
        }),
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
            artifactRef: null,
            sourceRef: "attachment-source:t-0001:attachment-0001:evidence.txt",
            metadata: expect.objectContaining({
              sha256: "abc123",
              retained: true,
              inlineContentBase64: Buffer.from("captured evidence\n", "utf-8").toString("base64"),
              inlineEncoding: "base64",
              inlineSourceType: "filesystem",
              sourceName: "evidence.txt",
            }),
          },
        ],
      },
    });
  }, 30000);
});
