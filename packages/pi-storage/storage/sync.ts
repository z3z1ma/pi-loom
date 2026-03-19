import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  LoomCanonicalStorage,
  LoomEntityEventRecord,
  LoomEntityLinkRecord,
  LoomEntityRecord,
  LoomRepositoryRecord,
  LoomRuntimeAttachment,
  LoomSpaceRecord,
  LoomWorktreeRecord,
} from "./contract.js";
import { LOOM_STORAGE_CONTRACT_VERSION } from "./contract.js";
import { resolveWorkspaceIdentity } from "./repository.js";

export interface LoomSyncBundle {
  contractVersion: typeof LOOM_STORAGE_CONTRACT_VERSION;
  exportedAt: string;
  spaceId: string;
  repositoryId: string;
}

function ensureDir(dirPath: string): void {
  mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

function serializeComparable(value: unknown): string {
  return JSON.stringify(value);
}

function conflictError(kind: string, id: string): Error {
  return new Error(`Sync conflict detected for ${kind} ${id}`);
}

async function assertEntityCompatible(storage: LoomCanonicalStorage, incoming: LoomEntityRecord): Promise<void> {
  const existing = await storage.getEntity(incoming.id);
  if (!existing) {
    return;
  }
  if (existing.version > incoming.version) {
    throw conflictError("entity", incoming.id);
  }
  if (existing.version === incoming.version && serializeComparable(existing) !== serializeComparable(incoming)) {
    throw conflictError("entity", incoming.id);
  }
}

async function assertRuntimeAttachmentCompatible(
  storage: LoomCanonicalStorage,
  incoming: LoomRuntimeAttachment,
): Promise<void> {
  const existing = (await storage.listRuntimeAttachments(incoming.worktreeId)).find(
    (record) => record.id === incoming.id,
  );
  if (!existing) {
    return;
  }
  if (existing.updatedAt > incoming.updatedAt) {
    throw conflictError("runtime_attachment", incoming.id);
  }
  if (existing.updatedAt === incoming.updatedAt && serializeComparable(existing) !== serializeComparable(incoming)) {
    throw conflictError("runtime_attachment", incoming.id);
  }
}

function walkFiles(rootDir: string, currentDir = rootDir): string[] {
  return readdirSync(currentDir)
    .flatMap((entry) => {
      const absolutePath = path.join(currentDir, entry);
      const stats = statSync(absolutePath);
      if (stats.isDirectory()) {
        return walkFiles(rootDir, absolutePath);
      }
      return [absolutePath];
    })
    .sort((left, right) => left.localeCompare(right));
}

export async function exportSyncBundle(
  cwd: string,
  storage: LoomCanonicalStorage,
  bundleDir: string,
): Promise<{ bundle: LoomSyncBundle; files: string[] }> {
  const identity = resolveWorkspaceIdentity(cwd);
  const space = await storage.getSpace(identity.space.id);
  if (!space) {
    throw new Error(`Unknown space in catalog: ${identity.space.id}`);
  }

  const repositories = await storage.listRepositories(space.id);
  const worktrees = await storage.listWorktrees(identity.repository.id);
  const entities = await storage.listEntities(space.id);
  const links = (
    await Promise.all(entities.map((entity) => storage.listLinks(entity.id)))
  ).flat() as LoomEntityLinkRecord[];
  const events = (
    await Promise.all(entities.map((entity) => storage.listEvents(entity.id)))
  ).flat() as LoomEntityEventRecord[];
  const runtimeAttachments = (
    await Promise.all(worktrees.map((worktree) => storage.listRuntimeAttachments(worktree.id)))
  ).flat() as LoomRuntimeAttachment[];

  const bundle: LoomSyncBundle = {
    contractVersion: LOOM_STORAGE_CONTRACT_VERSION,
    exportedAt: new Date().toISOString(),
    spaceId: space.id,
    repositoryId: identity.repository.id,
  };

  writeJson(path.join(bundleDir, "bundle.json"), bundle);
  writeJson(path.join(bundleDir, "spaces.json"), [space] satisfies LoomSpaceRecord[]);
  writeJson(path.join(bundleDir, "repositories.json"), repositories satisfies LoomRepositoryRecord[]);
  writeJson(path.join(bundleDir, "worktrees.json"), worktrees satisfies LoomWorktreeRecord[]);
  writeJson(path.join(bundleDir, "entities.json"), entities satisfies LoomEntityRecord[]);
  writeJson(path.join(bundleDir, "links.json"), links);
  writeJson(path.join(bundleDir, "events.json"), events);
  writeJson(path.join(bundleDir, "runtime-attachments.json"), runtimeAttachments);

  const files = walkFiles(bundleDir).map((absolutePath) =>
    path.relative(bundleDir, absolutePath).split(path.sep).join("/"),
  );
  return { bundle, files };
}

export async function hydrateSyncBundle(
  storage: LoomCanonicalStorage,
  bundleDir: string,
): Promise<{ hydratedEntityIds: string[] }> {
  const spaces = readJson<LoomSpaceRecord[]>(path.join(bundleDir, "spaces.json"));
  const repositories = readJson<LoomRepositoryRecord[]>(path.join(bundleDir, "repositories.json"));
  const worktrees = readJson<LoomWorktreeRecord[]>(path.join(bundleDir, "worktrees.json"));
  const entities = readJson<LoomEntityRecord[]>(path.join(bundleDir, "entities.json"));
  const links = readJson<LoomEntityLinkRecord[]>(path.join(bundleDir, "links.json"));
  const events = readJson<LoomEntityEventRecord[]>(path.join(bundleDir, "events.json"));
  const runtimeAttachments = readJson<LoomRuntimeAttachment[]>(path.join(bundleDir, "runtime-attachments.json"));

  for (const space of spaces) {
    await storage.upsertSpace(space);
  }
  for (const repository of repositories) {
    await storage.upsertRepository(repository);
  }
  for (const worktree of worktrees) {
    await storage.upsertWorktree(worktree);
  }
  for (const entity of entities) {
    await assertEntityCompatible(storage, entity);
    await storage.upsertEntity(entity);
  }
  for (const link of links) {
    await storage.upsertLink(link);
  }
  for (const event of events) {
    await storage.appendEvent(event);
  }
  for (const runtimeAttachment of runtimeAttachments) {
    await assertRuntimeAttachmentCompatible(storage, runtimeAttachment);
    await storage.upsertRuntimeAttachment(runtimeAttachment);
  }

  return { hydratedEntityIds: entities.map((entity) => entity.id).sort((left, right) => left.localeCompare(right)) };
}
