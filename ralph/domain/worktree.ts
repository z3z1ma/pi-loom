import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { reserveBranchFamilyName } from "#storage/branch-reservations.js";
import { findEntityByDisplayId } from "#storage/entities.js";
import { openRepositoryWorkspaceStorage } from "#storage/workspace.js";
import type { TicketReadResult } from "#ticketing/domain/models.js";

export interface ManagedWorktreeBranchRequest {
  cwd: string;
  repositoryId: string;
  ticket: TicketReadResult;
  ownerKey: string;
  metadata?: Record<string, unknown>;
}

interface WorktreeDetail {
  path: string;
  head: string;
  branch: string | null;
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
    .map((branch) => branch.trim())
    .filter(Boolean);
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
      if (current.path) {
        worktrees.push(current as WorktreeDetail);
        current = {};
      }
      current.path = value;
    } else if (key === "HEAD") {
      current.head = value;
    } else if (key === "branch") {
      current.branch = value.replace(/^refs\/heads\//, "");
    }
  }

  if (current.path) {
    worktrees.push(current as WorktreeDetail);
  }

  return worktrees;
}

export async function resolveManagedWorktreeBranchName({
  cwd,
  repositoryId,
  ticket,
  ownerKey,
  metadata,
}: ManagedWorktreeBranchRequest): Promise<string> {
  const branchMode = ticket.ticket.frontmatter["branch-mode"];
  const branchFamily = ticket.ticket.frontmatter["branch-family"];
  const exactBranchName = ticket.ticket.frontmatter["exact-branch-name"];

  if (branchMode === "exact") {
    if (!exactBranchName) {
      throw new Error(`Ticket ${ticket.summary.id} is in exact branch mode but has no exact branch name.`);
    }
    return exactBranchName;
  }

  const resolvedFamily = branchMode === "allocator" ? branchFamily : `ralph/${ticket.summary.id}`;
  if (!resolvedFamily) {
    throw new Error(
      `Ticket ${ticket.summary.id} must declare a branch family for allocator-backed worktree execution.`,
    );
  }

  const { storage, identity } = await openRepositoryWorkspaceStorage(cwd, { repositoryId });
  const ticketEntity = await findEntityByDisplayId(storage, identity.space.id, "ticket", ticket.summary.id);
  const reservation = await reserveBranchFamilyName(storage, {
    repositoryId,
    branchFamily: resolvedFamily,
    ownerKey,
    ownerEntityId: ticketEntity?.id ?? null,
    ownerEntityKind: ticketEntity ? "ticket" : null,
    timestamp: new Date().toISOString(),
    metadata: {
      source: "managed-worktree",
      ticketId: ticket.summary.id,
      ticketRef: ticket.summary.ref,
      branchMode,
      ...(metadata ?? {}),
    },
  });
  return reservation.branchName;
}

export function provisionWorktree(repoRoot: string, branchName: string): string {
  const worktrees = listWorktreesDetails(repoRoot);
  const existing = worktrees.find((worktree) => worktree.branch === branchName);
  if (existing) {
    return existing.path;
  }

  const worktreesDir = path.join(repoRoot, ".ralph-worktrees");
  if (!fs.existsSync(worktreesDir)) {
    fs.mkdirSync(worktreesDir, { recursive: true });
  }

  const safeBranchName = branchName.replace(/\//g, "-");
  const worktreePath = path.join(worktreesDir, safeBranchName);
  if (fs.existsSync(worktreePath)) {
    execGit(repoRoot, ["worktree", "prune"]);
    if (fs.existsSync(worktreePath)) {
      throw new Error(`Worktree path ${worktreePath} exists but is not a valid worktree. Please clean up manually.`);
    }
  }

  const branchExists = listBranches(repoRoot).includes(branchName);
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

export function generatePatch(worktreeRoot: string, baseRef: string | null): string {
  const args = ["diff"];
  args.push(baseRef ?? "HEAD");
  return execGit(worktreeRoot, args);
}

export function getWorktreeEnv(originalRepoRoot: string): Record<string, string> {
  return {
    PI_LOOM_ROOT: originalRepoRoot,
  };
}
