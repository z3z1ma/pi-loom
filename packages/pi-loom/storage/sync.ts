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

export type LoomSyncBundleScope =
  | { kind: "space" }
  | { kind: "repository"; repositoryId: string }
  | { kind: "worktree"; repositoryId: string; worktreeId: string };

export type LoomSyncExportScopeInput =
  | { kind: "space" }
  | { kind: "repository"; repositoryId: string }
  | { kind: "worktree"; worktreeId: string };

export interface LoomSyncBundle {
  contractVersion: typeof LOOM_STORAGE_CONTRACT_VERSION;
  exportedAt: string;
  spaceId: string;
  scope: LoomSyncBundleScope;
  partial: boolean;
}

export interface ExportSyncBundleOptions {
  scope?: LoomSyncExportScopeInput;
}

interface LegacyLoomSyncBundle {
  contractVersion: typeof LOOM_STORAGE_CONTRACT_VERSION;
  exportedAt: string;
  spaceId: string;
  repositoryId?: string;
  scope?: LoomSyncBundleScope;
  partial?: boolean;
}

interface SyncConflictContext {
  bundleScope: string;
  repositoriesById: Map<string, LoomRepositoryRecord>;
  worktreesById: Map<string, LoomWorktreeRecord>;
  entitiesById: Map<string, LoomEntityRecord>;
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

function describeRepository(repositoryId: string, repositoriesById: Map<string, LoomRepositoryRecord>): string {
  const repository = repositoriesById.get(repositoryId);
  return repository ? `repository ${repository.displayName} (${repository.id})` : `repository ${repositoryId}`;
}

function describeWorktree(
  worktreeId: string,
  worktreesById: Map<string, LoomWorktreeRecord>,
  repositoriesById: Map<string, LoomRepositoryRecord>,
): string {
  const worktree = worktreesById.get(worktreeId);
  if (!worktree) {
    return `worktree ${worktreeId}`;
  }
  return `${describeRepository(worktree.repositoryId, repositoriesById)} worktree ${worktree.branch} (${worktree.id})`;
}

function describeBundleScope(
  bundle: LoomSyncBundle,
  repositoriesById: Map<string, LoomRepositoryRecord>,
  worktreesById: Map<string, LoomWorktreeRecord>,
): string {
  switch (bundle.scope.kind) {
    case "space":
      return `space ${bundle.spaceId}`;
    case "repository":
      return describeRepository(bundle.scope.repositoryId, repositoriesById);
    case "worktree":
      return describeWorktree(bundle.scope.worktreeId, worktreesById, repositoriesById);
  }
}

function describeEntityScope(entity: LoomEntityRecord, context: SyncConflictContext): string {
  const repositoryScope = entity.owningRepositoryId
    ? describeRepository(entity.owningRepositoryId, context.repositoriesById)
    : `space ${entity.spaceId}`;
  return `${repositoryScope} entity ${entity.displayId ?? entity.id}`;
}

function conflictError(kind: string, id: string, detail: string): Error {
  return new Error(`Sync conflict detected for ${kind} ${id}: ${detail}`);
}

function normalizeBundle(
  raw: LegacyLoomSyncBundle,
  repositories: LoomRepositoryRecord[],
  worktrees: LoomWorktreeRecord[],
): LoomSyncBundle {
  const repositoriesById = new Map(repositories.map((repository) => [repository.id, repository]));
  const worktreesById = new Map(worktrees.map((worktree) => [worktree.id, worktree]));

  if (raw.scope?.kind === "space") {
    return {
      contractVersion: raw.contractVersion,
      exportedAt: raw.exportedAt,
      spaceId: raw.spaceId,
      scope: raw.scope,
      partial: false,
    };
  }

  if (raw.scope?.kind === "repository") {
    if (!repositoriesById.has(raw.scope.repositoryId)) {
      throw new Error(`Bundle metadata references unknown repository ${raw.scope.repositoryId}.`);
    }
    return {
      contractVersion: raw.contractVersion,
      exportedAt: raw.exportedAt,
      spaceId: raw.spaceId,
      scope: raw.scope,
      partial: true,
    };
  }

  if (raw.scope?.kind === "worktree") {
    const worktree = worktreesById.get(raw.scope.worktreeId);
    if (!worktree) {
      throw new Error(`Bundle metadata references unknown worktree ${raw.scope.worktreeId}.`);
    }
    return {
      contractVersion: raw.contractVersion,
      exportedAt: raw.exportedAt,
      spaceId: raw.spaceId,
      scope: { kind: "worktree", repositoryId: worktree.repositoryId, worktreeId: worktree.id },
      partial: true,
    };
  }

  if (raw.repositoryId) {
    if (!repositoriesById.has(raw.repositoryId)) {
      throw new Error(`Legacy bundle metadata references unknown repository ${raw.repositoryId}.`);
    }
    return {
      contractVersion: raw.contractVersion,
      exportedAt: raw.exportedAt,
      spaceId: raw.spaceId,
      scope: { kind: "repository", repositoryId: raw.repositoryId },
      partial: true,
    };
  }

  return {
    contractVersion: raw.contractVersion,
    exportedAt: raw.exportedAt,
    spaceId: raw.spaceId,
    scope: { kind: "space" },
    partial: raw.partial ?? false,
  };
}

function resolveExportScope(
  requestedScope: LoomSyncExportScopeInput | undefined,
  repositories: LoomRepositoryRecord[],
  worktrees: LoomWorktreeRecord[],
): LoomSyncBundleScope {
  if (!requestedScope || requestedScope.kind === "space") {
    return { kind: "space" };
  }

  if (requestedScope.kind === "repository") {
    const repository = repositories.find((candidate) => candidate.id === requestedScope.repositoryId);
    if (!repository) {
      throw new Error(
        `Cannot export repository-scoped bundle; repository ${requestedScope.repositoryId} is not in scope.`,
      );
    }
    return { kind: "repository", repositoryId: repository.id };
  }

  const worktree = worktrees.find((candidate) => candidate.id === requestedScope.worktreeId);
  if (!worktree) {
    throw new Error(`Cannot export worktree-scoped bundle; worktree ${requestedScope.worktreeId} is not in scope.`);
  }
  return { kind: "worktree", repositoryId: worktree.repositoryId, worktreeId: worktree.id };
}

function repositoryIdsForScope(scope: LoomSyncBundleScope, repositories: LoomRepositoryRecord[]): string[] {
  return scope.kind === "space" ? repositories.map((repository) => repository.id) : [scope.repositoryId];
}

function worktreeIdsForScope(scope: LoomSyncBundleScope, worktrees: LoomWorktreeRecord[]): string[] {
  if (scope.kind === "space") {
    return worktrees.map((worktree) => worktree.id);
  }
  if (scope.kind === "repository") {
    return worktrees.filter((worktree) => worktree.repositoryId === scope.repositoryId).map((worktree) => worktree.id);
  }
  return [scope.worktreeId];
}

async function assertEntityCompatible(
  storage: LoomCanonicalStorage,
  incoming: LoomEntityRecord,
  context: SyncConflictContext,
): Promise<void> {
  const existing = await storage.getEntity(incoming.id);
  if (!existing) {
    return;
  }
  if (existing.version > incoming.version) {
    throw conflictError(
      "entity",
      incoming.id,
      `${describeEntityScope(incoming, context)} is newer in the destination catalog while hydrating ${context.bundleScope}. Re-export after reconciling repository state.`,
    );
  }
  if (existing.version === incoming.version && serializeComparable(existing) !== serializeComparable(incoming)) {
    throw conflictError(
      "entity",
      incoming.id,
      `${describeEntityScope(incoming, context)} differs from the destination catalog while hydrating ${context.bundleScope}. Import into a clean catalog or reconcile the repository-scoped records first.`,
    );
  }
}

async function assertRuntimeAttachmentCompatible(
  storage: LoomCanonicalStorage,
  incoming: LoomRuntimeAttachment,
  context: SyncConflictContext,
): Promise<void> {
  const existing = (await storage.listRuntimeAttachments(incoming.worktreeId)).find(
    (record) => record.id === incoming.id,
  );
  if (!existing) {
    return;
  }
  if (existing.updatedAt > incoming.updatedAt) {
    throw conflictError(
      "runtime_attachment",
      incoming.id,
      `${describeWorktree(incoming.worktreeId, context.worktreesById, context.repositoriesById)} has a newer runtime attachment in the destination catalog while hydrating ${context.bundleScope}. Remove the stale local attachment or re-export from the newer worktree.`,
    );
  }
  if (existing.updatedAt === incoming.updatedAt && serializeComparable(existing) !== serializeComparable(incoming)) {
    throw conflictError(
      "runtime_attachment",
      incoming.id,
      `${describeWorktree(incoming.worktreeId, context.worktreesById, context.repositoriesById)} has conflicting runtime attachment metadata while hydrating ${context.bundleScope}. Remove the stale local attachment or re-export from the authoritative worktree.`,
    );
  }
}

export async function exportSyncBundle(
  cwd: string,
  storage: LoomCanonicalStorage,
  bundleDir: string,
  options: ExportSyncBundleOptions = {},
): Promise<{ bundle: LoomSyncBundle; files: string[] }> {
  const identity = resolveWorkspaceIdentity(cwd);
  const space = await storage.getSpace(identity.space.id);
  if (!space) {
    throw new Error(`Unknown space in catalog: ${identity.space.id}`);
  }

  const repositories = await storage.listRepositories(space.id);
  const worktrees = (
    await Promise.all(repositories.map((repository) => storage.listWorktrees(repository.id)))
  ).flat() as LoomWorktreeRecord[];
  const scope = resolveExportScope(options.scope, repositories, worktrees);
  const scopedRepositoryIds = new Set(repositoryIdsForScope(scope, repositories));
  const scopedWorktreeIds = new Set(worktreeIdsForScope(scope, worktrees));
  const scopedRepositories = repositories.filter((repository) => scopedRepositoryIds.has(repository.id));
  const scopedWorktrees = worktrees.filter((worktree) => scopedWorktreeIds.has(worktree.id));
  const entities = (await storage.listEntities(space.id)).filter((entity) => {
    if (scope.kind === "space") {
      return true;
    }
    return entity.owningRepositoryId ? scopedRepositoryIds.has(entity.owningRepositoryId) : false;
  });
  const entityIds = new Set(entities.map((entity) => entity.id));
  const links = (await Promise.all(entities.map((entity) => storage.listLinks(entity.id))))
    .flat()
    .filter((link) => entityIds.has(link.fromEntityId) && entityIds.has(link.toEntityId)) as LoomEntityLinkRecord[];
  const events = (
    await Promise.all(entities.map((entity) => storage.listEvents(entity.id)))
  ).flat() as LoomEntityEventRecord[];
  const runtimeAttachments = (
    await Promise.all(scopedWorktrees.map((worktree) => storage.listRuntimeAttachments(worktree.id)))
  ).flat() as LoomRuntimeAttachment[];

  const bundle: LoomSyncBundle = {
    contractVersion: LOOM_STORAGE_CONTRACT_VERSION,
    exportedAt: new Date().toISOString(),
    spaceId: space.id,
    scope,
    partial: scope.kind !== "space",
  };

  writeJson(path.join(bundleDir, "bundle.json"), bundle);
  writeJson(path.join(bundleDir, "spaces.json"), [space] satisfies LoomSpaceRecord[]);
  writeJson(path.join(bundleDir, "repositories.json"), scopedRepositories satisfies LoomRepositoryRecord[]);
  writeJson(path.join(bundleDir, "worktrees.json"), scopedWorktrees satisfies LoomWorktreeRecord[]);
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
): Promise<{ hydratedEntityIds: string[]; bundle: LoomSyncBundle }> {
  const rawBundle = readJson<LegacyLoomSyncBundle>(path.join(bundleDir, "bundle.json"));
  const spaces = readJson<LoomSpaceRecord[]>(path.join(bundleDir, "spaces.json"));
  const repositories = readJson<LoomRepositoryRecord[]>(path.join(bundleDir, "repositories.json"));
  const worktrees = readJson<LoomWorktreeRecord[]>(path.join(bundleDir, "worktrees.json"));
  const entities = readJson<LoomEntityRecord[]>(path.join(bundleDir, "entities.json"));
  const links = readJson<LoomEntityLinkRecord[]>(path.join(bundleDir, "links.json"));
  const events = readJson<LoomEntityEventRecord[]>(path.join(bundleDir, "events.json"));
  const runtimeAttachments = readJson<LoomRuntimeAttachment[]>(path.join(bundleDir, "runtime-attachments.json"));
  const bundle = normalizeBundle(rawBundle, repositories, worktrees);
  const repositoriesById = new Map(repositories.map((repository) => [repository.id, repository]));
  const worktreesById = new Map(worktrees.map((worktree) => [worktree.id, worktree]));
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
  const context: SyncConflictContext = {
    bundleScope: describeBundleScope(bundle, repositoriesById, worktreesById),
    repositoriesById,
    worktreesById,
    entitiesById,
  };

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
    await assertEntityCompatible(storage, entity, context);
    await storage.upsertEntity(entity);
  }
  for (const link of links) {
    await storage.upsertLink(link);
  }
  for (const event of events) {
    const existing = await storage.listEvents(event.entityId);
    const sameSequence = existing.find((candidate) => candidate.sequence === event.sequence);
    if (sameSequence) {
      if (JSON.stringify(sameSequence) !== JSON.stringify(event)) {
        const entity = entitiesById.get(event.entityId);
        throw conflictError(
          "event",
          `${event.entityId}#${event.sequence}`,
          `${entity ? describeEntityScope(entity, context) : `entity ${event.entityId}`} has diverging event history while hydrating ${context.bundleScope}. Import into a clean catalog or replay the authoritative repository history before retrying.`,
        );
      }
      continue;
    }
    await storage.appendEvent(event);
  }
  for (const runtimeAttachment of runtimeAttachments) {
    await assertRuntimeAttachmentCompatible(storage, runtimeAttachment, context);
    await storage.upsertRuntimeAttachment(runtimeAttachment);
  }

  return {
    hydratedEntityIds: entities.map((entity) => entity.id).sort((left, right) => left.localeCompare(right)),
    bundle,
  };
}
