import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LoomRuntimeAttachment } from "../storage/contract.js";
import {
  getLocalRuntimeStorePath,
  isRuntimeLeaseActive,
  LocalRuntimeAttachmentStore,
  renewRuntimeLease,
} from "../storage/runtime.js";

function createAttachment(overrides: Partial<LoomRuntimeAttachment> = {}): LoomRuntimeAttachment {
  return {
    id: "runtime-001",
    worktreeId: "worktree-001",
    kind: "worker_runtime",
    localPath: "/tmp/worktree-001",
    processId: 1234,
    leaseExpiresAt: "2026-03-16T12:10:00.000Z",
    metadata: {},
    ...overrides,
  };
}

describe("local runtime attachment store", () => {
  const cleanupPaths: string[] = [];

  afterEach(() => {
    for (const cleanupPath of cleanupPaths.splice(0)) {
      rmSync(cleanupPath, { recursive: true, force: true });
    }
    delete process.env.PI_LOOM_ROOT;
  });

  it("distinguishes active and stale runtime leases without mutating the record", () => {
    const active = createAttachment({ leaseExpiresAt: "2026-03-16T12:10:00.000Z" });
    const stale = createAttachment({ id: "runtime-002", leaseExpiresAt: "2026-03-16T11:59:59.000Z" });
    const now = new Date("2026-03-16T12:00:00.000Z");

    expect(isRuntimeLeaseActive(active, now)).toBe(true);
    expect(isRuntimeLeaseActive(stale, now)).toBe(false);
    expect(stale.leaseExpiresAt).toBe("2026-03-16T11:59:59.000Z");
  });

  it("renews runtime leases with a fresh heartbeat while preserving identity", () => {
    const now = new Date("2026-03-16T12:00:00.000Z");
    const renewed = renewRuntimeLease(createAttachment(), 60_000, now);

    expect(renewed.id).toBe("runtime-001");
    expect(renewed.leaseExpiresAt).toBe("2026-03-16T12:01:00.000Z");
    expect(renewed.metadata).toMatchObject({
      lastHeartbeatAt: "2026-03-16T12:00:00.000Z",
      leaseDurationMs: 60_000,
    });
  });

  it("stores runtime attachments outside the canonical sqlite catalog path", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "pi-storage-runtime-root-"));
    cleanupPaths.push(root);
    process.env.PI_LOOM_ROOT = root;

    const store = new LocalRuntimeAttachmentStore();
    const attachment = createAttachment();
    await store.putRuntimeAttachment(attachment);

    const stored = await store.getRuntimeAttachments("worktree-001");
    expect(stored).toEqual([attachment]);
    expect(store.filePath).toBe(getLocalRuntimeStorePath());
    expect(store.filePath.endsWith("attachments.json")).toBe(true);
    expect(store.filePath.endsWith("catalog.sqlite")).toBe(false);

    await store.removeRuntimeAttachment(attachment.id);
    expect(await store.getRuntimeAttachments("worktree-001")).toEqual([]);
  });
});
