import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LoomRuntimeAttachment } from "../storage/contract.js";
import { createSeededGitWorkspace } from "./helpers/git-fixture.js";
import { createEntityId, createLinkId, createRepositoryId } from "../storage/ids.js";
import { ensureLoomCatalogDirs, getLoomCatalogPaths } from "../storage/locations.js";
import { resolveWorkspaceIdentity } from "../storage/repository.js";
import { SqliteLoomCatalog } from "../storage/sqlite.js";
import { exportSyncBundle, hydrateSyncBundle } from "../storage/sync.js";

function createWorkspace(): { cwd: string; cleanup: () => void } {
  return createSeededGitWorkspace({
    prefix: "pi-storage-workspace-",
    packageName: "pi-loom-fixture",
    remoteUrl: "git@github.com:example/pi-loom.git",
    piLoomRoot: false,
  });
}

async function seedCanonicalCatalog(
  cwd: string,
  catalog: SqliteLoomCatalog,
): Promise<{ entityIds: string[]; runtimeAttachment: LoomRuntimeAttachment }> {
  const identity = resolveWorkspaceIdentity(cwd);
  const timestamps = {
    createdAt: identity.space.createdAt,
    updatedAt: identity.space.updatedAt,
  };

  await catalog.upsertSpace(identity.space);
  await catalog.upsertRepository(identity.repository);
  await catalog.upsertWorktree(identity.worktree);

  const constitutionId = createEntityId("constitution", identity.space.id, "constitution", "constitution");
  const ticketId = createEntityId("ticket", identity.space.id, "t-9001", "t-9001");
  const initiativeId = createEntityId("initiative", identity.space.id, "storage-migration", "storage-migration");

  await catalog.upsertEntity({
    id: constitutionId,
    kind: "constitution",
    spaceId: identity.space.id,
    owningRepositoryId: identity.repository.id,
    displayId: "constitution",
    title: "Constitution",
    summary: "Constitution brief.",
    status: "active",
    version: 1,
    tags: ["constitution"],
    attributes: {},
    ...timestamps,
  });
  await catalog.upsertEntity({
    id: initiativeId,
    kind: "initiative",
    spaceId: identity.space.id,
    owningRepositoryId: identity.repository.id,
    displayId: "storage-migration",
    title: "Storage Migration",
    summary: "Canonical initiative record.",
    status: "active",
    version: 1,
    tags: ["initiative"],
    attributes: {},
    ...timestamps,
  });
  await catalog.upsertEntity({
    id: ticketId,
    kind: "ticket",
    spaceId: identity.space.id,
    owningRepositoryId: identity.repository.id,
    displayId: "t-9001",
    title: "Migrate storage",
    summary: "SQLite-only ticket.",
    status: "open",
    version: 1,
    tags: ["ticket"],
    attributes: {},
    ...timestamps,
  });

  await catalog.upsertLink({
    id: createLinkId("belongs_to", ticketId, initiativeId),
    kind: "belongs_to",
    fromEntityId: ticketId,
    toEntityId: initiativeId,
    metadata: {},
    ...timestamps,
  });
  await catalog.appendEvent({
    id: "event-ticket-created",
    entityId: ticketId,
    kind: "created",
    sequence: 1,
    createdAt: timestamps.createdAt,
    actor: "test",
    payload: { status: "open" },
  });

  const runtimeAttachment: LoomRuntimeAttachment = {
    id: "runtime-worker-1",
    worktreeId: identity.worktree.id,
    kind: "worker_runtime",
    locator: "worker-runtime:runtime-worker",
    processId: 1001,
    leaseExpiresAt: "2026-03-16T00:05:00.000Z",
    metadata: { workerId: "runtime-worker" },
    ...timestamps,
  };
  await catalog.upsertRuntimeAttachment(runtimeAttachment);

  return { entityIds: [constitutionId, initiativeId, ticketId], runtimeAttachment };
}

