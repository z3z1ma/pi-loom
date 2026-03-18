import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { LoomRepositoryRecord, LoomSpaceRecord, LoomWorktreeRecord } from "./contract.js";
import { createRepositoryId, createSpaceId, createWorktreeId } from "./ids.js";

export interface LoomResolvedWorkspaceIdentity {
  space: LoomSpaceRecord;
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

function resolveWorkspaceRoot(cwd: string): string {
  return runGit(cwd, ["rev-parse", "--show-toplevel"]) ?? path.resolve(cwd);
}

function resolveCommonDir(cwd: string): string {
  const gitCommonDir = runGit(cwd, ["rev-parse", "--git-common-dir"]);
  if (gitCommonDir) {
    return path.resolve(cwd, gitCommonDir);
  }
  return resolveWorkspaceRoot(cwd);
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

function resolveLogicalWorktreeLabel(workspaceRoot: string, branch: string): string {
  return `worktree:${branch}:${path.basename(workspaceRoot)}`;
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

export function resolveWorkspaceIdentity(cwd: string): LoomResolvedWorkspaceIdentity {
  const timestamp = new Date().toISOString();
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const commonDir = resolveCommonDir(cwd);
  const remoteUrls = resolveRemoteUrls(cwd);
  const packageName = resolvePackageName(cwd);
  const repositorySlug = slugify(remoteUrls[0] ?? packageName);
  const space = {
    id: createSpaceId(repositorySlug),
    slug: repositorySlug,
    title: packageName,
    description: "Default local Loom coordination space",
    repositoryIds: [] as string[],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const repository = {
    id: createRepositoryId(remoteUrls, commonDir),
    spaceId: space.id,
    slug: repositorySlug,
    displayName: packageName,
    defaultBranch: resolveDefaultBranch(cwd),
    remoteUrls,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const branch = resolveBranch(cwd);
  const logicalKey = resolveLogicalWorktreeLabel(workspaceRoot, branch);
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
  space.repositoryIds = [repository.id];
  return { space, repository, worktree };
}
