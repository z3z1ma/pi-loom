import path, { resolve } from "node:path";
import type { LoomRepositoryRecord, LoomWorktreeRecord } from "./contract.js";
import type { LoomExplicitScopeInput } from "./workspace.js";
import { openWorkspaceStorage } from "./workspace.js";

export interface LoomPortableRepositoryPath {
  repositoryId: string;
  repositorySlug: string;
  worktreeId: string | null;
  relativePath: string;
  displayPath: string;
}

export interface LoomPortableRepositoryPathFallback {
  repositoryId: string;
  repositorySlug: string;
  worktreeId?: string | null;
}

interface ParsedQualifiedRepositoryPath {
  repositorySlug: string;
  relativePath: string;
}

function normalizeScope(scope: LoomExplicitScopeInput | undefined): Required<LoomExplicitScopeInput> {
  return {
    spaceId: scope?.spaceId ?? null,
    repositoryId: scope?.repositoryId ?? null,
    worktreeId: scope?.worktreeId ?? null,
  };
}

function normalizeRepositorySlug(value: string): string {
  return value.trim().toLowerCase();
}

function parseQualifiedRepositoryPath(
  value: string,
  repositories: readonly LoomRepositoryRecord[],
): ParsedQualifiedRepositoryPath | null {
  const separatorIndex = value.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }
  const prefix = value.slice(0, separatorIndex);
  if (prefix.includes("/") || prefix.includes("\\")) {
    return null;
  }
  const repositorySlug = normalizeRepositorySlug(prefix);
  if (!repositories.some((repository) => normalizeRepositorySlug(repository.slug) === repositorySlug)) {
    return null;
  }
  return {
    repositorySlug,
    relativePath: value.slice(separatorIndex + 1),
  };
}

