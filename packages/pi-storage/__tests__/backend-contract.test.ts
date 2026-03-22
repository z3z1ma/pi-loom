import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  LoomCanonicalStorage,
  LoomEntityEventRecord,
  LoomEntityLinkRecord,
  LoomEntityRecord,
  LoomRepositoryRecord,
  LoomRuntimeAttachment,
  LoomSpaceRecord,
  LoomWorktreeRecord,
} from "../storage/contract.js";
import { upsertEntityByDisplayIdWithLifecycleEvents } from "../storage/entities.js";
import { ensureLoomCatalogDirs, getLoomCatalogPaths } from "../storage/locations.js";
import { InMemoryLoomCatalog } from "../storage/memory.js";
import { SqliteLoomCatalog, toSqliteNamedParams } from "../storage/sqlite.js";

type StorageFactory = () => { storage: LoomCanonicalStorage; close: () => void };

async function exerciseContract(storage: LoomCanonicalStorage): Promise<void> {
  const space: LoomSpaceRecord = {
    id: "space-core",
    slug: "core",
    title: "Core",
    description: "Core space",
    repositoryIds: ["repo-core"],
    createdAt: "2026-03-16T00:00:00.000Z",
    updatedAt: "2026-03-16T00:00:00.000Z",
  };
  const repository: LoomRepositoryRecord = {
    id: "repo-core",
    spaceId: space.id,
    slug: "repo-core",
    displayName: "Repo Core",
    defaultBranch: "main",
    remoteUrls: ["git@github.com:example/repo-core.git"],
    createdAt: space.createdAt,
    updatedAt: space.updatedAt,
  };
  const worktree: LoomWorktreeRecord = {
    id: "worktree-main",
    repositoryId: repository.id,
    branch: "main",
    baseRef: "main",
    logicalKey: "worktree:repo-core:main",
    status: "attached",
    createdAt: space.createdAt,
    updatedAt: space.updatedAt,
  };
  const entity: LoomEntityRecord = {
    id: "ticket-1",
    kind: "ticket",
    spaceId: space.id,
    owningRepositoryId: repository.id,
    displayId: "t-1000",
    title: "Storage contract",
    summary: "Verify backend-neutral behavior",
    status: "open",
    version: 1,
    tags: ["storage"],
    attributes: { source: "test" },
    createdAt: space.createdAt,
    updatedAt: space.updatedAt,
  };
  const link: LoomEntityLinkRecord = {
    id: "link-1",
    kind: "references",
    fromEntityId: entity.id,
    toEntityId: entity.id,
    metadata: { note: "self-link for test" },
    createdAt: space.createdAt,
    updatedAt: space.updatedAt,
  };
  const event: LoomEntityEventRecord = {
    id: "event-1",
    entityId: entity.id,
    kind: "created",
    sequence: 1,
    createdAt: space.createdAt,
    actor: "test",
    payload: { status: "open" },
  };
  const runtimeAttachment: LoomRuntimeAttachment = {
    id: "runtime-1",
    worktreeId: worktree.id,
    kind: "worker_runtime",
    locator: "worker-runtime:t-1000",
    processId: 4321,
    leaseExpiresAt: "2026-03-16T00:05:00.000Z",
    metadata: { workerId: "worker-1" },
    createdAt: space.createdAt,
    updatedAt: space.updatedAt,
  };

  await storage.upsertSpace(space);
  await storage.upsertRepository(repository);
  await storage.upsertWorktree(worktree);
  await storage.upsertEntity(entity);
  await storage.upsertLink(link);
  await storage.appendEvent(event);
  await storage.upsertRuntimeAttachment(runtimeAttachment);

  expect(await storage.getSpace(space.id)).toMatchObject(space);
  expect(await storage.listRepositories(space.id)).toEqual([expect.objectContaining({ id: repository.id })]);
  expect(await storage.listWorktrees(repository.id)).toEqual([expect.objectContaining({ id: worktree.id })]);
  expect(await storage.getEntity(entity.id)).toMatchObject({ displayId: "t-1000", version: 1 });
  expect(await storage.listEntities(space.id, "ticket")).toEqual([expect.objectContaining({ id: entity.id })]);
  expect(await storage.listLinks(entity.id)).toEqual([expect.objectContaining({ id: link.id })]);
  expect(await storage.listEvents(entity.id)).toEqual([expect.objectContaining({ id: event.id })]);
  expect(await storage.listRuntimeAttachments(worktree.id)).toEqual([
    expect.objectContaining({ id: runtimeAttachment.id, processId: 4321 }),
  ]);

  await expect(
    storage.upsertEntity({
      ...entity,
      id: "ticket-2",
    }),
  ).rejects.toThrow(/Duplicate display id|UNIQUE constraint failed/);

  await storage.removeLink(link.id);
  expect(await storage.listLinks(entity.id)).toEqual([]);

  await storage.removeEntity(entity.id);
  expect(await storage.getEntity(entity.id)).toBeNull();
  expect(await storage.listEvents(entity.id)).toEqual([]);

  await storage.removeRuntimeAttachment(runtimeAttachment.id);
  expect(await storage.listRuntimeAttachments(worktree.id)).toEqual([]);
}

