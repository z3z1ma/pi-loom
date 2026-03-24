import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LoomRuntimeAttachment } from "../storage/contract.js";
import { getLoomCatalogPaths } from "../storage/locations.js";
import { isRuntimeLeaseActive, renewRuntimeLease, SqliteRuntimeAttachmentStore } from "../storage/runtime.js";
import { SqliteLoomCatalog } from "../storage/sqlite.js";

const require = createRequire(import.meta.url);
const BetterSqlite3 = require("better-sqlite3") as typeof import("better-sqlite3");

function createAttachment(overrides: Partial<LoomRuntimeAttachment> = {}): LoomRuntimeAttachment {
  return {
    id: "runtime-001",
    worktreeId: "worktree-001",
    kind: "worker_runtime",
    locator: "worker-runtime:runtime-001",
    processId: 1234,
    leaseExpiresAt: "2026-03-16T12:10:00.000Z",
    metadata: {},
    createdAt: "2026-03-16T12:00:00.000Z",
    updatedAt: "2026-03-16T12:00:00.000Z",
    ...overrides,
  };
}

describe("sqlite runtime attachment store", () => {
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
    expect(renewed.createdAt).toBe("2026-03-16T12:00:00.000Z");
    expect(renewed.updatedAt).toBe("2026-03-16T12:00:00.000Z");
    expect(renewed.leaseExpiresAt).toBe("2026-03-16T12:01:00.000Z");
    expect(renewed.metadata).toMatchObject({
      lastHeartbeatAt: "2026-03-16T12:00:00.000Z",
      leaseDurationMs: 60_000,
    });
  });

  it("persists runtime attachments in the shared sqlite catalog", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "pi-storage-runtime-root-"));
    cleanupPaths.push(root);
    process.env.PI_LOOM_ROOT = root;

    const catalog = new SqliteLoomCatalog();
    try {
      await catalog.upsertSpace({
        id: "space-001",
        slug: "runtime-tests",
        title: "Runtime Tests",
        description: "Seed runtime attachment foreign keys",
        repositoryIds: ["repo-001"],
        createdAt: "2026-03-16T12:00:00.000Z",
        updatedAt: "2026-03-16T12:00:00.000Z",
      });
      await catalog.upsertRepository({
        id: "repo-001",
        spaceId: "space-001",
        slug: "runtime-tests",
        displayName: "Runtime Tests",
        defaultBranch: "main",
        remoteUrls: [],
        createdAt: "2026-03-16T12:00:00.000Z",
        updatedAt: "2026-03-16T12:00:00.000Z",
      });
      await catalog.upsertWorktree({
        id: "worktree-001",
        repositoryId: "repo-001",
        branch: "main",
        baseRef: "main",
        logicalKey: "worktree:runtime-tests",
        status: "attached",
        createdAt: "2026-03-16T12:00:00.000Z",
        updatedAt: "2026-03-16T12:00:00.000Z",
      });
    } finally {
      catalog.close();
    }

    const firstStore = new SqliteRuntimeAttachmentStore();
    const attachment = createAttachment();
    try {
      await firstStore.upsertRuntimeAttachment(attachment);
    } finally {
      firstStore.close();
    }

    expect(getLoomCatalogPaths().catalogPath).toBe(path.join(root, "catalog.sqlite"));
    expect(existsSync(path.join(root, "attachments.json"))).toBe(false);

    const secondStore = new SqliteRuntimeAttachmentStore();
    try {
      expect(await secondStore.listRuntimeAttachments("worktree-001")).toEqual([attachment]);
      await secondStore.removeRuntimeAttachment(attachment.id);
      expect(await secondStore.listRuntimeAttachments("worktree-001")).toEqual([]);
    } finally {
      secondStore.close();
    }
  });

  it("creates high-value composite indexes idempotently", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "pi-storage-runtime-root-"));
    cleanupPaths.push(root);
    process.env.PI_LOOM_ROOT = root;

    const firstCatalog = new SqliteLoomCatalog();
    firstCatalog.close();
    const secondCatalog = new SqliteLoomCatalog();
    secondCatalog.close();

    const db = new BetterSqlite3(getLoomCatalogPaths().catalogPath, { readonly: true });
    try {
      const indexes = [
        "repositories",
        "worktrees",
        "entities",
        "runtime_attachments",
      ].flatMap((table) =>
        (db.prepare(`PRAGMA index_list('${table}')`).all() as Array<{ name: string }>).map((row) => row.name),
      );

      expect(indexes).toEqual(
        expect.arrayContaining([
          "idx_repositories_space_slug",
          "idx_worktrees_repository_logical_key",
          "idx_entities_space_kind_id",
          "idx_entities_kind_id",
          "idx_runtime_attachments_worktree_id",
        ]),
      );
    } finally {
      db.close();
    }
  });
});
