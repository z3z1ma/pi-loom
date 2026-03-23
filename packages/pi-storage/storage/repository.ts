import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import type {
  LoomActiveScopeRecord,
  LoomRepositoryRecord,
  LoomSpaceRecord,
  LoomWorktreeRecord,
} from "./contract.js";
import { createRepositoryId, createSpaceId, createWorktreeId } from "./ids.js";

export interface LoomResolvedWorkspaceIdentity {
  space: LoomSpaceRecord;
  activeScope: LoomActiveScopeRecord;
  repositories: LoomRepositoryRecord[];
  worktrees: LoomWorktreeRecord[];
  repository: LoomRepositoryRecord;
  worktree: LoomWorktreeRecord;
}

function runGit(cwd: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function canonicalizeLocalPath(value: string): string {
  try {
    return realpathSync.native(value);
  } catch {
    return path.resolve(value);
  }
}

function resolveWorkspaceRoot(cwd: string): string {
  return canonicalizeLocalPath(runGit(cwd, ["rev-parse", "--show-toplevel"]) ?? cwd);
}

function isGitDirectory(cwd: string): boolean {
  return runGit(cwd, ["rev-parse", "--git-dir"]) !== null;
}

function resolveRemoteUrls(cwd: string): string[] {
  const remotes = runGit(cwd, ["remote"]);
  if (!remotes) {
    return [];
  }
  return remotes
    .split(/\r?\n/)
    .map((remote) => remote.trim())
    .filter(Boolean)
    .map((remote) => runGit(cwd, ["remote", "get-url", remote]) ?? "")
    .filter(Boolean)
    .sort();
}

function resolveDefaultBranch(cwd: string): string | null {
  const symbolic = runGit(cwd, ["symbolic-ref", "refs/remotes/origin/HEAD"]);
  if (!symbolic) {
    return null;
  }
  return symbolic.split("/").at(-1) ?? null;
}

function resolveBranch(cwd: string): string {
  return runGit(cwd, ["branch", "--show-current"]) ?? "HEAD";
}

function resolveHeadCommit(cwd: string): string | null {
  return runGit(cwd, ["rev-parse", "HEAD"]);
}

function resolveGitDir(cwd: string): string | null {
  const raw = runGit(cwd, ["rev-parse", "--absolute-git-dir"]);
  return raw ? canonicalizeLocalPath(path.resolve(cwd, raw)) : null;
}

function resolveLogicalWorktreeLabel(workspaceRoot: string, branch: string, gitDir: string | null, headCommit: string | null): string {
  const basename = path.basename(workspaceRoot);
  const locationFingerprint = gitDir ?? workspaceRoot;
  const identityFingerprint = headCommit ? `${basename}:${headCommit}` : basename;
  return `worktree:${branch}:${identityFingerprint}:${locationFingerprint}`;
}

function resolvePackageName(cwd: string): string {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
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

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "workspace"
  );
}

interface CandidateWorkspace {
  cwd: string;
  workspaceRoot: string;
  repository: LoomRepositoryRecord;
  worktree: LoomWorktreeRecord;
  isCurrent: boolean;
}

interface CollectedRepositoryCandidates {
  candidates: CandidateWorkspace[];
  startedInsideRepository: boolean;
}