export function normalizePortableRelativePath(value: string): string {
  const normalized = path.posix.normalize(value.split(path.sep).join(path.posix.sep).trim());
  if (!normalized || normalized === ".") {
    throw new Error("Repository-relative path must not be empty.");
  }
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Repository-relative path ${value} escapes the repository root.`);
  }
  if (path.posix.isAbsolute(normalized)) {
    throw new Error(`Repository-relative path ${value} must not be absolute.`);
  }
  return normalized;
}

export function createPortableRepositoryPath(input: {
  repositoryId: string;
  repositorySlug: string;
  worktreeId: string | null;
  relativePath: string;
}): LoomPortableRepositoryPath {
  const relativePath = normalizePortableRelativePath(input.relativePath);
  const repositorySlug = input.repositorySlug.trim();
  if (!repositorySlug) {
    throw new Error("Portable repository path requires a repository slug.");
  }
  return {
    repositoryId: input.repositoryId.trim(),
    repositorySlug,
    worktreeId: input.worktreeId?.trim() || null,
    relativePath,
    displayPath: `${repositorySlug}:${relativePath}`,
  };
}

export function renderPortableRepositoryPath(pathRef: LoomPortableRepositoryPath): string {
  return pathRef.displayPath;
}

export function renderPortableRepositoryPathList(paths: readonly LoomPortableRepositoryPath[]): string[] {
  return paths.map((entry) => renderPortableRepositoryPath(entry));
}

function resolveRepositoryById(
  repositories: readonly LoomRepositoryRecord[],
  repositoryId: string | null,
): LoomRepositoryRecord | null {
  if (!repositoryId) {
    return null;
  }
  return repositories.find((repository) => repository.id === repositoryId) ?? null;
}

function resolveRepositoryBySlug(
  repositories: readonly LoomRepositoryRecord[],
  repositorySlug: string,
): LoomRepositoryRecord | null {
  return repositories.find((repository) => normalizeRepositorySlug(repository.slug) === repositorySlug) ?? null;
}

function resolveWorktreeById(
  worktrees: readonly LoomWorktreeRecord[],
  worktreeId: string | null,
): LoomWorktreeRecord | null {
  if (!worktreeId) {
    return null;
  }
  return worktrees.find((worktree) => worktree.id === worktreeId) ?? null;
}

function localWorktreesForRepository(
  identity: Awaited<ReturnType<typeof openWorkspaceStorage>>["identity"],
  repositoryId: string,
): LoomWorktreeRecord[] {
  const seen = new Set<string>();
  const localWorktrees: LoomWorktreeRecord[] = [];
  for (const candidate of identity.discovery.candidates) {
    if (candidate.repository.id !== repositoryId) {
      continue;
    }
    if (seen.has(candidate.worktree.id)) {
      continue;
    }
    seen.add(candidate.worktree.id);
    localWorktrees.push(candidate.worktree);
  }
  return localWorktrees;
}

function resolveScopedRepositoryAndWorktree(
  identity: Awaited<ReturnType<typeof openWorkspaceStorage>>["identity"],
  scope: Required<LoomExplicitScopeInput>,
): { repository: LoomRepositoryRecord | null; worktree: LoomWorktreeRecord | null } {
  const scopedWorktree = resolveWorktreeById(identity.worktrees, scope.worktreeId);
  if (scope.worktreeId && !scopedWorktree) {
    throw new Error(`Unknown worktree ${scope.worktreeId} for active scope ${identity.space.id}.`);
  }

  const scopedRepository = scope.repositoryId
    ? resolveRepositoryById(identity.repositories, scope.repositoryId)
    : scopedWorktree
      ? resolveRepositoryById(identity.repositories, scopedWorktree.repositoryId)
      : null;
  if ((scope.repositoryId || scope.worktreeId) && !scopedRepository) {
    const label = scope.repositoryId ?? scope.worktreeId ?? "(none)";
    throw new Error(`Unknown repository scope ${label} for active scope ${identity.space.id}.`);
  }
  if (scopedRepository && scopedWorktree && scopedWorktree.repositoryId !== scopedRepository.id) {
    throw new Error(`Worktree ${scopedWorktree.id} does not belong to repository ${scopedRepository.id}.`);
  }

  if (scopedRepository || scopedWorktree) {
    return {
      repository: scopedRepository,
      worktree: scopedWorktree,
    };
  }

  if (!identity.activeScope.isAmbiguous && identity.repository && identity.worktree) {
    return {
      repository: identity.repository,
      worktree: identity.worktree,
    };
  }

  return { repository: null, worktree: null };
}

function resolveWorktreeForRepository(
  identity: Awaited<ReturnType<typeof openWorkspaceStorage>>["identity"],
  repository: LoomRepositoryRecord,
  scope: Required<LoomExplicitScopeInput>,
  pathInput: string,
): LoomWorktreeRecord {
  const scopedWorktree = resolveWorktreeById(identity.worktrees, scope.worktreeId);
  if (scopedWorktree) {
    if (scopedWorktree.repositoryId !== repository.id) {
      throw new Error(
        `Path ${pathInput} targets repository ${repository.slug}, but worktree ${scopedWorktree.id} belongs to a different repository.`,
      );
    }
    return scopedWorktree;
  }

  if (!identity.activeScope.isAmbiguous && identity.repository?.id === repository.id && identity.worktree) {
    return identity.worktree;
  }

  const localWorktrees = localWorktreesForRepository(identity, repository.id);
  if (localWorktrees.length === 1) {
    return localWorktrees[0] as LoomWorktreeRecord;
  }
  if (localWorktrees.length === 0) {
    throw new Error(
      `Repository ${repository.displayName} [${repository.id}] is not locally available; cannot resolve ${pathInput}.`,
    );
  }
  throw new Error(
    `Path ${pathInput} is ambiguous because repository ${repository.displayName} [${repository.id}] has multiple local worktrees; provide an explicit worktree scope.`,
  );
}

export async function resolvePortableRepositoryPathInputs(
  cwd: string,
  inputs: readonly string[] | undefined,
  scope: LoomExplicitScopeInput = {},
): Promise<LoomPortableRepositoryPath[]> {
  const normalizedInputs = [...(inputs ?? [])].map((value) => value.trim()).filter((value) => value.length > 0);
  if (normalizedInputs.length === 0) {
    return [];
  }

  const { identity } = await openWorkspaceStorage(cwd);
  const normalizedScope = normalizeScope(scope);
  const scoped = resolveScopedRepositoryAndWorktree(identity, normalizedScope);

  return normalizedInputs.map((input) => {
    if (path.isAbsolute(input)) {
      throw new Error(
        `Repository-qualified path ${input} must be relative; absolute machine-local paths are not allowed.`,
      );
    }

    const qualified = parseQualifiedRepositoryPath(input, identity.repositories);
    if (qualified) {
      const repository = resolveRepositoryBySlug(identity.repositories, qualified.repositorySlug);
      if (!repository) {
        throw new Error(`Unknown repository slug ${qualified.repositorySlug} in path ${input}.`);
      }
      const worktree = resolveWorktreeForRepository(identity, repository, normalizedScope, input);
      return createPortableRepositoryPath({
        repositoryId: repository.id,
        repositorySlug: repository.slug,
        worktreeId: worktree.id,
        relativePath: qualified.relativePath,
      });
    }

    if (!scoped.repository || !scoped.worktree) {
      throw new Error(
        `Path ${input} is ambiguous in the active multi-repository scope; select a repository/worktree or qualify it as <repository-slug>:<path>.`,
      );
    }

    return createPortableRepositoryPath({
      repositoryId: scoped.repository.id,
      repositorySlug: scoped.repository.slug,
      worktreeId: scoped.worktree.id,
      relativePath: input,
    });
  });
}

export function normalizeStoredPortableRepositoryPath(
  value: unknown,
  fallback?: LoomPortableRepositoryPathFallback | null,
): LoomPortableRepositoryPath {
  if (value && typeof value === "object") {
    const record = value as Partial<LoomPortableRepositoryPath>;
    if (
      typeof record.repositoryId === "string" &&
      typeof record.repositorySlug === "string" &&
      typeof record.relativePath === "string"
    ) {
      return createPortableRepositoryPath({
        repositoryId: record.repositoryId,
        repositorySlug: record.repositorySlug,
        worktreeId: typeof record.worktreeId === "string" ? record.worktreeId : null,
        relativePath: record.relativePath,
      });
    }
  }

  if (typeof value === "string") {
    if (!fallback?.repositoryId || !fallback.repositorySlug) {
      throw new Error(
        `Legacy repository path ${value} is missing repository attribution required for multi-repository safety.`,
      );
    }
    const qualified = parseQualifiedRepositoryPath(value, [
      {
        id: fallback.repositoryId,
        spaceId: "",
        slug: fallback.repositorySlug,
        displayName: fallback.repositorySlug,
        defaultBranch: null,
        remoteUrls: [],
        createdAt: "",
        updatedAt: "",
      },
    ]);
    return createPortableRepositoryPath({
      repositoryId: fallback.repositoryId,
      repositorySlug: fallback.repositorySlug,
      worktreeId: fallback.worktreeId ?? null,
      relativePath: qualified?.relativePath ?? value,
    });
  }

  throw new Error("Portable repository path entry is invalid.");
}

export function normalizeStoredPortableRepositoryPathList(
  value: unknown,
  fallback?: LoomPortableRepositoryPathFallback | null,
): LoomPortableRepositoryPath[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("Portable repository path list is invalid.");
  }
  return value.map((entry) => normalizeStoredPortableRepositoryPath(entry, fallback));
}

export async function resolvePortableRepositoryPathToAbsolute(
  cwd: string,
  pathRef: LoomPortableRepositoryPath,
): Promise<string> {
  const { identity } = await openWorkspaceStorage(cwd);
  const repository = resolveRepositoryById(identity.repositories, pathRef.repositoryId);
  if (!repository) {
    throw new Error(`Unknown repository ${pathRef.repositoryId} for path ${pathRef.displayPath}.`);
  }

  const matchingCandidate =
    (pathRef.worktreeId
      ? identity.discovery.candidates.find(
          (candidate) => candidate.repository.id === repository.id && candidate.worktree.id === pathRef.worktreeId,
        )
      : null) ??
    (pathRef.worktreeId
      ? null
      : identity.discovery.candidates.find((candidate) => candidate.repository.id === repository.id));

  if (!matchingCandidate) {
    throw new Error(
      `Repository ${repository.displayName} [${repository.id}] has no locally available worktree for ${pathRef.displayPath}.`,
    );
  }

  const segments = pathRef.relativePath.split(path.posix.sep).filter(Boolean);
  return resolve(matchingCandidate.workspaceRoot, ...segments);
}
