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
  spaceId?: string | null;
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

export function openScopedWorkspaceStorageSync(cwd: string, scope?: LoomExplicitScopeInput): LoomWorkspaceStorage {
  const opened = openWorkspaceStorageSync(cwd);
  const scopedIdentity = resolveExplicitScopeIdentity(opened.identity, scope);
  if (scopedIdentity === opened.identity) {
    return opened;
  }
  return {
    storage: opened.storage,
    identity: scopedIdentity,
  };
}

function resolveExplicitScopeIdentity(
  identity: ReturnType<typeof resolveWorkspaceIdentity>,
  scope: LoomExplicitScopeInput | undefined,
): ReturnType<typeof resolveWorkspaceIdentity> {
  const spaceId = scope?.spaceId ?? null;
  const repositoryId = scope?.repositoryId ?? null;
  const worktreeId = scope?.worktreeId ?? null;
  if (!spaceId && !repositoryId && !worktreeId) {
    return identity;
  }

  if (spaceId && spaceId !== identity.space.id) {
    throw new Error(
      `Runtime scope targets space ${spaceId} but active scope is ${identity.space.id}; switch to the correct Loom space before continuing.`,
    );
  }

  const locallyAvailableWorktreeIds = new Set(identity.discovery.candidates.map((candidate) => candidate.worktree.id));

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
  if (worktree && !locallyAvailableWorktreeIds.has(worktree.id)) {
    throw new Error(
      `Worktree ${worktree.id} for repository ${worktree.repositoryId} is canonically present in space ${identity.space.id} but not locally available under ${identity.discovery.scopeRoot}. Reattach the local clone/worktree or select an available repository before repository-bound operations.`,
    );
  }

  const selectedWorktree =
    !identity.activeScope.isAmbiguous && identity.repository?.id === repository.id ? identity.worktree : null;
  const locallyAvailableWorktrees = identity.worktrees.filter(
    (entry) => entry.repositoryId === repository.id && locallyAvailableWorktreeIds.has(entry.id),
  );
  const resolvedWorktree =
    worktree ?? selectedWorktree ?? (locallyAvailableWorktrees.length === 1 ? locallyAvailableWorktrees[0] : null);
  if (!resolvedWorktree) {
    if (locallyAvailableWorktrees.length > 1) {
      throw new Error(
        `Repository ${repository.displayName} [${repository.id}] has multiple locally available worktrees under ${identity.discovery.scopeRoot}; provide an explicit worktreeId or select a worktree before repository-bound operations.`,
      );
    }
    throw new Error(
      `Repository ${repository.displayName} [${repository.id}] is canonically present in space ${identity.space.id} but has no locally available worktree under ${identity.discovery.scopeRoot}. Reattach a local clone/worktree or select an available repository before repository-bound operations.`,
    );
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
  // openWorkspaceStorageSync seeds a synchronous identity, while canonical scope discovery continues in the
  // background via `initialized`. Closing the SQLite handle before that task settles causes late writes against
  // a closed database. Detach the cache entry immediately, but defer the actual close until initialization settles.
  void cached.initialized
    .catch(() => undefined)
    .finally(() => {
      cached.opened.storage.close();
    });
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