function buildRepositoryCandidate(cwd: string, timestamp: string, isCurrent: boolean): CandidateWorkspace {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const remoteUrls = resolveRemoteUrls(cwd);
  const packageName = resolvePackageName(cwd);
  const repositorySlug = slugify(remoteUrls[0] ?? packageName);
  const spaceId = createSpaceId(repositorySlug);
  const repository = {
    id: createRepositoryId(remoteUrls, `${packageName}:${repositorySlug}`),
    spaceId,
    slug: repositorySlug,
    displayName: packageName,
    defaultBranch: resolveDefaultBranch(cwd),
    remoteUrls,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const branch = resolveBranch(cwd);
  const logicalKey = resolveLogicalWorktreeLabel(workspaceRoot, branch, resolveGitDir(cwd), resolveHeadCommit(cwd));
  const worktree = {
    id: createWorktreeId(repository.id, logicalKey, branch),
    repositoryId: repository.id,
    branch,
    baseRef: repository.defaultBranch ?? "HEAD",
    logicalKey,
    status: "attached" as const,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return { cwd, workspaceRoot, repository, worktree, isCurrent };
}

function listGitChildDirectories(cwd: string): string[] {
  const parentRoot = canonicalizeLocalPath(cwd);
  try {
    return readdirSync(cwd, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(cwd, entry.name))
      .filter((childPath) => {
        if (!isGitDirectory(childPath)) {
          return false;
        }
        const childRoot = resolveWorkspaceRoot(childPath);
        return childRoot === canonicalizeLocalPath(childPath) && path.dirname(childRoot) === parentRoot;
      });
  } catch {
    return [];
  }
}

function collectRepositoryCandidates(cwd: string, timestamp: string): CollectedRepositoryCandidates {
  const resolvedCwd = canonicalizeLocalPath(cwd);
  const currentRoot = isGitDirectory(cwd) ? resolveWorkspaceRoot(cwd) : null;
  const current = buildRepositoryCandidate(cwd, timestamp, true);
  if (currentRoot && currentRoot !== resolvedCwd) {
    return { candidates: [current], startedInsideRepository: true };
  }

  const childCandidates = listGitChildDirectories(resolvedCwd)
    .filter((childPath) => {
      try {
        return statSync(childPath).isDirectory();
      } catch {
        return false;
      }
    })
    .map((childPath) => buildRepositoryCandidate(childPath, timestamp, false));
  return { candidates: childCandidates.length > 0 ? childCandidates : [current], startedInsideRepository: false };
}

export function resolveWorkspaceIdentity(cwd: string): LoomResolvedWorkspaceIdentity {
  const timestamp = new Date().toISOString();
  const { candidates, startedInsideRepository } = collectRepositoryCandidates(cwd, timestamp);
  const activeCandidate = candidates.find((candidate) => candidate.isCurrent) ?? null;
  const primaryCandidate = activeCandidate ?? candidates[0] ?? null;
  const resolvedCwd = canonicalizeLocalPath(cwd);
  const isAmbiguous = !startedInsideRepository && candidates.length > 1;
  const repositorySlug = isAmbiguous
    ? slugify(path.basename(resolvedCwd))
    : (primaryCandidate?.repository.slug ?? slugify(path.basename(resolvedCwd)));
  const space = {
    id: createSpaceId(repositorySlug),
    slug: repositorySlug,
    title: isAmbiguous
      ? path.basename(resolvedCwd)
      : (primaryCandidate?.repository.displayName ?? path.basename(resolvedCwd)),
    description: "Default local Loom coordination space",
    repositoryIds: [] as string[],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const repositories = candidates.map((candidate) => ({ ...candidate.repository, spaceId: space.id }));
  const repositoryIdMap = new Map(repositories.map((repository) => [repository.id, repository]));
  const worktrees = candidates.map((candidate) => ({
    ...candidate.worktree,
    repositoryId: repositoryIdMap.get(candidate.repository.id)?.id ?? candidate.worktree.repositoryId,
  }));
  space.repositoryIds = repositories.map((repository) => repository.id);

  const repository = repositoryIdMap.get(activeCandidate?.repository.id ?? primaryCandidate?.repository.id ?? "") ?? repositories[0];
  const worktree =
    worktrees.find((entry) => entry.id === activeCandidate?.worktree.id) ??
    worktrees.find((entry) => entry.repositoryId === repository.id) ??
    worktrees[0];
  const activeScope = {
    spaceId: space.id,
    repositoryId: isAmbiguous ? null : repository.id,
    worktreeId: isAmbiguous ? null : worktree.id,
    bindingSource: "cwd" as const,
    isAmbiguous,
    candidateRepositoryIds: repositories.map((entry) => entry.id),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return { space, activeScope, repositories, worktrees, repository, worktree };
}
