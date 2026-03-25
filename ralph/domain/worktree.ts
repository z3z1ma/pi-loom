import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export interface WorktreeNamingContext {
  ref: string;
  externalRefs?: string[];
}

function execGit(repoRoot: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    }).trim();
  } catch (error) {
    const gitError = error as { status?: number; stderr?: string };
    if (gitError.status && gitError.stderr) {
      throw new Error(`Git command failed: git ${args.join(" ")}\n${gitError.stderr}`);
    }
    throw error;
  }
}

function listBranches(repoRoot: string): string[] {
  const output = execGit(repoRoot, ["branch", "--list", "--format=%(refname:short)"]);
  return output
    .split("\n")
    .map((b) => b.trim())
    .filter(Boolean);
}

interface WorktreeDetail {
  path: string;
  head: string;
  branch: string | null;
}

function listWorktreesDetails(repoRoot: string): WorktreeDetail[] {
  const output = execGit(repoRoot, ["worktree", "list", "--porcelain"]);
  const worktrees: WorktreeDetail[] = [];

  let current: Partial<WorktreeDetail> = {};

  for (const line of output.split("\n")) {
    if (!line.trim()) {
      if (current.path) {
        worktrees.push(current as WorktreeDetail);
        current = {};
      }
      continue;
    }

    const [key, ...rest] = line.split(" ");
    const value = rest.join(" ");

    if (key === "worktree") {
      // Start of a new worktree stanza (or potentially the first one)
      if (current.path) {
        worktrees.push(current as WorktreeDetail);
        current = {};
      }
      current.path = value;
    } else if (key === "HEAD") {
      current.head = value;
    } else if (key === "branch") {
      // branch refs/heads/foo
      current.branch = value.replace(/^refs\/heads\//, "");
    }
  }

  if (current.path) {
    worktrees.push(current as WorktreeDetail);
  }

  return worktrees;
}

/**
 * Resolves a target branch name for a NEW Ralph run.
 *
 * Logic:
 * 1. Base name is "ralph/<ticket-ref>".
 * 2. If the branch exists, append -1, -2, etc. until a unique name is found.
 */
export function resolveUniqueWorktreeName(
  ticket: WorktreeNamingContext,
  repoRoot: string,
  preferExternalRef: boolean,
): string {
  let baseName = `ralph/${ticket.ref.replace(/:/g, "-")}`;

  if (preferExternalRef && ticket.externalRefs && ticket.externalRefs.length > 0) {
    const firstRef = ticket.externalRefs[0];
    if (firstRef) {
      // Sanitize: replace spaces, slashes, colons with dashes.
      // Keep alphanumeric, dot, underscore, dash.
      const sanitized = firstRef.replace(/[^a-zA-Z0-9._-]/g, "-");
      baseName = sanitized;
    }
  }

  const existingBranches = new Set(listBranches(repoRoot));

  if (!existingBranches.has(baseName)) {
    return baseName;
  }

  let counter = 1;
  while (true) {
    const candidate = `${baseName}-${counter}`;
    if (!existingBranches.has(candidate)) {
      return candidate;
    }
    counter++;
  }
}

/**
 * Resolves the LATEST existing branch name for a ticket.
 *
 * Logic:
 * 1. Determine base name.
 * 2. Scan existing branches.
 * 3. Find matches for `baseName` or `baseName-<N>`.
 * 4. Return the one with highest N.
 * 5. If none, return `baseName` (so provisionWorktree will create it).
 */
export function resolveLatestWorktreeName(
  ticket: WorktreeNamingContext,
  repoRoot: string,
  preferExternalRef: boolean,
): string {
  let baseName = `ralph/${ticket.ref.replace(/:/g, "-")}`;

  if (preferExternalRef && ticket.externalRefs && ticket.externalRefs.length > 0) {
    const firstRef = ticket.externalRefs[0];
    if (firstRef) {
      const sanitized = firstRef.replace(/[^a-zA-Z0-9._-]/g, "-");
      baseName = sanitized;
    }
  }

  const branches = listBranches(repoRoot);
  // Matches baseName or baseName-N
  // Need to escape baseName for regex safety
  const escapedBase = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedBase}(?:-(\\d+))?$`);

  let maxSuffix = -1;
  let found = false;

  for (const branch of branches) {
    const match = branch.match(pattern);
    if (match) {
      found = true;
      const suffixStr = match[1];
      const suffix = suffixStr ? parseInt(suffixStr, 10) : 0;
      if (suffix > maxSuffix) {
        maxSuffix = suffix;
      }
    }
  }

  if (!found) {
    return baseName;
  }

  return maxSuffix === 0 ? baseName : `${baseName}-${maxSuffix}`;
}

/**
 * Provisions a git worktree for the given branch.
 *
 * If the branch is already checked out in a worktree, returns that worktree's path.
 * Otherwise, creates a new worktree at <repoRoot>/.ralph-worktrees/<safeBranchName>.
 *
 * @param repoRoot The root of the main repository.
 * @param branchName The name of the branch to use.
 * @returns The absolute path to the worktree root.
 */
export function provisionWorktree(repoRoot: string, branchName: string): string {
  // 1. Check if branch is already checked out in a worktree
  const worktrees = listWorktreesDetails(repoRoot);
  const existing = worktrees.find((wt) => wt.branch === branchName);

  if (existing) {
    return existing.path;
  }

  // 2. Determine new worktree path
  const worktreesDir = path.join(repoRoot, ".ralph-worktrees");
  if (!fs.existsSync(worktreesDir)) {
    fs.mkdirSync(worktreesDir, { recursive: true });
  }

  const safeBranchName = branchName.replace(/\//g, "-");
  const worktreePath = path.join(worktreesDir, safeBranchName);

  // 3. Handle leftover directory if any (e.g. from manual deletion of worktree without prune)
  if (fs.existsSync(worktreePath)) {
    // If it's not in the worktree list (which we checked above), it might be a stale dir.
    // Or it might be the main repo? No, it's inside .ralph-worktrees.
    // Let's assume stale and try to remove? Or fail?
    // Safer to fail or use a different path.
    // But since we want deterministic paths, we should probably try to prune or warn.
    // Let's try `git worktree prune` first.
    execGit(repoRoot, ["worktree", "prune"]);

    if (fs.existsSync(worktreePath)) {
      throw new Error(`Worktree path ${worktreePath} exists but is not a valid worktree. Please clean up manually.`);
    }
  }

  // 4. Create worktree
  const branches = listBranches(repoRoot);
  const branchExists = branches.includes(branchName);

  const args = ["worktree", "add"];

  if (!branchExists) {
    args.push("-b", branchName);
  }

  args.push(worktreePath);

  if (branchExists) {
    args.push(branchName);
  }

  execGit(repoRoot, args);

  return worktreePath;
}

/**
 * Generates a patch file from the worktree changes relative to the base ref.
 *
 * @param worktreeRoot The root of the worktree.
 * @param baseRef The base reference to diff against (e.g., "main"). Defaults to "HEAD" if null.
 * @returns The content of the patch.
 */
export function generatePatch(worktreeRoot: string, baseRef: string | null): string {
  const args = ["diff"];

  if (baseRef) {
    args.push(baseRef);
  } else {
    // Default to diffing against HEAD (showing staged + unstaged changes in the worktree)
    // Actually, git diff without args shows unstaged. git diff HEAD shows both.
    // Usually for a "patch" we want everything that is not committed?
    // Or everything on this branch relative to where we started?
    // Given the context of an agent run, we likely want "what did the agent do?"
    // If the agent committed, we want diff against start-point.
    // If the agent didn't commit, we want diff against HEAD.
    // The caller should control this via baseRef.
    // If baseRef is null, we'll default to HEAD to capture uncommitted changes.
    args.push("HEAD");
  }

  return execGit(worktreeRoot, args);
}

/**
 * Returns the environment variables required for running processes inside a worktree.
 *
 * Key Constraint:
 * When spawning the child process in the worktree, we MUST pass `PI_LOOM_ROOT`
 * in the environment so it connects to the shared SQLite DB.
 *
 * @param originalRepoRoot The root of the main repository (where the DB resides).
 */
export function getWorktreeEnv(originalRepoRoot: string): Record<string, string> {
  return {
    PI_LOOM_ROOT: originalRepoRoot,
  };
}
