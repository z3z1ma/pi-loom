import { resolve } from "node:path";
import type { LoomCanonicalStorage, LoomEntityKind, LoomEntityRecord } from "./contract.js";
import { requireResolvedRepositoryIdentity, resolveWorkspaceIdentity } from "./repository.js";
import { discoverWorkspaceScope } from "./scope.js";
import { SqliteLoomCatalog } from "./sqlite.js";

export interface LoomWorkspaceStorage {
  identity: ReturnType<typeof resolveWorkspaceIdentity>;
  storage: SqliteLoomCatalog;
}

export interface LoomExplicitScopeInput {
  repositoryId?: string | null;
  worktreeId?: string | null;
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

function resolveExplicitScopeIdentity(
  identity: ReturnType<typeof resolveWorkspaceIdentity>,
  scope: LoomExplicitScopeInput | undefined,
): ReturnType<typeof resolveWorkspaceIdentity> {
  const repositoryId = scope?.repositoryId ?? null;
  const worktreeId = scope?.worktreeId ?? null;
  if (!repositoryId && !worktreeId) {
    return identity;
  }

  const worktree = worktreeId ? (identity.worktrees.find((entry) => entry.id === worktreeId) ?? null) : null;
  if (worktreeId && !worktree) {
    throw new Error(`Unknown worktree ${worktreeId} for active scope ${identity.space.id}.`);
  }

  const repository = repositoryId
    ? (identity.repositories.find((entry) => entry.id === repositoryId) ?? null)
    : worktree
      ? (identity.repositories.find((entry) => entry.id === worktree.repositoryId) ?? null)
      : null;
  if (!repository) {
    const label = repositoryId ?? worktreeId ?? "(none)";
    throw new Error(`Unknown repository scope ${label} for active scope ${identity.space.id}.`);
  }
  if (worktree && worktree.repositoryId !== repository.id) {
    throw new Error(`Worktree ${worktree.id} does not belong to repository ${repository.id}.`);
  }

  const resolvedWorktree = worktree ?? identity.worktrees.find((entry) => entry.repositoryId === repository.id) ?? null;
  if (!resolvedWorktree) {
    throw new Error(`Repository ${repository.id} has no worktree in active scope ${identity.space.id}.`);
  }

  return {
    ...identity,
    repository,
    worktree: resolvedWorktree,
    activeScope: {
      ...identity.activeScope,
      repositoryId: repository.id,
      worktreeId: resolvedWorktree.id,
      bindingSource: "selection",
      isAmbiguous: false,
    },
  };
}

export async function openScopedWorkspaceStorage(
  cwd: string,
  scope?: LoomExplicitScopeInput,
): Promise<LoomWorkspaceStorage> {
  const opened = await openWorkspaceStorage(cwd);
  const scopedIdentity = resolveExplicitScopeIdentity(opened.identity, scope);
  if (scopedIdentity === opened.identity) {
    return opened;
  }
  return {
    storage: opened.storage,
    identity: scopedIdentity,
  };
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
  const syncIdentity = resolveWorkspaceIdentity(cwd);
  const opened = { identity: syncIdentity, storage };
  const initialized = Promise.all([
    storage.upsertSpace(syncIdentity.space),
    ...syncIdentity.repositories.map((repository) => storage.upsertRepository(repository)),
    ...syncIdentity.worktrees.map((worktree) => storage.upsertWorktree(worktree)),
  ])
    .then(async () => {
      const { identity } = await discoverWorkspaceScope(cwd, storage);
      opened.identity = identity;
      return opened;
    })
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

export async function openRepositoryWorkspaceStorage(
  cwd: string,
  scope?: LoomExplicitScopeInput,
): Promise<{
  identity: ReturnType<typeof requireResolvedRepositoryIdentity>;
  storage: SqliteLoomCatalog;
}> {
  const opened = await openScopedWorkspaceStorage(cwd, scope);
  return {
    ...opened,
    identity: requireResolvedRepositoryIdentity(opened.identity),
  };
}
