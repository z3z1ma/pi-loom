import { importWorkspaceSnapshot } from "./catalog.js";
import type { LoomCanonicalStorage, LoomEntityKind, LoomEntityRecord } from "./contract.js";
import { resolveWorkspaceIdentity } from "./repository.js";
import { SqliteLoomCatalog } from "./sqlite.js";

export interface LoomWorkspaceStorage {
  identity: ReturnType<typeof resolveWorkspaceIdentity>;
  storage: SqliteLoomCatalog;
}

export async function openWorkspaceStorage(cwd: string): Promise<LoomWorkspaceStorage> {
  const storage = new SqliteLoomCatalog();
  const identity = resolveWorkspaceIdentity(cwd);
  await storage.upsertSpace(identity.space);
  await storage.upsertRepository(identity.repository);
  await storage.upsertWorktree(identity.worktree);
  return { identity, storage };
}

export async function bootstrapWorkspaceStorage(cwd: string): Promise<LoomWorkspaceStorage> {
  const opened = await openWorkspaceStorage(cwd);
  await importWorkspaceSnapshot(cwd, opened.storage);
  return opened;
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

export async function findOrBootstrapEntityByDisplayId(
  cwd: string,
  storage: LoomCanonicalStorage,
  spaceId: string,
  kind: LoomEntityKind,
  displayId: string,
): Promise<LoomEntityRecord | null> {
  const existing = await findEntityByDisplayId(storage, spaceId, kind, displayId);
  if (existing) {
    return existing;
  }
  await importWorkspaceSnapshot(cwd, storage);
  return findEntityByDisplayId(storage, spaceId, kind, displayId);
}