async function seedConcurrencyWorkspace(storage: LoomCanonicalStorage): Promise<void> {
  const timestamps = {
    createdAt: "2026-03-21T00:00:00.000Z",
    updatedAt: "2026-03-21T00:00:00.000Z",
  };

  const space: LoomSpaceRecord = {
    id: "space-concurrency",
    slug: "concurrency",
    title: "Concurrency",
    description: "Concurrency test space",
    repositoryIds: ["repo-concurrency"],
    ...timestamps,
  };
  const repository: LoomRepositoryRecord = {
    id: "repo-concurrency",
    spaceId: space.id,
    slug: "repo-concurrency",
    displayName: "Repo Concurrency",
    defaultBranch: "main",
    remoteUrls: ["git@github.com:example/repo-concurrency.git"],
    ...timestamps,
  };
  const worktree: LoomWorktreeRecord = {
    id: "worktree-concurrency",
    repositoryId: repository.id,
    branch: "main",
    baseRef: "main",
    logicalKey: "worktree:repo-concurrency:main",
    status: "attached",
    ...timestamps,
  };

  await storage.upsertSpace(space);
  await storage.upsertRepository(repository);
  await storage.upsertWorktree(worktree);
}

async function exerciseHelperConcurrency(storage: LoomCanonicalStorage): Promise<void> {
  await seedConcurrencyWorkspace(storage);

  const base = {
    kind: "ticket" as const,
    spaceId: "space-concurrency",
    owningRepositoryId: "repo-concurrency",
    displayId: "t-9001",
    tags: ["concurrency"],
    createdAt: "2026-03-21T00:00:00.000Z",
  };

  const created = await upsertEntityByDisplayIdWithLifecycleEvents(
    storage,
    {
      ...base,
      title: "Initial",
      summary: "Initial summary",
      status: "open",
      version: 1,
      attributes: { revision: 1 },
      updatedAt: "2026-03-21T00:00:00.000Z",
    },
    { actor: "backend-contract" },
  );

  const firstUpdate = upsertEntityByDisplayIdWithLifecycleEvents(
    storage,
    {
      ...base,
      title: "First writer",
      summary: "First concurrent write",
      status: "open",
      version: 2,
      attributes: { revision: 2, writer: "first" },
      updatedAt: "2026-03-21T00:01:00.000Z",
    },
    { actor: "backend-contract" },
  );
  const secondUpdate = upsertEntityByDisplayIdWithLifecycleEvents(
    storage,
    {
      ...base,
      title: "Second writer",
      summary: "Second concurrent write",
      status: "open",
      version: 2,
      attributes: { revision: 2, writer: "second" },
      updatedAt: "2026-03-21T00:01:01.000Z",
    },
    { actor: "backend-contract" },
  );

  const settled = await Promise.allSettled([firstUpdate, secondUpdate]);
  const fulfilled = settled.filter((result) => result.status === "fulfilled");
  const rejected = settled.filter((result) => result.status === "rejected");

  expect(fulfilled).toHaveLength(1);
  expect(rejected).toHaveLength(1);
  expect(rejected[0]?.reason).toBeInstanceOf(Error);
  expect((rejected[0]?.reason as Error).message).toMatch(/Stale .* write|current version is/i);
  expect((rejected[0]?.reason as Error).message).not.toMatch(/events\.id|UNIQUE constraint failed: events\.id/i);

  const entity = await storage.getEntity(created.entity.id);
  expect(entity).toMatchObject({ id: created.entity.id, version: 2 });

  const events = await storage.listEvents(created.entity.id);
  expect(events).toHaveLength(2);
  expect(events.map((event) => event.sequence)).toEqual([1, 2]);
  expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
}

function concurrencyTicket(id: string, displayId: string): LoomEntityRecord {
  return {
    id,
    kind: "ticket",
    spaceId: "space-concurrency",
    owningRepositoryId: "repo-concurrency",
    displayId,
    title: displayId,
    summary: `Ticket ${displayId}`,
    status: "open",
    version: 1,
    tags: ["concurrency"],
    attributes: {},
    createdAt: "2026-03-21T00:00:00.000Z",
    updatedAt: "2026-03-21T00:00:00.000Z",
  };
}

