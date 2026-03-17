import { resolve } from "node:path";
import type { LoomCanonicalStorage, LoomEntityKind, LoomEntityRecord } from "./contract.js";
import { resolveWorkspaceIdentity } from "./repository.js";
import { SqliteLoomCatalog } from "./sqlite.js";

export interface LoomWorkspaceStorage {
  identity: ReturnType<typeof resolveWorkspaceIdentity>;
  storage: SqliteLoomCatalog;
}

const workspaceStorageCache = new Map<string, Promise<LoomWorkspaceStorage>>();

function workspaceStorageCacheKey(cwd: string): string {
  const ledgerRoot = process.env.PI_LOOM_ROOT?.trim() ?? "";
  return `${resolve(cwd)}::${ledgerRoot}`;
}

export async function openWorkspaceStorage(cwd: string): Promise<LoomWorkspaceStorage> {
  const cacheKey = workspaceStorageCacheKey(cwd);
  const existing = workspaceStorageCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const opened = (async () => {
    const storage = new SqliteLoomCatalog();
    const identity = resolveWorkspaceIdentity(cwd);
    await storage.upsertSpace(identity.space);
    await storage.upsertRepository(identity.repository);
    await storage.upsertWorktree(identity.worktree);
    return { identity, storage };
  })();

  workspaceStorageCache.set(cacheKey, opened);
  try {
    return await opened;
  } catch (error) {
    workspaceStorageCache.delete(cacheKey);
    throw error;
  }
}

export async function findEntityByDisplayId(
  storage: LoomCanonicalStorage,
  spaceId: string,
  kind: LoomEntityKind,
  displayId: string,
): Promise<LoomEntityRecord | null> {
  const entities = await storage.listEntities(spaceId, kind);
  return entities.find((entity) => entity.displayId === displayId) ?? null;
}
