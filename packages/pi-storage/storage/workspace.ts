import { resolve } from "node:path";
import type { LoomCanonicalStorage, LoomEntityKind, LoomEntityRecord } from "./contract.js";
import { resolveWorkspaceIdentity } from "./repository.js";
import { SqliteLoomCatalog } from "./sqlite.js";

export interface LoomWorkspaceStorage {
  identity: ReturnType<typeof resolveWorkspaceIdentity>;
  storage: SqliteLoomCatalog;
}

interface CachedWorkspaceStorage {
  opened: LoomWorkspaceStorage;
  initialized: Promise<LoomWorkspaceStorage>;
}

const workspaceStorageCache = new Map<string, CachedWorkspaceStorage>();

function workspaceStorageCacheKey(cwd: string): string {
  const ledgerRoot = process.env.PI_LOOM_ROOT?.trim() ?? "";
  return `${resolve(cwd)}::${ledgerRoot}`;
}

export async function openWorkspaceStorage(cwd: string): Promise<LoomWorkspaceStorage> {
  const cacheKey = workspaceStorageCacheKey(cwd);
  const cached = getOrCreateWorkspaceStorage(cwd, cacheKey);
  try {
    return await cached.initialized;
  } catch (error) {
    workspaceStorageCache.delete(cacheKey);
    throw error;
  }
}

export function openWorkspaceStorageSync(cwd: string): LoomWorkspaceStorage {
  return getOrCreateWorkspaceStorage(cwd, workspaceStorageCacheKey(cwd)).opened;
}

export function closeWorkspaceStorage(cwd: string): void {
  closeWorkspaceStorageByKey(workspaceStorageCacheKey(cwd));
}

export function closeAllWorkspaceStorage(): void {
  for (const cacheKey of [...workspaceStorageCache.keys()]) {
    closeWorkspaceStorageByKey(cacheKey);
  }
}

function closeWorkspaceStorageByKey(cacheKey: string): void {
  const cached = workspaceStorageCache.get(cacheKey);
  if (!cached) {
    return;
  }
  workspaceStorageCache.delete(cacheKey);
  cached.opened.storage.close();
}

function getOrCreateWorkspaceStorage(cwd: string, cacheKey: string): CachedWorkspaceStorage {
  const existing = workspaceStorageCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const storage = new SqliteLoomCatalog();
  const identity = resolveWorkspaceIdentity(cwd);
  const opened = { identity, storage };
  const initialized = Promise.all([
    storage.upsertSpace(identity.space),
    ...identity.repositories.map((repository) => storage.upsertRepository(repository)),
    ...identity.worktrees.map((worktree) => storage.upsertWorktree(worktree)),
  ])
    .then(() => opened)
    .catch((error) => {
      closeWorkspaceStorageByKey(cacheKey);
      throw error;
    });
  const cached = { opened, initialized };
  workspaceStorageCache.set(cacheKey, cached);
  return cached;
}

export async function findEntityByDisplayId(
  storage: LoomCanonicalStorage,
  spaceId: string,
  kind: LoomEntityKind,
  displayId: string,
): Promise<LoomEntityRecord | null> {
  return storage.getEntityByDisplayId(spaceId, kind, displayId);
}
