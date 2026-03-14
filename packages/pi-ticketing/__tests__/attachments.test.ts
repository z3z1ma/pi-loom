import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAttachmentsIndexPath } from "../extensions/domain/paths.js";
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

  it("persists attachment metadata and returns it on read", () => {
    const store = createTicketStore(workspace);
    const sourcePath = join(workspace, "evidence.txt");
    writeFileSync(sourcePath, "captured evidence\n", "utf-8");

    vi.setSystemTime(new Date("2024-03-01T10:00:00.000Z"));
    const created = store.createTicket({ title: "Capture evidence" });
    vi.setSystemTime(new Date("2024-03-01T10:00:01.000Z"));
    const readResult = store.attachArtifact(created.ticket.frontmatter.id, {
      label: "incident-log",
      path: sourcePath,
      description: "Original terminal transcript",
      metadata: { sha256: "abc123", retained: true },
    });

    const indexPath = getAttachmentsIndexPath(workspace, created.ticket.frontmatter.id);
    expect(existsSync(indexPath)).toBe(true);
    const indexed = JSON.parse(readFileSync(indexPath, "utf-8")) as Array<{
      metadata: Record<string, unknown>;
      artifactPath: string | null;
      sourcePath: string | null;
    }>;
    expect(indexed).toHaveLength(1);
    expect(indexed[0]?.metadata).toEqual({ sha256: "abc123", retained: true });
    expect(indexed[0]?.sourcePath).toBe("evidence.txt");
    expect(indexed[0]?.artifactPath).toBe(".loom/artifacts/artifact-0001.txt");
    expect(existsSync(join(workspace, indexed[0]?.artifactPath ?? ""))).toBe(true);

    expect(readResult.attachments).toEqual([
      expect.objectContaining({
        id: "attachment-0001",
        label: "incident-log",
        description: "Original terminal transcript",
        mediaType: "text/plain",
        artifactPath: ".loom/artifacts/artifact-0001.txt",
        sourcePath: "evidence.txt",
        metadata: { sha256: "abc123", retained: true },
      }),
    ]);
  });
});
