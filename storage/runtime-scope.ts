import type { LoomEntityKind } from "./contract.js";
import type { LoomExplicitScopeInput } from "./workspace.js";
import { findEntityByDisplayId, openScopedWorkspaceStorage, openWorkspaceStorage } from "./workspace.js";

export const PI_LOOM_RUNTIME_SPACE_ID_ENV = "PI_LOOM_RUNTIME_SPACE_ID";
export const PI_LOOM_RUNTIME_REPOSITORY_ID_ENV = "PI_LOOM_RUNTIME_REPOSITORY_ID";
export const PI_LOOM_RUNTIME_WORKTREE_ID_ENV = "PI_LOOM_RUNTIME_WORKTREE_ID";
export const PI_LOOM_RUNTIME_WORKTREE_PATH_ENV = "PI_LOOM_RUNTIME_WORKTREE_PATH";

export interface LoomRuntimeScope {
  spaceId: string;
  repositoryId: string;
  worktreeId: string;
  worktreePath: string;
  repositoryRoot?: string;
}

function normalizeEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function readRuntimeScopeFromEnv(env: NodeJS.ProcessEnv = process.env): LoomExplicitScopeInput | undefined {
  const spaceId = normalizeEnvValue(env[PI_LOOM_RUNTIME_SPACE_ID_ENV]);
  const repositoryId = normalizeEnvValue(env[PI_LOOM_RUNTIME_REPOSITORY_ID_ENV]);
  const worktreeId = normalizeEnvValue(env[PI_LOOM_RUNTIME_WORKTREE_ID_ENV]);
  if (!spaceId && !repositoryId && !worktreeId) {
    return undefined;
  }
  return {
    spaceId: spaceId ?? null,
    repositoryId: repositoryId ?? null,
    worktreeId: worktreeId ?? null,
  };
}

export function runtimeScopeToEnv(scope: LoomRuntimeScope): Record<string, string> {
  return {
    [PI_LOOM_RUNTIME_SPACE_ID_ENV]: scope.spaceId,
    [PI_LOOM_RUNTIME_REPOSITORY_ID_ENV]: scope.repositoryId,
    [PI_LOOM_RUNTIME_WORKTREE_ID_ENV]: scope.worktreeId,
    [PI_LOOM_RUNTIME_WORKTREE_PATH_ENV]: scope.worktreePath,
  };
}

export async function resolveRuntimeScope(cwd: string, scope?: LoomExplicitScopeInput): Promise<LoomRuntimeScope> {
  const { identity } = await openScopedWorkspaceStorage(cwd, scope);
  if (!identity.repository || !identity.worktree || identity.activeScope.isAmbiguous) {
    throw new Error(
      `Cannot resolve an explicit runtime scope for ${cwd}; select or provide a repository/worktree before launching repo-sensitive runtime work.`,
    );
  }
  const candidate = identity.discovery.candidates.find((c) => c.worktree.id === identity.worktree!.id);
  const worktreePath = candidate?.workspaceRoot ?? identity.discovery.scopeRoot;

  return {
    spaceId: identity.space.id,
    repositoryId: identity.repository.id,
    worktreeId: identity.worktree.id,
    worktreePath,
    repositoryRoot: identity.discovery.scopeRoot,
  };
}

export async function resolveEntityRuntimeScope(
  cwd: string,
  kind: LoomEntityKind,
  displayId: string,
): Promise<LoomRuntimeScope> {
  const { storage, identity } = await openWorkspaceStorage(cwd);
  const entity = await findEntityByDisplayId(storage, identity.space.id, kind, displayId);
  if (!entity) {
    throw new Error(`Unknown ${kind} ${displayId}; cannot resolve runtime scope.`);
  }
  if (!entity.owningRepositoryId) {
    throw new Error(`${kind} ${displayId} is not scoped to a repository; cannot launch repo-sensitive runtime work.`);
  }
  return resolveRuntimeScope(cwd, { repositoryId: entity.owningRepositoryId });
}