describe("pi-storage backend contract", () => {
  const cleanupPaths: string[] = [];

  afterEach(() => {
    for (const cleanupPath of cleanupPaths.splice(0)) {
      rmSync(cleanupPath, { recursive: true, force: true });
    }
    delete process.env.PI_LOOM_ROOT;
  });

  it("prefixes sqlite named bind keys without dropping null-valued fields", () => {
    expect(
      toSqliteNamedParams({
        slug: "core",
        default_branch: null,
        display_id: null,
        repository_id: null,
        content: null,
      }),
    ).toEqual({
      slug: "core",
      "@slug": "core",
      ":slug": "core",
      $slug: "core",
      default_branch: null,
      "@default_branch": null,
      ":default_branch": null,
      $default_branch: null,
      display_id: null,
      "@display_id": null,
      ":display_id": null,
      $display_id: null,
      repository_id: null,
      "@repository_id": null,
      ":repository_id": null,
      $repository_id: null,
      content: null,
      "@content": null,
      ":content": null,
      $content: null,
    });
    expect(toSqliteNamedParams({ "@id": "space-1", $title: "Core" })).toEqual({
      id: "space-1",
      "@id": "space-1",
      ":id": "space-1",
      $id: "space-1",
      title: "Core",
      "@title": "Core",
      ":title": "Core",
      $title: "Core",
    });
  });

  const factories: Record<string, StorageFactory> = {
    memory: () => ({ storage: new InMemoryLoomCatalog(), close: () => undefined }),
    sqlite: () => {
      const root = mkdtempSync(path.join(tmpdir(), "pi-storage-backend-"));
      cleanupPaths.push(root);
      process.env.PI_LOOM_ROOT = root;
      ensureLoomCatalogDirs(getLoomCatalogPaths());
      const storage = new SqliteLoomCatalog();
      return { storage, close: () => storage.close() };
    },
  };

  for (const [backendName, createStorage] of Object.entries(factories)) {
    it(`supports the shared storage contract on ${backendName}`, async () => {
      const { storage, close } = createStorage();
      try {
        await exerciseContract(storage);
      } finally {
        close();
      }
    });

    it(`rejects stale helper writes without event id collisions on ${backendName}`, async () => {
      const { storage, close } = createStorage();
      try {
        await exerciseHelperConcurrency(storage);
      } finally {
        close();
      }
    });
  }

  it("serializes overlapping sqlite transactions and hides uncommitted writes from parallel callers", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "pi-storage-concurrency-"));
    cleanupPaths.push(root);
    process.env.PI_LOOM_ROOT = root;
    ensureLoomCatalogDirs(getLoomCatalogPaths());

    const storage = new SqliteLoomCatalog();
    try {
      await seedConcurrencyWorkspace(storage);

      let releaseOuter: () => void = () => {};
      const outerHeld = new Promise<void>((resolve) => {
        releaseOuter = resolve;
      });
      let markOuterStarted: () => void = () => {};
      const outerStarted = new Promise<void>((resolve) => {
        markOuterStarted = resolve;
      });

      const first = storage.transact(async (tx) => {
        await tx.upsertEntity(concurrencyTicket("ticket-1", "t-1001"));
        markOuterStarted();
        await outerHeld;
      });

      await outerStarted;

      let secondSettled = false;
      const second = storage
        .transact(async (tx) => {
          await tx.upsertEntity(concurrencyTicket("ticket-2", "t-1002"));
        })
        .then(() => {
          secondSettled = true;
        });

      let readSettled = false;
      const readDuringWrite = storage.getEntity("ticket-1").then((entity) => {
        readSettled = true;
        return entity;
      });

      await Promise.resolve();
      await Promise.resolve();

      expect(secondSettled).toBe(false);
      expect(readSettled).toBe(false);

      releaseOuter();
      await first;
      await second;

      await expect(readDuringWrite).resolves.toMatchObject({ id: "ticket-1", displayId: "t-1001" });
      await expect(storage.getEntity("ticket-2")).resolves.toMatchObject({ id: "ticket-2", displayId: "t-1002" });
    } finally {
      storage.close();
    }
  });

  it("supports nested sqlite transactions with savepoint rollback", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "pi-storage-nested-"));
    cleanupPaths.push(root);
    process.env.PI_LOOM_ROOT = root;
    ensureLoomCatalogDirs(getLoomCatalogPaths());

    const storage = new SqliteLoomCatalog();
    try {
      await seedConcurrencyWorkspace(storage);

      await storage.transact(async (tx) => {
        await tx.upsertEntity(concurrencyTicket("ticket-outer", "t-2001"));

        await expect(
          tx.transact(async (nested) => {
            await nested.upsertEntity(concurrencyTicket("ticket-inner", "t-2002"));
            throw new Error("nested failure");
          }),
        ).rejects.toThrow("nested failure");

        await tx.upsertEntity(concurrencyTicket("ticket-after", "t-2003"));
      });

      await expect(storage.getEntity("ticket-outer")).resolves.toMatchObject({ displayId: "t-2001" });
      await expect(storage.getEntity("ticket-after")).resolves.toMatchObject({ displayId: "t-2003" });
      await expect(storage.getEntity("ticket-inner")).resolves.toBeNull();
    } finally {
      storage.close();
    }
  });
});
