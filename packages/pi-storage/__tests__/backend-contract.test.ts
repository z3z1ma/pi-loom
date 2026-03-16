import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  LoomCanonicalStorage,
  LoomEntityEventRecord,
  LoomEntityLinkRecord,
  LoomEntityRecord,
  LoomProjectionRecord,
  LoomRepositoryRecord,
  LoomSpaceRecord,
  LoomWorktreeRecord,
} from "../storage/contract.js";
import { assertRepoRelativePath } from "../storage/contract.js";
import { ensureLoomCatalogDirs, getLoomCatalogPaths } from "../storage/locations.js";
import { InMemoryLoomCatalog } from "../storage/memory.js";
import { SqliteLoomCatalog } from "../storage/sqlite.js";

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
    logicalPath: "/tmp/repo-core",
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
    pathScopes: [
      {
        repositoryId: repository.id,
        relativePath: assertRepoRelativePath(".loom/tickets/t-1000.md"),
        role: "projection",
      },
    ],
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
  const projection: LoomProjectionRecord = {
    id: "projection-1",
    entityId: entity.id,
    kind: "ticket_markdown_projection",
    materialization: "repo_materialized",
    repositoryId: repository.id,
    relativePath: assertRepoRelativePath(".loom/tickets/t-1000.md"),
    contentHash: null,
    version: 1,
    content: "# Ticket\n\nStorage contract.\n",
    createdAt: space.createdAt,
    updatedAt: space.updatedAt,
  };

  await storage.upsertSpace(space);
  await storage.upsertRepository(repository);
  await storage.upsertWorktree(worktree);
  await storage.upsertEntity(entity);
  await storage.upsertLink(link);
  await storage.appendEvent(event);
  await storage.upsertProjection(projection);

  expect(await storage.getSpace(space.id)).toMatchObject(space);
  expect(await storage.listRepositories(space.id)).toEqual([expect.objectContaining({ id: repository.id })]);
  expect(await storage.listWorktrees(repository.id)).toEqual([expect.objectContaining({ id: worktree.id })]);
  expect(await storage.getEntity(entity.id)).toMatchObject({ displayId: "t-1000", version: 1 });
  expect(await storage.listEntities(space.id, "ticket")).toEqual([expect.objectContaining({ id: entity.id })]);
  expect(await storage.listLinks(entity.id)).toEqual([expect.objectContaining({ id: link.id })]);
  expect(await storage.listEvents(entity.id)).toEqual([expect.objectContaining({ id: event.id })]);
  expect(await storage.listProjections(entity.id)).toEqual([
    expect.objectContaining({ id: projection.id, content: "# Ticket\n\nStorage contract.\n" }),
  ]);
}

describe("pi-storage backend contract", () => {
  const cleanupPaths: string[] = [];

  afterEach(() => {
    for (const cleanupPath of cleanupPaths.splice(0)) {
      rmSync(cleanupPath, { recursive: true, force: true });
    }
    delete process.env.PI_LOOM_ROOT;
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
