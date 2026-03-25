import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  LoomActiveScopeRecord,
  LoomCanonicalStorage,
  LoomId,
  LoomRepositoryRecord,
  LoomScopeBindingSource,
  LoomSpaceRecord,
  LoomWorktreeRecord,
} from "./contract.js";
import { createRepositoryId, createSpaceId, createWorktreeId } from "./ids.js";
import { ensureLoomCatalogDirs, getLoomCatalogPaths } from "./locations.js";

export interface LoomEnrolledRepositoryRecord {
  repositoryId: LoomId;
  spaceId: LoomId;
  enrolledAt: string;
  source: "seeded" | "explicit";
  notes: string | null;
}

export interface LoomPersistedScopeBindingRecord {
  scopeRoot: string;
  spaceId: LoomId | null;
  repositoryId: LoomId | null;
  worktreeId: LoomId | null;
  bindingSource: Extract<LoomScopeBindingSource, "selection" | "persisted">;
  selectedAt: string;
  staleReason: string | null;
}

interface LoomPersistedScopeBindingLookup {
  binding: LoomPersistedScopeBindingRecord | null;
  diagnostics: string[];
}

export interface LoomWorkspaceDiscoveryCandidate {
  cwd: string;
  workspaceRoot: string;
  repository: LoomRepositoryRecord;
  worktree: LoomWorktreeRecord;
  discoverySource: "cwd" | "child";
  isCurrent: boolean;
}

export interface LoomResolvedWorkspaceIdentity {
  space: LoomSpaceRecord;
  activeScope: LoomActiveScopeRecord;
  repositories: LoomRepositoryRecord[];
  worktrees: LoomWorktreeRecord[];
  repository: LoomRepositoryRecord | null;
  worktree: LoomWorktreeRecord | null;
  discovery: {
    scopeRoot: string;
    startedInsideRepository: boolean;
    candidates: LoomWorkspaceDiscoveryCandidate[];
    binding: LoomPersistedScopeBindingRecord | null;
    enrolledRepositoryIds: LoomId[];
    discoveredUnenrolledRepositoryIds: LoomId[];
    diagnostics: string[];
  };
}

export interface LoomRepositoryCandidateSummary {
  repository: LoomRepositoryRecord;
  worktrees: LoomWorktreeRecord[];
  enrolled: boolean;
  discoverySource: LoomWorkspaceDiscoveryCandidate["discoverySource"];
  current: boolean;
  locallyAvailable: boolean;
  availableWorktreeIds: LoomId[];
  unavailableReason: string | null;
}

export interface LoomScopeDiscoveryResult {
  identity: LoomResolvedWorkspaceIdentity;
  enrolledRepositories: LoomRepositoryCandidateSummary[];
  candidateRepositories: LoomRepositoryCandidateSummary[];
  binding: LoomPersistedScopeBindingRecord | null;
  diagnostics: string[];
}

interface ScopeBindingFilePayload {
  version: 1;
  bindings: LoomPersistedScopeBindingRecord[];
}

function currentTimestamp(): string {
  return new Date().toISOString();
}

function canonicalizeLocalPath(value: string): string {
  try {
    return realpathSync.native(value);
  } catch {
    return path.resolve(value);
  }
}

