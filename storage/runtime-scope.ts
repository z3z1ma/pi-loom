import path from "node:path";
import type { LoomEntityKind } from "./contract.js";
import { resolveGitWorkspaceRoot } from "./scope.js";
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

function isPathWithin(basePath: string, targetPath: string): boolean {
  const resolvedBasePath = path.resolve(basePath);
  const resolvedTargetPath = path.resolve(targetPath);
  if (resolvedBasePath === resolvedTargetPath) {
    return true;
  }

  const relativePath = path.relative(resolvedBasePath, resolvedTargetPath);
  return relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

export function resolveRuntimeScopeCwd(cwd: string, env: NodeJS.ProcessEnv = process.env): string {
  const resolvedCwd = path.resolve(cwd);
  const pwd = normalizeEnvValue(env.PWD);
  if (!pwd) {
    return resolvedCwd;
  }

  const resolvedPwd = path.resolve(pwd);
  if (resolvedPwd === resolvedCwd) {
    return resolvedCwd;
  }

  const cwdWorktreeRoot = resolveGitWorkspaceRoot(resolvedCwd);
  const pwdWorktreeRoot = resolveGitWorkspaceRoot(resolvedPwd);
  if (
    pwdWorktreeRoot &&
    (!cwdWorktreeRoot || path.resolve(cwdWorktreeRoot) !== path.resolve(pwdWorktreeRoot)) &&
    isPathWithin(resolvedCwd, resolvedPwd)
  ) {
    // Long-lived tool hosts can retain the parent repo/worktree as ctx.cwd even when the session
    // has moved into a nested Ralph worktree under that same workspace tree. Prefer PWD when it
    // points at a different git root nested below the host-provided cwd.
    return resolvedPwd;
  }

  return resolvedCwd;
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

export function readRuntimeScopeFromEnvForCwd(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): LoomExplicitScopeInput | undefined {
  const scope = readRuntimeScopeFromEnv(env);
  if (!scope) {
    return undefined;
  }

  const worktreePath = normalizeEnvValue(env[PI_LOOM_RUNTIME_WORKTREE_PATH_ENV]);
  if (!worktreePath) {
    return scope;
  }

  const matchCwd = resolveRuntimeScopeCwd(cwd, env);
  const cwdWorktreeRoot = resolveGitWorkspaceRoot(matchCwd);
  if (cwdWorktreeRoot) {
    // Managed Ralph worktrees live under the main repo's directory tree. Require the actual
    // current git worktree root to match the scoped worktree path so parent-repo env scope
    // does not leak into a nested child worktree session.
    return path.resolve(cwdWorktreeRoot) === path.resolve(worktreePath) ? scope : undefined;
  }

  return isPathWithin(worktreePath, matchCwd) ? scope : undefined;
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
  const worktreeId = identity.worktree.id;
  const candidate = identity.discovery.candidates.find((c) => c.worktree.id === worktreeId);
  const worktreePath = candidate?.workspaceRoot ?? identity.discovery.scopeRoot;

  return {
    spaceId: identity.space.id,
    repositoryId: identity.repository.id,
    worktreeId,
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