describe("pi-storage sqlite catalog backup flow", () => {
  const cleanupPaths: string[] = [];

  afterEach(() => {
    for (const cleanupPath of cleanupPaths.splice(0)) {
      rmSync(cleanupPath, { recursive: true, force: true });
    }
    delete process.env.PI_LOOM_ROOT;
  });

  it("creates stable repository and entity identifiers", () => {
    const repoIdA = createRepositoryId(["git@github.com:example/pi-loom.git"], "fallback");
    const repoIdB = createRepositoryId(["git@github.com:example/pi-loom.git"], "different-fallback");
    const entityIdA = createEntityId("ticket", "space_core", "t-0045", "ticket:t-0045");
    const entityIdB = createEntityId("ticket", "space_core", "t-0045", "ticket:t-0045");

    expect(repoIdA).toBe(repoIdB);
    expect(entityIdA).toBe(entityIdB);
  });

  it("resolves repository identity independent of checkout location when a remote exists", () => {
    const { cwd, cleanup } = createWorkspace();
    cleanupPaths.push(cwd);
    try {
      const identity = resolveWorkspaceIdentity(cwd);
      expect(identity.repository.remoteUrls).toEqual(["git@github.com:example/pi-loom.git"]);
      expect(identity.repository.id).toContain("repo_");
      expect(identity.worktree.repositoryId).toBe(identity.repository.id);
      expect(identity.space.repositoryIds).toEqual([identity.repository.id]);
      expect(identity.worktree.logicalKey.startsWith("worktree:")).toBe(true);
      expect(identity.worktree.logicalKey.startsWith("/")).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("exports sqlite-backed state into an explicit backup bundle without materializing workspace files", async () => {
    const { cwd, cleanup } = createWorkspace();
    cleanupPaths.push(cwd);
    const catalogRoot = mkdtempSync(path.join(tmpdir(), "pi-storage-catalog-"));
    cleanupPaths.push(catalogRoot);
    process.env.PI_LOOM_ROOT = catalogRoot;
    ensureLoomCatalogDirs(getLoomCatalogPaths());

    const sourceCatalog = new SqliteLoomCatalog();
    try {
      const seeded = await seedCanonicalCatalog(cwd, sourceCatalog);
      const bundleDir = mkdtempSync(path.join(tmpdir(), "pi-storage-catalog-bundle-"));
      cleanupPaths.push(bundleDir);
      const exported = await exportSyncBundle(cwd, sourceCatalog, bundleDir);

      expect(exported.files).toEqual(
        expect.arrayContaining([
          "bundle.json",
          "spaces.json",
          "repositories.json",
          "worktrees.json",
          "entities.json",
          "links.json",
          "events.json",
          "runtime-attachments.json",
        ]),
      );
      expect(JSON.parse(readFileSync(path.join(bundleDir, "bundle.json"), "utf-8"))).toMatchObject({
        repositoryId: exported.bundle.repositoryId,
        spaceId: exported.bundle.spaceId,
      });

      const targetCatalogRoot = mkdtempSync(path.join(tmpdir(), "pi-storage-catalog-target-"));
      cleanupPaths.push(targetCatalogRoot);
      process.env.PI_LOOM_ROOT = targetCatalogRoot;
      ensureLoomCatalogDirs(getLoomCatalogPaths());
      const targetCatalog = new SqliteLoomCatalog();
      try {
        const hydrated = await hydrateSyncBundle(targetCatalog, bundleDir);
        expect(hydrated.hydratedEntityIds).toEqual(seeded.entityIds.slice().sort((left, right) => left.localeCompare(right)));
        expect(await targetCatalog.listRuntimeAttachments(seeded.runtimeAttachment.worktreeId)).toEqual([
          seeded.runtimeAttachment,
        ]);
        const ticketEntity = (await targetCatalog.listEntities()).find((entity) => entity.displayId === "t-9001");
        expect(ticketEntity).toMatchObject({ title: "Migrate storage", status: "open" });
        expect(await targetCatalog.listLinks(ticketEntity?.id ?? "missing")).toEqual([
          expect.objectContaining({ kind: "belongs_to" }),
        ]);
      } finally {
        targetCatalog.close();
      }
    } finally {
      sourceCatalog.close();
      cleanup();
    }
  });
});