function readTrimmedFile(filePath: string): string | null {
  try {
    const value = readFileSync(filePath, "utf-8").trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

interface GitLayout {
  root: string;
  gitDir: string;
  commonDir: string;
}

function resolveGitDirFromDotGit(dotGitPath: string, root: string): string | null {
  try {
    if (statSync(dotGitPath).isDirectory()) {
      return canonicalizeLocalPath(dotGitPath);
    }
    const pointer = readTrimmedFile(dotGitPath);
    const match = pointer?.match(/^gitdir:\s*(.+)$/i);
    return match ? canonicalizeLocalPath(path.resolve(root, match[1])) : null;
  } catch {
    return null;
  }
}

function resolveGitCommonDir(gitDir: string): string {
  const relative = readTrimmedFile(path.join(gitDir, "commondir"));
  return relative ? canonicalizeLocalPath(path.resolve(gitDir, relative)) : gitDir;
}

function resolveGitLayout(cwd: string): GitLayout | null {
  let current = canonicalizeLocalPath(cwd);
  while (true) {
    const dotGitPath = path.join(current, ".git");
    if (existsSync(dotGitPath)) {
      const gitDir = resolveGitDirFromDotGit(dotGitPath, current);
      if (gitDir) {
        return { root: current, gitDir, commonDir: resolveGitCommonDir(gitDir) };
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function resolveGitWorkspaceRoot(cwd: string): string | null {
  return resolveGitLayout(cwd)?.root ?? null;
}

function readGitRef(layout: GitLayout, ref: string): string | null {
  const directPaths = [...new Set([path.join(layout.gitDir, ref), path.join(layout.commonDir, ref)])];
  for (const directPath of directPaths) {
    const value = readTrimmedFile(directPath);
    if (value) {
      return value;
    }
  }

  const packedRefPaths = [
    ...new Set([path.join(layout.commonDir, "packed-refs"), path.join(layout.gitDir, "packed-refs")]),
  ];
  for (const packedRefPath of packedRefPaths) {
    const packedRefs = readTrimmedFile(packedRefPath);
    if (!packedRefs) {
      continue;
    }
    for (const line of packedRefs.split(/\r?\n/)) {
      if (!line || line.startsWith("#") || line.startsWith("^")) {
        continue;
      }
      const separator = line.indexOf(" ");
      if (separator <= 0) {
        continue;
      }
      const value = line.slice(0, separator).trim();
      const name = line.slice(separator + 1).trim();
      if (name === ref && value) {
        return value;
      }
    }
  }

  return null;
}

function resolveRemoteUrlsFromLayout(layout: GitLayout): string[] {
  const configPaths = [...new Set([path.join(layout.commonDir, "config"), path.join(layout.gitDir, "config")])];
  for (const configPath of configPaths) {
    const config = readTrimmedFile(configPath);
    if (!config) {
      continue;
    }
    const urls: string[] = [];
    let inRemoteSection = false;
    for (const line of config.split(/\r?\n/)) {
      const section = line.match(/^\s*\[(.+)]\s*$/);
      if (section) {
        inRemoteSection = /^remote\s+".+"$/i.test(section[1]?.trim() ?? "");
        continue;
      }
      if (!inRemoteSection) {
        continue;
      }
      const urlMatch = line.match(/^\s*url\s*=\s*(.+)$/i);
      if (urlMatch?.[1]) {
        urls.push(urlMatch[1].trim());
      }
    }
    if (urls.length > 0) {
      return [...new Set(urls)].sort();
    }
  }
  return [];
}

function resolveDefaultBranchFromLayout(layout: GitLayout): string | null {
  const symbolic = readGitRef(layout, "refs/remotes/origin/HEAD");
  if (!symbolic?.startsWith("ref: ")) {
    return null;
  }
  return symbolic.slice(5).trim().split("/").at(-1) ?? null;
}

function resolveBranchFromLayout(layout: GitLayout): string {
  const head = readTrimmedFile(path.join(layout.gitDir, "HEAD"));
  if (!head?.startsWith("ref: ")) {
    return "HEAD";
  }
  const ref = head.slice(5).trim();
  return ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : (ref.split("/").at(-1) ?? "HEAD");
}

function resolveHeadCommitFromLayout(layout: GitLayout): string | null {
  const head = readTrimmedFile(path.join(layout.gitDir, "HEAD"));
  if (!head) {
    return null;
  }
  if (!head.startsWith("ref: ")) {
    return head;
  }
  return readGitRef(layout, head.slice(5).trim());
}

function readPackageName(workspaceRoot: string): string {
  const packageJsonPath = path.join(workspaceRoot, "package.json");
  if (!existsSync(packageJsonPath)) {
    return path.basename(workspaceRoot);
  }
  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as { name?: string };
    return parsed.name?.trim() || path.basename(workspaceRoot);
  } catch {
    return path.basename(workspaceRoot);
  }
}

interface RepositorySnapshot {
  workspaceRoot: string;
  gitDir: string | null;
  remoteUrls: string[];
  packageName: string;
  defaultBranch: string | null;
  branch: string;
  headCommit: string | null;
}

function resolveRepositorySnapshot(cwd: string): RepositorySnapshot {
  const layout = resolveGitLayout(cwd);
  const workspaceRoot = layout?.root ?? canonicalizeLocalPath(cwd);
  return {
    workspaceRoot,
    gitDir: layout?.gitDir ?? null,
    remoteUrls: layout ? resolveRemoteUrlsFromLayout(layout) : [],
    packageName: readPackageName(workspaceRoot),
    defaultBranch: layout ? resolveDefaultBranchFromLayout(layout) : null,
    branch: layout ? resolveBranchFromLayout(layout) : "HEAD",
    headCommit: layout ? resolveHeadCommitFromLayout(layout) : null,
  };
}

export function canonicalizeScopeRoot(cwd: string): string {
  return canonicalizeLocalPath(cwd);
}

function resolveLogicalWorktreeLabel(
  workspaceRoot: string,
  branch: string,
  gitDir: string | null,
  headCommit: string | null,
): string {
  const basename = path.basename(workspaceRoot);
  const locationFingerprint = gitDir ?? workspaceRoot;
  const identityFingerprint = headCommit ? `${basename}:${headCommit}` : basename;
  return `worktree:${branch}:${identityFingerprint}:${locationFingerprint}`;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "workspace"
  );
}

function buildRepositoryCandidate(
  cwd: string,
  timestamp: string,
  discoverySource: "cwd" | "child",
  isCurrent: boolean,
): LoomWorkspaceDiscoveryCandidate {
  const snapshot = resolveRepositorySnapshot(cwd);
  const repositorySlug = slugify(snapshot.remoteUrls[0] ?? snapshot.packageName);
  const spaceId = createSpaceId(repositorySlug);
  const repository: LoomRepositoryRecord = {
    id: createRepositoryId(snapshot.remoteUrls, `${snapshot.packageName}:${repositorySlug}`),
    spaceId,
    slug: repositorySlug,
    displayName: snapshot.packageName,
    defaultBranch: snapshot.defaultBranch,
    remoteUrls: snapshot.remoteUrls,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const logicalKey = resolveLogicalWorktreeLabel(
    snapshot.workspaceRoot,
    snapshot.branch,
    snapshot.gitDir,
    snapshot.headCommit,
  );
  const worktree: LoomWorktreeRecord = {
    id: createWorktreeId(repository.id, logicalKey, snapshot.branch),
    repositoryId: repository.id,
    branch: snapshot.branch,
    baseRef: repository.defaultBranch ?? "HEAD",
    logicalKey,
    status: "attached",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return { cwd, workspaceRoot: snapshot.workspaceRoot, repository, worktree, discoverySource, isCurrent };
}

function listGitChildDirectories(cwd: string): string[] {
  const parentRoot = canonicalizeLocalPath(cwd);
  try {
    return readdirSync(cwd, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(cwd, entry.name))
      .filter((childPath) => {
        const layout = resolveGitLayout(childPath);
        if (!layout) {
          return false;
        }
        return layout.root === canonicalizeLocalPath(childPath) && path.dirname(layout.root) === parentRoot;
      });
  } catch {
    return [];
  }
}

function collectRepositoryCandidates(
  cwd: string,
  timestamp: string,
): {
  candidates: LoomWorkspaceDiscoveryCandidate[];
  startedInsideRepository: boolean;
  scopeRoot: string;
} {
  const resolvedCwd = canonicalizeLocalPath(cwd);
  const currentRoot = resolveGitLayout(cwd)?.root ?? null;
  if (currentRoot && currentRoot !== resolvedCwd) {
    return {
      candidates: [buildRepositoryCandidate(cwd, timestamp, "cwd", true)],
      startedInsideRepository: true,
      scopeRoot: currentRoot,
    };
  }

  const childCandidates = listGitChildDirectories(resolvedCwd)
    .filter((childPath) => {
      try {
        return statSync(childPath).isDirectory();
      } catch {
        return false;
      }
    })
    .map((childPath) => buildRepositoryCandidate(childPath, timestamp, "child", false));
  if (childCandidates.length > 0) {
    return {
      candidates: childCandidates,
      startedInsideRepository: false,
      scopeRoot: resolvedCwd,
    };
  }

  const current = buildRepositoryCandidate(cwd, timestamp, "cwd", true);
  return {
    candidates: [current],
    startedInsideRepository: false,
    scopeRoot: current.workspaceRoot,
  };
}

function scopeBindingsFilePath(): string {
  const root = ensureLoomCatalogDirs(getLoomCatalogPaths()).rootDir;
  const stateDir = path.join(root, "state");
  mkdirSync(stateDir, { recursive: true });
  return path.join(stateDir, "scope-bindings.json");
}

function readScopeBindingsFile(): ScopeBindingFilePayload {
  const filePath = scopeBindingsFilePath();
  if (!existsSync(filePath)) {
    return { version: 1, bindings: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as ScopeBindingFilePayload;
    if (parsed.version !== 1 || !Array.isArray(parsed.bindings)) {
      return { version: 1, bindings: [] };
    }
    return {
      version: 1,
      bindings: parsed.bindings
        .filter((entry) => entry && typeof entry.scopeRoot === "string")
        .map((entry) => ({ ...entry, scopeRoot: canonicalizeScopeRoot(entry.scopeRoot) })),
    };
  } catch {
    return { version: 1, bindings: [] };
  }
}

function writeScopeBindingsFile(payload: ScopeBindingFilePayload): void {
  writeFileSync(scopeBindingsFilePath(), `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

export function readPersistedScopeBinding(scopeRoot: string): LoomPersistedScopeBindingRecord | null {
  const canonicalScopeRoot = canonicalizeScopeRoot(scopeRoot);
  return readScopeBindingsFile().bindings.find((entry) => entry.scopeRoot === canonicalScopeRoot) ?? null;
}

function resolvePersistedScopeBinding(scopeRoot: string, spaceId: LoomId): LoomPersistedScopeBindingLookup {
  const canonicalScopeRoot = canonicalizeScopeRoot(scopeRoot);
  const payload = readScopeBindingsFile();
  const exact = payload.bindings.find((entry) => entry.scopeRoot === canonicalScopeRoot) ?? null;
  if (exact) {
    if (exact.spaceId && exact.spaceId !== spaceId) {
      return {
        binding: null,
        diagnostics: [
          `Persisted space binding ${exact.spaceId} conflicts with discovered space ${spaceId} and was ignored.`,
        ],
      };
    }
    return { binding: exact, diagnostics: [] };
  }
  const conflicting =
    payload.bindings.find((entry) => entry.spaceId === spaceId && entry.scopeRoot !== canonicalScopeRoot) ?? null;
  if (!conflicting) {
    return { binding: null, diagnostics: [] };
  }
  return {
    binding: null,
    diagnostics: [
      `Persisted binding for space ${spaceId} from ${conflicting.scopeRoot} conflicts with discovered scope ${canonicalScopeRoot} and was ignored.`,
    ],
  };
}

export function writePersistedScopeBinding(binding: LoomPersistedScopeBindingRecord): LoomPersistedScopeBindingRecord {
  const payload = readScopeBindingsFile();
  const normalized = { ...binding, scopeRoot: canonicalizeScopeRoot(binding.scopeRoot) };
  payload.bindings = payload.bindings.filter((entry) => entry.scopeRoot !== normalized.scopeRoot);
  payload.bindings.push(normalized);
  writeScopeBindingsFile(payload);
  return normalized;
}

export function clearPersistedScopeBinding(scopeRoot: string): void {
  const canonicalScopeRoot = canonicalizeScopeRoot(scopeRoot);
  const payload = readScopeBindingsFile();
  payload.bindings = payload.bindings.filter((entry) => entry.scopeRoot !== canonicalScopeRoot);
  writeScopeBindingsFile(payload);
}

export async function listEnrolledRepositoryIds(storage: LoomCanonicalStorage, spaceId: string): Promise<LoomId[]> {
  const entity = await storage.getEntityByDisplayId(spaceId, "artifact", `space-enrollment:${spaceId}`);
  if (!entity) {
    return [];
  }
  const repositoryIds = (entity.attributes.repositoryIds ?? []) as unknown;
  return Array.isArray(repositoryIds)
    ? repositoryIds.filter((value): value is string => typeof value === "string")
    : [];
}

export async function writeEnrollmentState(
  storage: LoomCanonicalStorage,
  space: LoomSpaceRecord,
  repositoryIds: LoomId[],
  timestamp: string,
): Promise<void> {
  const existing = await storage.getEntityByDisplayId(space.id, "artifact", `space-enrollment:${space.id}`);
  const version = (existing?.version ?? 0) + 1;
  const owningRepositoryId = repositoryIds.find((repositoryId) => space.repositoryIds.includes(repositoryId)) ?? null;
  await storage.upsertEntity({
    id: existing?.id ?? `artifact-space-enrollment-${space.id}`,
    kind: "artifact",
    spaceId: space.id,
    owningRepositoryId,
    displayId: `space-enrollment:${space.id}`,
    title: `${space.title} repository enrollment`,
    summary: `Enrolled repositories for ${space.title}`,
    status: "active",
    version,
    tags: ["space-enrollment"],
    attributes: {
      spaceId: space.id,
      repositoryIds: [...new Set(repositoryIds)].sort((left, right) => left.localeCompare(right)),
      updatedAt: timestamp,
    },
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  });
}

async function resolveEnrolledRepositoryIds(
  storage: LoomCanonicalStorage | undefined,
  spaceId: string,
  repositories: LoomRepositoryRecord[],
): Promise<LoomId[]> {
  if (!storage) {
    return repositories.map((repository) => repository.id);
  }
  const persisted = await listEnrolledRepositoryIds(storage, spaceId);
  if (persisted.length > 0) {
    return persisted.filter((repositoryId) => repositories.some((repository) => repository.id === repositoryId));
  }
  const seeded = repositories.map((repository) => repository.id);
  if (repositories.length > 0) {
    const timestamp = currentTimestamp();
    await writeEnrollmentState(
      storage,
      {
        id: spaceId,
        slug: repositories[0]?.slug ?? "workspace",
        title: repositories.length > 1 ? spaceId : (repositories[0]?.displayName ?? spaceId),
        description: "Default local Loom coordination space",
        repositoryIds: repositories.map((repository) => repository.id),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      seeded,
      timestamp,
    );
  }
  return seeded;
}

function buildSpace(
  scopeRoot: string,
  repositories: LoomRepositoryRecord[],
  timestamp: string,
  ambiguous: boolean,
  primaryRepository: LoomRepositoryRecord | null,
): LoomSpaceRecord {
  const repositorySlug = ambiguous
    ? slugify(path.basename(scopeRoot))
    : (primaryRepository?.slug ?? slugify(path.basename(scopeRoot)));
  return {
    id: createSpaceId(repositorySlug),
    slug: repositorySlug,
    title: ambiguous ? path.basename(scopeRoot) : (primaryRepository?.displayName ?? path.basename(scopeRoot)),
    description: "Default local Loom coordination space",
    repositoryIds: repositories.map((repository) => repository.id),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function mergeRepositories(
  canonical: LoomRepositoryRecord[],
  discovered: LoomRepositoryRecord[],
): LoomRepositoryRecord[] {
  const byId = new Map(canonical.map((repository) => [repository.id, { ...repository }]));
  for (const repository of discovered) {
    byId.set(repository.id, { ...repository });
  }
  return [...byId.values()].sort(
    (left, right) => left.displayName.localeCompare(right.displayName) || left.id.localeCompare(right.id),
  );
}

function mergeWorktrees(canonical: LoomWorktreeRecord[], discovered: LoomWorktreeRecord[]): LoomWorktreeRecord[] {
  const byId = new Map(canonical.map((worktree) => [worktree.id, { ...worktree }]));
  for (const worktree of discovered) {
    byId.set(worktree.id, { ...worktree });
  }
  return [...byId.values()].sort(
    (left, right) => left.logicalKey.localeCompare(right.logicalKey) || left.id.localeCompare(right.id),
  );
}

function resolveAvailableWorktree(
  repositoryId: LoomId,
  worktrees: LoomWorktreeRecord[],
  locallyAvailableWorktreeIds: ReadonlySet<LoomId>,
  preferredWorktreeId: LoomId | null = null,
): LoomWorktreeRecord | null {
  if (preferredWorktreeId && locallyAvailableWorktreeIds.has(preferredWorktreeId)) {
    const preferred =
      worktrees.find((worktree) => worktree.id === preferredWorktreeId && worktree.repositoryId === repositoryId) ??
      null;
    if (preferred) {
      return preferred;
    }
  }
  return (
    worktrees.find(
      (worktree) => worktree.repositoryId === repositoryId && locallyAvailableWorktreeIds.has(worktree.id),
    ) ?? null
  );
}

function chooseRepositoryBinding(
  repositories: LoomRepositoryRecord[],
  worktrees: LoomWorktreeRecord[],
  locallyAvailableWorktreeIds: ReadonlySet<LoomId>,
  startedInsideRepository: boolean,
  spaceId: LoomId,
  binding: LoomPersistedScopeBindingRecord | null,
  diagnostics: string[],
): {
  repository: LoomRepositoryRecord | null;
  worktree: LoomWorktreeRecord | null;
  bindingSource: LoomScopeBindingSource;
  isAmbiguous: boolean;
} {
  const repositoryMap = new Map(repositories.map((repository) => [repository.id, repository]));
  const ambiguousByDiscovery = !startedInsideRepository && repositories.length > 1;
  if (binding?.spaceId && binding.spaceId !== spaceId) {
    diagnostics.push(
      `Persisted space binding ${binding.spaceId} conflicts with discovered space ${spaceId} and was ignored.`,
    );
    binding = null;
  }
  if (binding?.repositoryId) {
    const repository = repositoryMap.get(binding.repositoryId) ?? null;
    const worktree = repository
      ? resolveAvailableWorktree(repository.id, worktrees, locallyAvailableWorktreeIds, binding.worktreeId)
      : null;
    if (!repository) {
      diagnostics.push(`Persisted repository binding ${binding.repositoryId} is stale and was ignored.`);
    } else if (ambiguousByDiscovery && !startedInsideRepository && binding.bindingSource === "persisted") {
      diagnostics.push(
        `Using persisted repository binding ${repository.displayName} to disambiguate the active repository.`,
      );
      return {
        repository,
        worktree,
        bindingSource: "persisted",
        isAmbiguous: false,
      };
    } else if (!ambiguousByDiscovery) {
      return {
        repository,
        worktree,
        bindingSource: binding.bindingSource,
        isAmbiguous: false,
      };
    }
  }

  if (ambiguousByDiscovery) {
    return { repository: null, worktree: null, bindingSource: "cwd", isAmbiguous: true };
  }
  const repository = repositories[0] ?? null;
  const worktree = repository ? resolveAvailableWorktree(repository.id, worktrees, locallyAvailableWorktreeIds) : null;
  return { repository, worktree, bindingSource: "cwd", isAmbiguous: false };
}

async function resolveWorkspaceIdentityWithStorage(
  cwd: string,
  options: { storage?: LoomCanonicalStorage } = {},
): Promise<LoomResolvedWorkspaceIdentity> {
  const timestamp = currentTimestamp();
  const { candidates, startedInsideRepository, scopeRoot } = collectRepositoryCandidates(cwd, timestamp);
  const primaryCandidate = candidates.find((candidate) => candidate.isCurrent) ?? candidates[0] ?? null;
  const repositories = candidates.map((candidate) => ({ ...candidate.repository }));
  const ambiguousByDiscovery = !startedInsideRepository && repositories.length > 1;
  let space = buildSpace(
    scopeRoot,
    repositories,
    timestamp,
    ambiguousByDiscovery,
    primaryCandidate?.repository ?? null,
  );
  if (options.storage) {
    const exactBinding = readPersistedScopeBinding(scopeRoot);
    if (exactBinding?.spaceId && exactBinding.spaceId !== space.id) {
      const boundSpace = await options.storage.getSpace(exactBinding.spaceId);
      if (boundSpace) {
        const boundRepositories = await options.storage.listRepositories(boundSpace.id);
        const locallyDiscoveredRepositoryIds = new Set(repositories.map((repository) => repository.id));
        const bindingStillMatchesDiscovery = boundRepositories.some(
          (repository) =>
            locallyDiscoveredRepositoryIds.has(repository.id) ||
            (exactBinding.repositoryId !== null && repository.id === exactBinding.repositoryId),
        );
        if (bindingStillMatchesDiscovery) {
          space = {
            ...boundSpace,
            repositoryIds:
              boundSpace.repositoryIds.length > 0
                ? boundSpace.repositoryIds
                : boundRepositories.map((repository) => repository.id),
            updatedAt: timestamp,
          };
        }
      }
    }
  }
  let repositoriesInSpace = repositories.map((repository) => ({ ...repository, spaceId: space.id }));
  const repositoryIdMap = new Map(repositoriesInSpace.map((repository) => [repository.id, repository]));
  const locallyAvailableWorktreeIds = new Set(candidates.map((candidate) => candidate.worktree.id));
  let worktrees = candidates.map((candidate) => ({
    ...candidate.worktree,
    repositoryId: repositoryIdMap.get(candidate.repository.id)?.id ?? candidate.worktree.repositoryId,
  }));
  const persistedBinding = resolvePersistedScopeBinding(scopeRoot, space.id);
  const binding = persistedBinding.binding;
  const diagnostics: string[] = [...persistedBinding.diagnostics];
  if (options.storage) {
    const storage = options.storage;
    const canonicalRepositories = await storage.listRepositories(space.id);
    const canonicalWorktrees = (
      await Promise.all(canonicalRepositories.map((repository) => storage.listWorktrees(repository.id)))
    ).flat() as LoomWorktreeRecord[];
    repositoriesInSpace = mergeRepositories(canonicalRepositories, repositoriesInSpace);
    worktrees = mergeWorktrees(canonicalWorktrees, worktrees);
    space = {
      ...space,
      repositoryIds: repositoriesInSpace.map((repository) => repository.id),
      updatedAt: timestamp,
    };
    await storage.upsertSpace(space);
    await Promise.all(repositoriesInSpace.map((repository) => storage.upsertRepository(repository)));
    await Promise.all(worktrees.map((worktree) => storage.upsertWorktree(worktree)));

    for (const repository of repositoriesInSpace) {
      const availableWorktrees = worktrees.filter(
        (worktree) => worktree.repositoryId === repository.id && locallyAvailableWorktreeIds.has(worktree.id),
      );
      if (availableWorktrees.length > 0) {
        continue;
      }
      const knownWorktrees = worktrees.filter((worktree) => worktree.repositoryId === repository.id);
      const knownWorktreeSummary =
        knownWorktrees.length > 0
          ? `Known worktrees: ${knownWorktrees.map((worktree) => `${worktree.branch} [${worktree.id}]`).join(", ")}.`
          : "No canonical worktree records are available for this repository.";
      diagnostics.push(
        `Repository ${repository.displayName} (${repository.id}) is canonically present in space ${space.id} but has no locally available worktree under ${scopeRoot}. Space-level reads remain available; repository-bound operations require reattaching a local clone/worktree or selecting an available repository. ${knownWorktreeSummary}`,
      );
    }
  }
  const enrolledRepositoryIds = await resolveEnrolledRepositoryIds(options.storage, space.id, repositoriesInSpace);
  const selected = chooseRepositoryBinding(
    repositoriesInSpace,
    worktrees,
    locallyAvailableWorktreeIds,
    startedInsideRepository,
    space.id,
    binding,
    diagnostics,
  );
  const activeScope: LoomActiveScopeRecord = {
    spaceId: space.id,
    repositoryId: selected.repository?.id ?? null,
    worktreeId: selected.worktree?.id ?? null,
    bindingSource: selected.bindingSource,
    isAmbiguous: selected.isAmbiguous,
    candidateRepositoryIds: repositoriesInSpace.map((repository) => repository.id),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return {
    space,
    activeScope,
    repositories: repositoriesInSpace,
    worktrees,
    repository: selected.repository,
    worktree: selected.worktree,
    discovery: {
      scopeRoot,
      startedInsideRepository,
      candidates,
      binding,
      enrolledRepositoryIds,
      discoveredUnenrolledRepositoryIds: repositoriesInSpace
        .map((repository) => repository.id)
        .filter((repositoryId) => !enrolledRepositoryIds.includes(repositoryId)),
      diagnostics,
    },
  };
}

export function resolveWorkspaceIdentity(cwd: string): LoomResolvedWorkspaceIdentity {
  const timestamp = currentTimestamp();
  const { candidates, startedInsideRepository, scopeRoot } = collectRepositoryCandidates(cwd, timestamp);
  const primaryCandidate = candidates.find((candidate) => candidate.isCurrent) ?? candidates[0] ?? null;
  const repositories = candidates.map((candidate) => ({ ...candidate.repository }));
  const ambiguousByDiscovery = !startedInsideRepository && repositories.length > 1;
  const space = buildSpace(
    scopeRoot,
    repositories,
    timestamp,
    ambiguousByDiscovery,
    primaryCandidate?.repository ?? null,
  );
  const repositoriesInSpace = repositories.map((repository) => ({ ...repository, spaceId: space.id }));
  const repositoryIdMap = new Map(repositoriesInSpace.map((repository) => [repository.id, repository]));
  const worktrees = candidates.map((candidate) => ({
    ...candidate.worktree,
    repositoryId: repositoryIdMap.get(candidate.repository.id)?.id ?? candidate.worktree.repositoryId,
  }));
  const persistedBinding = resolvePersistedScopeBinding(scopeRoot, space.id);
  const binding = persistedBinding.binding;
  const diagnostics: string[] = [...persistedBinding.diagnostics];
  const locallyAvailableWorktreeIds = new Set(candidates.map((candidate) => candidate.worktree.id));
  const selected = chooseRepositoryBinding(
    repositoriesInSpace,
    worktrees,
    locallyAvailableWorktreeIds,
    startedInsideRepository,
    space.id,
    binding,
    diagnostics,
  );
  return {
    space,
    activeScope: {
      spaceId: space.id,
      repositoryId: selected.repository?.id ?? null,
      worktreeId: selected.worktree?.id ?? null,
      bindingSource: selected.bindingSource,
      isAmbiguous: selected.isAmbiguous,
      candidateRepositoryIds: repositoriesInSpace.map((repository) => repository.id),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    repositories: repositoriesInSpace,
    worktrees,
    repository: selected.repository,
    worktree: selected.worktree,
    discovery: {
      scopeRoot,
      startedInsideRepository,
      candidates,
      binding,
      enrolledRepositoryIds: repositoriesInSpace.map((repository) => repository.id),
      discoveredUnenrolledRepositoryIds: [],
      diagnostics,
    },
  };
}

export async function discoverWorkspaceScope(
  cwd: string,
  storage: LoomCanonicalStorage,
): Promise<LoomScopeDiscoveryResult> {
  const identity = await resolveWorkspaceIdentityWithStorage(cwd, { storage });
  const locallyAvailableWorktreeIds = new Set(identity.discovery.candidates.map((candidate) => candidate.worktree.id));
  const worktreesByRepository = new Map<string, LoomWorktreeRecord[]>();
  for (const worktree of identity.worktrees) {
    const list = worktreesByRepository.get(worktree.repositoryId) ?? [];
    list.push(worktree);
    worktreesByRepository.set(worktree.repositoryId, list);
  }
  const summaries = identity.repositories
    .map((repository) => {
      const repositoryWorktrees = worktreesByRepository.get(repository.id) ?? [];
      const availableWorktreeIds = repositoryWorktrees
        .filter((worktree) => locallyAvailableWorktreeIds.has(worktree.id))
        .map((worktree) => worktree.id);
      return {
        repository,
        worktrees: repositoryWorktrees,
        enrolled: identity.discovery.enrolledRepositoryIds.includes(repository.id),
        discoverySource:
          identity.discovery.candidates.find((candidate) => candidate.repository.id === repository.id)
            ?.discoverySource ?? "child",
        current: identity.activeScope.repositoryId === repository.id,
        locallyAvailable: availableWorktreeIds.length > 0,
        availableWorktreeIds,
        unavailableReason:
          availableWorktreeIds.length > 0
            ? null
            : `Repository ${repository.displayName} is canonically present but has no locally available worktree under ${identity.discovery.scopeRoot}.`,
      };
    })
    .sort((left, right) => left.repository.displayName.localeCompare(right.repository.displayName));
  return {
    identity,
    enrolledRepositories: summaries.filter((entry) => entry.enrolled),
    candidateRepositories: summaries.filter((entry) => !entry.enrolled),
    binding: identity.discovery.binding,
    diagnostics: identity.discovery.diagnostics,
  };
}

export async function enrollRepositoryInScope(
  cwd: string,
  repositoryId: string,
  storage: LoomCanonicalStorage,
): Promise<LoomScopeDiscoveryResult> {
  const identity = await resolveWorkspaceIdentityWithStorage(cwd, { storage });
  if (!identity.repositories.some((repository) => repository.id === repositoryId)) {
    throw new Error(`Unknown repository ${repositoryId} for scope ${identity.discovery.scopeRoot}.`);
  }
  const next = [...new Set([...identity.discovery.enrolledRepositoryIds, repositoryId])];
  await writeEnrollmentState(storage, identity.space, next, currentTimestamp());
  return discoverWorkspaceScope(cwd, storage);
}

export async function unenrollRepositoryInScope(
  cwd: string,
  repositoryId: string,
  storage: LoomCanonicalStorage,
): Promise<LoomScopeDiscoveryResult> {
  const identity = await resolveWorkspaceIdentityWithStorage(cwd, { storage });
  const next = identity.discovery.enrolledRepositoryIds.filter((value) => value !== repositoryId);
  await writeEnrollmentState(storage, identity.space, next, currentTimestamp());
  if (identity.activeScope.repositoryId === repositoryId) {
    clearPersistedScopeBinding(identity.discovery.scopeRoot);
  }
  return discoverWorkspaceScope(cwd, storage);
}

export async function selectActiveScope(
  cwd: string,
  input: { repositoryId?: string | null; worktreeId?: string | null; persist?: boolean },
  storage: LoomCanonicalStorage,
): Promise<LoomResolvedWorkspaceIdentity> {
  const identity = await resolveWorkspaceIdentityWithStorage(cwd, { storage });
  const locallyAvailableWorktreeIds = new Set(identity.discovery.candidates.map((candidate) => candidate.worktree.id));
  const repositoryId = input.repositoryId ?? null;
  const worktreeId = input.worktreeId ?? null;
  if (repositoryId && !identity.discovery.enrolledRepositoryIds.includes(repositoryId)) {
    throw new Error(`Repository ${repositoryId} is not enrolled in active scope ${identity.space.id}.`);
  }
  if (repositoryId && !identity.repositories.some((repository) => repository.id === repositoryId)) {
    throw new Error(`Unknown repository ${repositoryId} for active scope ${identity.space.id}.`);
  }
  if (worktreeId && !identity.worktrees.some((worktree) => worktree.id === worktreeId)) {
    throw new Error(`Unknown worktree ${worktreeId} for active scope ${identity.space.id}.`);
  }
  const directWorktree = worktreeId ? (identity.worktrees.find((entry) => entry.id === worktreeId) ?? null) : null;
  const repository = repositoryId
    ? (identity.repositories.find((entry) => entry.id === repositoryId) ?? null)
    : directWorktree
      ? (identity.repositories.find((entry) => entry.id === directWorktree.repositoryId) ?? null)
      : null;
  if (repository && directWorktree && directWorktree.repositoryId !== repository.id) {
    throw new Error(`Worktree ${directWorktree.id} does not belong to repository ${repository.id}.`);
  }
  if (directWorktree && !locallyAvailableWorktreeIds.has(directWorktree.id)) {
    throw new Error(
      `Worktree ${directWorktree.id} for repository ${directWorktree.repositoryId} is canonically present in space ${identity.space.id} but not locally available under ${identity.discovery.scopeRoot}. Reattach the local clone/worktree or select an available repository before repository-bound operations.`,
    );
  }
  const worktree =
    directWorktree ??
    (repository ? resolveAvailableWorktree(repository.id, identity.worktrees, locallyAvailableWorktreeIds) : null);
  if (repository && !worktree) {
    throw new Error(
      `Repository ${repository.displayName} [${repository.id}] is canonically present in space ${identity.space.id} but has no locally available worktree under ${identity.discovery.scopeRoot}. Reattach a local clone/worktree or select an available repository before repository-bound operations.`,
    );
  }
  const timestamp = currentTimestamp();
  writePersistedScopeBinding({
    scopeRoot: identity.discovery.scopeRoot,
    spaceId: identity.space.id,
    repositoryId,
    worktreeId,
    bindingSource: input.persist === false ? "selection" : "persisted",
    selectedAt: timestamp,
    staleReason: null,
  });
  const bindingSource = input.persist === false ? "selection" : "persisted";
  if (!repository || !worktree) {
    throw new Error("Active scope selection did not resolve to a repository/worktree.");
  }
  return {
    ...identity,
    repository,
    worktree,
    activeScope: {
      ...identity.activeScope,
      repositoryId: repository.id,
      worktreeId: worktree.id,
      bindingSource,
      isAmbiguous: false,
      updatedAt: timestamp,
    },
    discovery: {
      ...identity.discovery,
      binding: {
        scopeRoot: identity.discovery.scopeRoot,
        spaceId: identity.space.id,
        repositoryId: repository.id,
        worktreeId: worktree.id,
        bindingSource,
        selectedAt: timestamp,
        staleReason: null,
      },
      diagnostics: identity.discovery.diagnostics,
    },
  } as LoomResolvedWorkspaceIdentity;
}

export function requireResolvedRepositoryIdentity(
  identity: LoomResolvedWorkspaceIdentity,
): LoomResolvedWorkspaceIdentity & {
  repository: LoomRepositoryRecord;
  worktree: LoomWorktreeRecord;
} {
  if (identity.repository && !identity.worktree) {
    throw new Error(
      `Repository ${identity.repository.displayName} [${identity.repository.id}] is selected in space ${identity.space.id} but has no locally available worktree under ${identity.discovery.scopeRoot}. Reattach a local clone/worktree or select an available repository before repository-bound operations.`,
    );
  }
  if (!identity.repository || !identity.worktree) {
    throw new Error(
      `Active scope for ${identity.space.id} is ambiguous; select a repository before repository-bound operations.`,
    );
  }
  return identity as LoomResolvedWorkspaceIdentity & { repository: LoomRepositoryRecord; worktree: LoomWorktreeRecord };
}

export function revokeActiveScopeSelection(cwd: string): void {
  clearPersistedScopeBinding(cwd);
}
