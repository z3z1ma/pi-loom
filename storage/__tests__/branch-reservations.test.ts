import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { reserveBranchFamilyName, updateBranchReservationStatus } from "../branch-reservations.js";
import type { LoomCanonicalStorage, LoomRepositoryRecord, LoomSpaceRecord } from "../contract.js";
import { ensureLoomCatalogDirs, getLoomCatalogPaths } from "../locations.js";
import { InMemoryLoomCatalog } from "../memory.js";
import { SqliteLoomCatalog } from "../sqlite.js";

type StorageFactory = () => { storage: LoomCanonicalStorage; close: () => void };

async function seedRepository(storage: LoomCanonicalStorage, repositoryId: string): Promise<void> {
  const timestamp = "2026-03-25T00:00:00.000Z";
  const space: LoomSpaceRecord = {
    id: `space-${repositoryId}`,
    slug: `space-${repositoryId}`,
    title: `Space ${repositoryId}`,
    description: `Space for ${repositoryId}`,
    repositoryIds: [repositoryId],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const repository: LoomRepositoryRecord = {
    id: repositoryId,
    spaceId: space.id,
    slug: repositoryId,
    displayName: repositoryId,
    defaultBranch: "main",
    remoteUrls: [`git@example.com:${repositoryId}.git`],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await storage.upsertSpace(space);
  await storage.upsertRepository(repository);
}

describe("branch reservation helper", () => {
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
      const root = mkdtempSync(path.join(tmpdir(), "pi-storage-branch-reservations-"));
      cleanupPaths.push(root);
      process.env.PI_LOOM_ROOT = root;
      ensureLoomCatalogDirs(getLoomCatalogPaths());
      const storage = new SqliteLoomCatalog();
      return { storage, close: () => storage.close() };
    },
  };

  for (const [backendName, createStorage] of Object.entries(factories)) {
    it(`allocates branch names canonically per repository on ${backendName}`, async () => {
      const { storage, close } = createStorage();
      try {
        await seedRepository(storage, "repo-a");
        await seedRepository(storage, "repo-b");

        const firstRepoA = await reserveBranchFamilyName(storage, {
          repositoryId: "repo-a",
          branchFamily: "UDP-100",
          ownerKey: "ticket:one",
          timestamp: "2026-03-25T00:00:00.000Z",
        });
        const secondRepoA = await reserveBranchFamilyName(storage, {
          repositoryId: "repo-a",
          branchFamily: "UDP-100",
          ownerKey: "ticket:two",
          timestamp: "2026-03-25T00:01:00.000Z",
        });
        const firstRepoB = await reserveBranchFamilyName(storage, {
          repositoryId: "repo-b",
          branchFamily: "UDP-100",
          ownerKey: "ticket:three",
          timestamp: "2026-03-25T00:02:00.000Z",
        });

        expect(firstRepoA.branchName).toBe("UDP-100");
        expect(secondRepoA.branchName).toBe("UDP-100-1");
        expect(firstRepoB.branchName).toBe("UDP-100");
      } finally {
        close();
      }
    });

    it(`reuses the same reservation for the same owner on ${backendName}`, async () => {
      const { storage, close } = createStorage();
      try {
        await seedRepository(storage, "repo-a");

        const first = await reserveBranchFamilyName(storage, {
          repositoryId: "repo-a",
          branchFamily: "UDP-100",
          ownerKey: "ticket:one",
          timestamp: "2026-03-25T00:00:00.000Z",
        });
        const second = await reserveBranchFamilyName(storage, {
          repositoryId: "repo-a",
          branchFamily: "UDP-100",
          ownerKey: "ticket:one",
          timestamp: "2026-03-25T00:01:00.000Z",
        });

        expect(second.id).toBe(first.id);
        expect(second.branchName).toBe("UDP-100");
        expect(await storage.listBranchReservations("repo-a")).toHaveLength(1);
      } finally {
        close();
      }
    });

    it(`keeps branch history after status transitions on ${backendName}`, async () => {
      const { storage, close } = createStorage();
      try {
        await seedRepository(storage, "repo-a");

        const first = await reserveBranchFamilyName(storage, {
          repositoryId: "repo-a",
          branchFamily: "UDP-100",
          ownerKey: "ticket:one",
          timestamp: "2026-03-25T00:00:00.000Z",
        });
        await updateBranchReservationStatus(storage, {
          reservationId: first.id,
          status: "retired",
          timestamp: "2026-03-25T00:01:00.000Z",
        });
        const followUp = await reserveBranchFamilyName(storage, {
          repositoryId: "repo-a",
          branchFamily: "UDP-100",
          ownerKey: "ticket:two",
          timestamp: "2026-03-25T00:02:00.000Z",
        });

        expect(followUp.branchName).toBe("UDP-100-1");
        expect((await storage.getBranchReservation(first.id))?.status).toBe("retired");
      } finally {
        close();
      }
    });
  }
});
