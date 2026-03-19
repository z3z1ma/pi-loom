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

  await storage.removeLink(link.id);
  expect(await storage.listLinks(entity.id)).toEqual([]);

  await storage.removeRuntimeAttachment(runtimeAttachment.id);
  expect(await storage.listRuntimeAttachments(worktree.id)).toEqual([]);
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
  }
});
