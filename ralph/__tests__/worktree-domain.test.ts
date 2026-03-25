import * as fs from "node:fs";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { provisionWorktree } from "../domain/worktree.js";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

import { execFileSync } from "node:child_process";

describe("worktree domain", () => {
  const mockRepoRoot = "/tmp/repo";

  beforeEach(() => {
    vi.resetAllMocks();
    (fs.existsSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  describe("provisionWorktree", () => {
    it("returns existing path if branch is already checked out", () => {
      const branchName = "feature/test";
      const existingPath = "/tmp/repo/.ralph-worktrees/feature-test";
      const worktreeOutput = `worktree ${existingPath}
HEAD 123456
branch refs/heads/${branchName}

`;
      (execFileSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(worktreeOutput);

      const result = provisionWorktree(mockRepoRoot, branchName);

      expect(result).toBe(existingPath);
      expect(execFileSync).not.toHaveBeenCalledWith(
        "git",
        expect.arrayContaining(["worktree", "add"]),
        expect.anything(),
      );
    });

    it("creates a new worktree with -b when the branch does not exist yet", () => {
      const branchName = "feature/new";
      const expectedPath = path.join(mockRepoRoot, ".ralph-worktrees", "feature-new");

      (execFileSync as unknown as ReturnType<typeof vi.fn>).mockImplementation((_cmd: string, args: string[]) => {
        if (args.includes("worktree") && args.includes("list")) {
          return "";
        }
        if (args.includes("branch") && args.includes("--list")) {
          return "";
        }
        return "";
      });

      const result = provisionWorktree(mockRepoRoot, branchName);

      expect(result).toBe(expectedPath);
      expect(fs.mkdirSync).toHaveBeenCalledWith(path.join(mockRepoRoot, ".ralph-worktrees"), { recursive: true });
      expect(execFileSync).toHaveBeenCalledWith(
        "git",
        ["worktree", "add", "-b", branchName, expectedPath],
        expect.objectContaining({ cwd: mockRepoRoot }),
      );
    });

    it("attaches an existing branch without -b when the branch already exists", () => {
      const branchName = "feature/existing";
      const expectedPath = path.join(mockRepoRoot, ".ralph-worktrees", "feature-existing");

      (execFileSync as unknown as ReturnType<typeof vi.fn>).mockImplementation((_cmd: string, args: string[]) => {
        if (args.includes("worktree") && args.includes("list")) {
          return "";
        }
        if (args.includes("branch") && args.includes("--list")) {
          return branchName;
        }
        return "";
      });

      const result = provisionWorktree(mockRepoRoot, branchName);

      expect(result).toBe(expectedPath);
      expect(execFileSync).toHaveBeenCalledWith(
        "git",
        ["worktree", "add", expectedPath, branchName],
        expect.objectContaining({ cwd: mockRepoRoot }),
      );
    });
  });
});
